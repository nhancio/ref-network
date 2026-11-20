import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from './server.mjs';

test('the public landing, its assets, and the existing workspace are reachable', async (t) => {
  const app = createApp({ database: ':memory:', demo: false });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const [landing, image, style, workspace, graph, scene, network, client, three, core] = await Promise.all(
    ['/landing', '/landing-hero.jpg', '/landing.css', '/', '/referral-graph.js', '/network-scene.js', '/network', '/personal-network.js',
      '/vendor/three.module.min.js', '/vendor/three.core.min.js'].map((path) => fetch(base + path)),
  );
  assert.equal(landing.status, 200);
  const html = await landing.text();
  assert.match(html, /href="#how-it-works"/);
  assert.match(html, /id="referral-network"/);
  assert.match(html, /src="\/referral-graph\.js"/);
  assert.match(html, /href="\/network"/);
  assert.match(html, /href="\/"[^>]*>Open merchant workspace/);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
  await image.arrayBuffer();
  assert.equal(style.status, 200);
  await style.text();
  assert.match(await workspace.text(), /src="\/app\.js"/);
  assert.equal(network.status, 200);
  assert.match(await network.text(), /src="\/personal-network\.js"/);
  for (const script of [graph, scene, client, three, core]) {
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
    await script.text();
  }
});

async function referralClients(t) {
  const app = createApp({ database: ':memory:', demo: false });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;

  const client = () => {
    const cookies = new Map();
    return async (path, input, expected = 200) => {
      const headers = { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') };
      if (input !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(base + path, {
        method: input === undefined ? 'GET' : 'POST',
        headers,
        body: input === undefined ? undefined : JSON.stringify(input),
      });
      const data = await response.json();
      assert.equal(response.status, expected, JSON.stringify(data));
      for (const cookie of response.headers.getSetCookie()) {
        const [key, value] = cookie.split(';')[0].split('=');
        cookies.set(key, value);
      }
      return data;
    };
  };

  const owner = client();
  await owner('/api/session', { key: app.ownerKey });
  return { owner, client };
}

const terms = {
    title: 'Friends of the shop', business: 'Mango Yard', description: 'Good for any purchase.',
    discountType: 'percent', discount: '12', minimum: '500', reward: '75',
    access: 'link', ends: '', cap: '1',
};

test('a referral can be claimed, approved when required, and redeemed once', async (t) => {
  const { owner, client } = await referralClients(t);
  const buyer = client();
  const anotherBuyer = client();
  await buyer('/api/dashboard', undefined, 401);
  const { id } = await owner('/api/campaigns', terms, 201);
  const { token } = await owner(`/api/campaigns/${id}/links`, { advocate: 'Nithin', singleUse: false }, 201);
  const { token: otherLink } = await owner(`/api/campaigns/${id}/links`, { advocate: 'Riya', singleUse: false }, 201);
  const page = await buyer(`/api/offers/${token}`);
  assert.equal(page.advocate, 'Nithin');
  assert.equal(page.reward, undefined);
  const offer = await buyer(`/api/offers/${token}/claim`, {}, 201);
  assert.equal(offer.status, 'approved');
  assert.equal((await buyer(`/api/offers/${otherLink}/claim`, {}, 201)).code, offer.code);
  assert.equal((await anotherBuyer(`/api/offers/${token}`)).available, false);
  assert.match((await anotherBuyer(`/api/offers/${token}/claim`, {}, 409)).error, /no longer available/);

  await owner('/api/redeem', { code: offer.code, total: '499.99' }, 409);
  const result = await owner('/api/redeem', { code: offer.code.toLowerCase(), total: '1000.01' });
  assert.equal(result.discount, 12000);
  assert.equal(result.due, 88001);
  assert.equal(result.reward, 7500);
  assert.equal(result.advocate, 'Nithin');
  await owner('/api/redeem', { code: offer.code, total: '1000.01' }, 409);
  assert.equal((await buyer(`/api/offers/${token}`)).claim.status, 'redeemed');
  assert.equal((await owner('/api/dashboard')).metrics.reward, 7500);

  const { id: approvalId } = await owner('/api/campaigns', {
    ...terms, access: 'approval', discountType: 'fixed', discount: '100', minimum: '0', cap: '',
  }, 201);
  const personal = await owner(`/api/campaigns/${approvalId}/links`, { advocate: 'Asha', singleUse: true }, 201);
  const pending = await buyer(`/api/offers/${personal.token}/claim`, {}, 201);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.code, null);
  assert.equal((await anotherBuyer(`/api/offers/${personal.token}`)).available, false);
  assert.match((await anotherBuyer(`/api/offers/${personal.token}/claim`, {}, 409)).error, /no longer available/);
  await owner(`/api/claims/${pending.id}/decision`, { decision: 'approve' });
  const approved = (await buyer(`/api/offers/${personal.token}`)).claim;
  assert.ok(approved.code);
  await owner(`/api/campaigns/${approvalId}/status`, { active: false });
  const { token: pausedLink } = await owner(`/api/campaigns/${approvalId}/links`, { advocate: 'Riya', singleUse: false }, 201);
  assert.equal((await anotherBuyer(`/api/offers/${pausedLink}`)).available, false);
  await owner(`/api/campaigns/${approvalId}/status`, { active: true });
  await owner(`/api/links/${pausedLink}/revoke`, {});
  assert.equal((await anotherBuyer(`/api/offers/${pausedLink}`)).available, false);
  await owner(`/api/campaigns/${approvalId}/status`, { active: false });
  const smallOrder = await owner('/api/redeem', { code: approved.code, total: '50' });
  assert.equal(smallOrder.discount, 5000);
  assert.equal(smallOrder.due, 0);

  const { id: expiredId } = await owner('/api/campaigns', { ...terms, ends: '2025-01-01' }, 201);
  await owner(`/api/campaigns/${expiredId}/links`, { advocate: 'Nithin', singleUse: true }, 409);
});

test('checkout applies a referral automatically and settles merchant-specific points once', async (t) => {
  const { owner, client } = await referralClients(t);
  const buyer = client();
  const rewards = client();
  const stranger = client();
  const first = await owner('/api/campaigns', terms, 201);
  const second = await owner('/api/campaigns', { ...terms, business: 'Field Supply', reward: '30' }, 201);
  const { token, profileId } = await owner(`/api/campaigns/${first.id}/links`, { advocate: 'Asha', singleUse: false }, 201);
  const secondLink = await owner(`/api/campaigns/${second.id}/links`, { profileId, singleUse: false }, 201);
  const { key } = await owner(`/api/referrers/${profileId}/invite`, {});
  await stranger('/api/rewards', undefined, 401);
  await rewards('/api/rewards/session', { key });
  await stranger('/api/rewards/session', { key }, 401);
  assert.deepEqual((await rewards('/api/rewards')).balances, []);

  const makeBill = (campaignId, bill, total = '1000') => owner('/api/checkouts', { campaignId, bill, total }, 201);
  const firstBill = await makeBill(first.id, 'R-101');
  assert.equal((await makeBill(first.id, 'R-101')).id, firstBill.id);
  await owner('/api/checkouts', { campaignId: first.id, bill: 'R-101', total: '1001' }, 409);
  await owner(`/api/checkouts/${firstBill.id}/pay`, {}, 409);
  await rewards(`/api/offers/${token}`);
  assert.equal((await rewards(`/api/checkouts/${firstBill.id}`)).discount, 0);

  await buyer(`/api/offers/${token}`);
  const view = await buyer(`/api/checkouts/${firstBill.id}`);
  assert.equal(view.discount, 12000);
  assert.equal(view.due, 88000);
  assert.equal(view.code, undefined);
  await buyer(`/api/checkouts/${firstBill.id}/ready`, { usePoints: false, expectedDue: 88000 });
  await stranger(`/api/checkouts/${firstBill.id}`, undefined, 409);
  const competing = await makeBill(first.id, 'R-104');
  assert.equal((await buyer(`/api/checkouts/${competing.id}`)).discount, 0);
  assert.deepEqual((await rewards('/api/rewards')).balances, []);
  await owner(`/api/checkouts/${firstBill.id}/pay`, {});
  await owner(`/api/checkouts/${firstBill.id}/pay`, {});
  assert.equal((await rewards('/api/rewards')).balances[0].available, 7500);

  await buyer(`/api/offers/${secondLink.token}`);
  const secondBill = await makeBill(second.id, 'R-101');
  assert.equal((await rewards(`/api/checkouts/${secondBill.id}`)).points, 0);
  const secondQuote = await buyer(`/api/checkouts/${secondBill.id}`);
  await buyer(`/api/checkouts/${secondBill.id}/ready`, { usePoints: false, expectedDue: secondQuote.due });
  await owner(`/api/checkouts/${secondBill.id}/pay`, {});
  const wallet = await rewards('/api/rewards');
  assert.deepEqual(wallet.balances.map(({ business, available }) => [business, available]), [['Field Supply', 3000], ['Mango Yard', 7500]]);

  const spend = await makeBill(first.id, 'R-102', '100');
  const otherSpend = await makeBill(first.id, 'R-103', '100');
  assert.equal((await rewards(`/api/checkouts/${spend.id}`)).points, 7500);
  await rewards(`/api/checkouts/${spend.id}/ready`, { usePoints: true, expectedDue: 2500 });
  await rewards(`/api/checkouts/${otherSpend.id}/ready`, { usePoints: true, expectedDue: 2500 }, 409);
  await owner(`/api/checkouts/${spend.id}/pay`, {});
  const after = await rewards('/api/rewards');
  assert.equal(after.balances.find((row) => row.business === 'Mango Yard').available, 0);
  assert.equal(after.balances.find((row) => row.business === 'Field Supply').available, 3000);
  assert.equal(after.activity.length, 3);

  const reserved = await makeBill(second.id, 'R-201', '100');
  await rewards(`/api/checkouts/${reserved.id}`);
  await rewards(`/api/checkouts/${reserved.id}/ready`, { usePoints: true, expectedDue: 7000 });
  assert.equal((await rewards('/api/rewards')).balances[0].held, 3000);
  await owner(`/api/checkouts/${reserved.id}/cancel`, {});
  assert.equal((await rewards('/api/rewards')).balances[0].available, 3000);
  const replacement = await makeBill(second.id, 'R-201', '120');
  assert.notEqual(replacement.id, reserved.id);
  await rewards(`/api/checkouts/${reserved.id}`, undefined, 404);
});

test('an abandoned automatic checkout releases a single-use offer', async (t) => {
  const { owner, client } = await referralClients(t);
  const firstShopper = client();
  const secondShopper = client();
  const { id } = await owner('/api/campaigns', terms, 201);
  const { token } = await owner(`/api/campaigns/${id}/links`, { advocate: 'Asha', singleUse: true }, 201);
  const offer = `/api/offers/${token}`;
  const { id: billId } = await owner('/api/checkouts', { campaignId: id, bill: 'R-101', total: '1000' }, 201);
  await firstShopper(offer);
  await firstShopper(`/api/checkouts/${billId}/ready`, { usePoints: false, expectedDue: 88000 });
  assert.equal((await secondShopper(offer)).available, false);
  await owner(`/api/checkouts/${billId}/cancel`, {});
  assert.equal((await firstShopper(offer)).claim, null);
  assert.equal((await secondShopper(offer)).available, true);
  const replacement = await owner('/api/checkouts', { campaignId: id, bill: 'R-101', total: '1000' }, 201);
  assert.equal((await secondShopper(`/api/checkouts/${replacement.id}`)).discount, 12000);
});

test('a personal network shows consented paths and gates introduction links', async (t) => {
  const { owner, client } = await referralClients(t);
  const meera = client();
  const asha = client();
  const stranger = client();
  const { id: mango } = await owner('/api/campaigns', terms, 201);
  const { id: field } = await owner('/api/campaigns', { ...terms, business: 'Field Supply' }, 201);
  const first = await owner(`/api/campaigns/${mango}/links`, { advocate: 'Asha', singleUse: false }, 201);
  const second = await owner(`/api/campaigns/${field}/links`, { profileId: first.profileId, singleUse: false }, 201);
  const personal = await owner(`/api/campaigns/${mango}/links`, { profileId: first.profileId, singleUse: true }, 201);
  const { key } = await owner(`/api/referrers/${first.profileId}/invite`, {});
  await asha('/api/rewards/session', { key });
  assert.equal((await asha('/api/network')).profile, null);
  await asha('/api/network/profile', { name: 'Asha' }, 201);
  await asha('/api/network/rewards', {});
  await meera('/api/network/profile', { name: 'Meera' }, 201);
  await stranger('/api/network/profile', { name: 'Riya' }, 201);
  const { token } = await asha('/api/network/invites', {}, 201);
  assert.equal((await meera(`/api/network/invites/${token}`)).name, 'Asha');
  const { id } = await meera(`/api/network/invites/${token}/accept`, {});
  await stranger(`/api/network/invites/${token}/accept`, {}, 409);
  assert.deepEqual((await meera('/api/network')).contacts, []);
  await meera(`/api/network/connections/${id}`, { decision: 'confirm' }, 403);
  await asha(`/api/network/connections/${id}`, { decision: 'confirm' });

  assert.deepEqual((await meera('/api/network')).contacts[0].listings, []);
  await meera(`/api/network/listings/${first.token}`, { mode: 'offer' }, 404);
  await asha(`/api/network/listings/${personal.token}`, { mode: 'offer' }, 404);
  await asha(`/api/network/listings/${first.token}`, { mode: 'offer' });
  await asha(`/api/network/listings/${second.token}`, { mode: 'intro' });
  let snapshot = await meera('/api/network');
  const direct = snapshot.contacts[0].listings.find((item) => item.business === 'Mango Yard');
  const intro = snapshot.contacts[0].listings.find((item) => item.business === 'Field Supply');
  assert.equal(direct.offerPath, `/offer/${first.token}`);
  assert.equal(intro.offerPath, null);
  assert.ok(!JSON.stringify(snapshot).includes(second.token));
  assert.deepEqual((await stranger('/api/network')).contacts, []);
  await stranger('/api/network/referrals', { listingId: intro.id }, 404);

  const request = await meera('/api/network/referrals', { listingId: intro.id }, 201);
  assert.equal((await meera('/api/network/referrals', { listingId: intro.id }, 201)).id, request.id);
  const incoming = (await asha('/api/network')).incomingReferrals[0];
  assert.equal(incoming.requester, 'Meera');
  assert.equal(incoming.business, 'Field Supply');
  await meera(`/api/network/referrals/${request.id}`, { decision: 'approve' }, 404);
  await asha(`/api/network/referrals/${request.id}`, { decision: 'approve' });
  snapshot = await meera('/api/network');
  assert.equal(snapshot.contacts[0].listings.find((item) => item.id === intro.id).offerPath, `/offer/${second.token}`);

  await asha(`/api/network/listings/${second.token}`, { mode: 'private' });
  assert.ok(!(await meera('/api/network')).contacts[0].listings.some((item) => item.id === intro.id));
  await meera(`/api/network/connections/${id}`, { decision: 'remove' });
  assert.deepEqual((await meera('/api/network')).contacts, []);
  assert.deepEqual((await asha('/api/network')).contacts, []);
  const newRewardsInvite = await owner(`/api/referrers/${first.profileId}/invite`, {});
  await owner('/api/rewards/session', { key: newRewardsInvite.key });
  assert.equal((await owner('/api/network')).profile, null);
  await owner('/api/network/profile', { name: 'Operator' }, 201);
  await owner('/api/network/rewards', {}, 409);
});
