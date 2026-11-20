const app = document.querySelector('#app');
const editor = document.querySelector('#editor');
const notice = document.querySelector('#notice');
const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2,
});

const escape = (text) => String(text ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const rupees = (paise) => currency.format(paise / 100);
const pointFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const pointsLabel = (paise) => `${pointFormat.format(paise / 100)} ${paise === 100 ? 'point' : 'pts'}`;
const benefit = (item) => item.discount_type === 'percent' ? `${item.discount}% off` : `${rupees(item.discount)} off`;
const offerPath = (token) => `/offer/${token}`;
const checkoutPath = (id) => `/checkout/${id}`;
const initial = (name) => escape([...name][0]?.toUpperCase());
const campaignStatus = (item) => item.expired ? 'Ended' : item.active ? 'Live' : 'Paused';
const dateLabel = (date) => new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
}).format(new Date(date.length === 10 ? date + 'T12:00:00Z' : date.replace(' ', 'T') + 'Z'));
const brand = '<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>Ref<span class="brand-light"> Network</span></span>';
const statusLabels = { pending: 'Awaiting review', approved: 'Claimed', declined: 'Declined', redeemed: 'Redeemed' };

let dashboard;
let selectedId;
let noticeTimer;
const offerToken = location.pathname.match(/^\/offer\/([a-f0-9]{36})$/)?.[1];
const checkoutId = location.pathname.match(/^\/checkout\/([a-f0-9]{36})$/)?.[1];
let currentCheckout;

async function api(path, input) {
  const response = await fetch(path, input === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong.');
  return data;
}

function showNotice(message) {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.hidden = false;
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 3800);
}

async function copy(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const input = document.createElement('textarea');
    input.className = 'copy-helper';
    input.value = text;
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('Open the offer and copy its address.');
  }
}

function termsFor(item) {
  const parts = [];
  if (item.minimum) parts.push(`Minimum spend ${rupees(item.minimum)}`);
  if (item.ends) parts.push(`Valid through ${dateLabel(item.ends)}`);
  return parts.map((part) => `<li>${escape(part)}</li>`).join('');
}

function linkRow(link) {
  const used = link.active && link.single_use && link.claims > 0;
  return `<li class="link-row">
    <span class="avatar" aria-hidden="true">${initial(link.advocate)}</span>
    <div class="link-name"><strong>${escape(link.advocate)}</strong>
      <span>${link.single_use ? 'Single-use invite' : 'Shareable link'} · ${link.claims} ${link.claims === 1 ? 'claim' : 'claims'}${!link.active ? ' · Revoked' : used ? ' · Used' : ''}</span>
    </div>
    <div class="link-actions">
      ${link.active && !used ? `<button class="quiet" type="button" data-action="copy-link" data-token="${link.token}" aria-label="Copy ${escape(link.advocate)}’s link">Copy</button>` : ''}
      <a class="quiet" href="${offerPath(link.token)}" target="_blank" rel="noopener">Open</a>
      <button class="quiet" type="button" data-action="rewards-invite" data-id="${link.profile_id}" aria-label="Rewards invite for ${escape(link.advocate)}">Rewards invite</button>
      ${link.active ? `<button class="quiet danger" type="button" data-action="revoke" data-token="${link.token}" aria-label="Revoke ${escape(link.advocate)}’s link">Revoke</button>` : ''}
    </div>
  </li>`;
}

function campaignDetail(item) {
  const links = dashboard.links.filter((link) => link.campaign_id === item.id);
  const useInfo = item.cap ? `${item.cap} offer limit` : 'Unlimited offers';
  return `<div class="section-heading detail-heading">
    <div><p class="eyebrow">${escape(item.business)}</p><h2>${escape(item.title)}</h2></div>
    ${!item.expired ? `<button class="secondary" type="button" data-action="status" data-id="${item.id}" data-active="${!item.active}">${item.active ? 'Pause' : 'Resume'}</button>` : ''}
  </div>
  <div class="offer-strip">
    <strong>${benefit(item)}</strong>
    <div><span>${item.access === 'link' ? 'Automatic approval' : 'Merchant approval'}</span><span>${escape(useInfo)}</span></div>
    <div><span>${item.minimum ? `${rupees(item.minimum)} minimum spend` : 'Any bill amount'}</span>
      <span>${item.reward ? `${pointsLabel(item.reward)} per referred sale` : 'No referral reward'}</span></div>
  </div>
  ${item.description ? `<p class="offer-description">${escape(item.description)}</p>` : ''}
  ${item.ends ? `<p class="small muted">Valid through ${dateLabel(item.ends)}</p>` : ''}
  <div class="section-heading links-heading">
    <div><h3>Referral links</h3><p>Give each contact their own link to share.</p></div>
    ${!item.expired ? '<button type="button" class="secondary" data-action="new-link">+ Add link</button>' : ''}
  </div>
  ${links.length ? `<ul class="links">${links.map(linkRow).join('')}</ul>` : '<p class="empty">Add your first referrer to create a link.</p>'}`;
}

function checkoutList(checkouts) {
  if (!checkouts.length) return '<p class="empty">New checkout links will appear here.</p>';
  const labels = { open: 'Awaiting shopper', ready: 'Ready to pay', paid: 'Paid', expired: 'Expired', cancelled: 'Cancelled' };
  return `<ul class="activity-list">${checkouts.map((item) => {
    const active = item.status === 'open' || item.status === 'ready';
    const due = item.subtotal - item.discount - item.points;
    return `<li class="checkout-row">
      <div><strong>${escape(item.bill)} · ${rupees(due)}</strong><small>${escape(item.business)} · ${labels[item.status]}</small>
        ${item.discount || item.points ? `<small>${rupees(item.discount + item.points)} savings</small>` : ''}</div>
      <div class="link-actions">
        ${item.status === 'open' ? `<button class="quiet" type="button" data-action="copy-checkout" data-id="${item.id}">Copy link</button>
          <a class="quiet" href="${checkoutPath(item.id)}" target="_blank" rel="noopener">Open checkout</a>` : ''}
        ${item.status === 'ready' ? `<button class="secondary" type="button" data-action="pay" data-id="${item.id}">Mark bill paid</button>` : ''}
        ${active ? `<button class="quiet danger" type="button" data-action="cancel-checkout" data-id="${item.id}" aria-label="Cancel bill ${escape(item.bill)}">Cancel</button>` : ''}
      </div>
    </li>`;
  }).join('')}</ul>`;
}

function checkoutPanel(campaigns, selected) {
  const businesses = new Map();
  for (const item of [selected, ...campaigns].filter(Boolean)) {
    const key = item.business.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!businesses.has(key)) businesses.set(key, item);
  }
  return `<section class="panel" id="checkout">
    <div class="section-heading"><div><h2>Checkout</h2><p>Create a bill link. Ref applies eligible offers when the shopper opens it.</p></div>
      <button class="quiet" type="button" data-action="refresh-checkout-list">Refresh</button></div>
    ${selected ? `<form class="checkout-form" data-form="checkout">
      <label class="wide">Business<select name="campaignId">${[...businesses.values()].map((item) =>
        `<option value="${item.id}">${escape(item.business)}</option>`).join('')}</select></label>
      <label>Bill reference<input name="bill" type="text" autocomplete="off" maxlength="50" required placeholder="BILL-104"></label>
      <label>Bill subtotal (₹)<input name="total" type="number" inputmode="decimal" min=".01" max="9999999.99" step=".01" required></label>
      <button class="primary" type="submit">Create checkout link</button>
      <p class="form-error" role="alert" hidden></p>
    </form>` : '<p class="empty">Add a campaign to set up a business for checkout.</p>'}
    <div id="checkout-list">${checkoutList(dashboard.checkouts)}</div>
  </section>`;
}

function dashboardView() {
  const { campaigns, claims, metrics } = dashboard;
  const selected = campaigns.find((item) => item.id === selectedId) ?? campaigns[0];
  selectedId = selected?.id;
  const stats = [
    [metrics.active, 'Live campaigns'], [metrics.claims, 'Claims'],
    [metrics.redeemed, 'Redemptions'], [pointFormat.format(metrics.pointsEarned / 100), 'Points earned'],
  ];

  app.innerHTML = `<header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/">${brand}</a>
      <nav aria-label="Workspace"><a href="#campaigns">Campaigns</a><a href="#checkout">Checkout</a><a href="#activity">Activity</a></nav>
      <span class="workspace-label"><i></i> Merchant workspace</span>
    </div>
  </header>
  <main class="workspace">
    <section class="hero" aria-labelledby="hero-heading">
      <div class="hero-copy">
        <h1 id="hero-heading">Referral campaigns</h1>
        <p>Create an offer, give your contacts a link, and see which introductions turn into sales.</p>
        <button type="button" class="primary" data-action="new-campaign">+ New campaign</button>
      </div>
      <div class="hero-diagram" aria-label="Your shop shares an offer through a contact, who introduces a customer.">
        <div class="diagram-node"><b aria-hidden="true">S</b><span>Your shop</span></div>
        <div class="diagram-node"><b aria-hidden="true">R</b><span>Referrer</span></div>
        <div class="diagram-node"><b aria-hidden="true">C</b><span>Customer</span></div>
      </div>
    </section>
    <section class="metrics" aria-label="Campaign totals">
      ${stats.map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('')}
    </section>
    <section id="campaigns" class="campaign-grid" aria-label="Manage campaigns">
      <div class="panel campaign-index">
        <div class="section-heading"><h2>Your campaigns</h2></div>
        <div class="campaign-list">
          ${campaigns.length ? campaigns.map((item) => `<button type="button" class="campaign-choice" data-action="select" data-id="${item.id}" aria-pressed="${item.id === selectedId}">
            <span class="campaign-name">${escape(item.title)}</span><span class="tag ${campaignStatus(item).toLowerCase()}">${campaignStatus(item)}</span>
            <span class="campaign-meta">${benefit(item)} · ${item.redeemed} redeemed</span>
          </button>`).join('') : '<p class="empty">Create an offer to start your first campaign.</p>'}
        </div>
      </div>
      <div class="panel campaign-detail">${selected ? campaignDetail(selected) : '<h2>Campaign details</h2><p class="empty">Your offer and shareable links will appear here.</p>'}</div>
    </section>
    <div class="checkout-grid">
      ${checkoutPanel(campaigns, selected)}
      <section class="panel" id="activity">
        <div class="section-heading"><div><h2>Activity</h2><p>Review claims and see completed sales.</p></div><button class="quiet" type="button" data-action="refresh">Refresh</button></div>
        ${claims.length ? `<ul class="activity-list">${claims.map((claim) => `<li>
          <div><strong>${escape(claim.title)}</strong><small>Via ${escape(claim.advocate)} · ${dateLabel(claim.created)}</small></div>
          ${claim.status === 'pending' ? `<div class="link-actions">
            <button class="secondary" data-action="decision" data-id="${claim.id}" data-decision="approve">Approve</button>
            <button class="quiet" data-action="decision" data-id="${claim.id}" data-decision="decline">Decline</button>
          </div>` : `<div class="activity-status"><span class="tag ${claim.status}">${statusLabels[claim.status]}</span>
            ${claim.status === 'redeemed' ? `<small>${rupees(claim.discount)} off${claim.points ? ` · ${pointsLabel(claim.points)} earned` : ''}</small>` : ''}</div>`}
        </li>`).join('')}</ul>` : '<p class="empty">Claims appear here when people open a referral link and claim your offer.</p>'}
      </section>
    </div>
  </main><footer class="workspace-footer"><a href="/landing">About Ref Network <span aria-hidden="true">↗</span></a></footer>`;
}

async function refreshDashboard() {
  dashboard = await api('/api/dashboard');
  dashboardView();
}

async function refreshCheckouts() {
  if (document.visibilityState !== 'visible') return;
  const list = document.querySelector('#checkout-list');
  if (!list || list.querySelector(':focus-visible')) return;
  const next = await api('/api/checkouts');
  if (!list.isConnected || list.querySelector(':focus-visible')) return;
  if (JSON.stringify(dashboard.checkouts) !== JSON.stringify(next)) {
    dashboard.checkouts = next;
    list.innerHTML = checkoutList(next);
  }
}

function campaignDialog() {
  return `<form data-form="campaign" class="edit-form">
    <div class="section-heading"><h2 id="editor-title">New campaign</h2><button class="quiet close" type="button" data-action="close" aria-label="Close">×</button></div>
    <div class="form-grid">
      <label>Campaign name<input name="title" maxlength="70" required autofocus placeholder="Friends of the shop"></label>
      <label>Business name<input name="business" maxlength="70" required placeholder="Mango Yard"></label>
      <label>Discount type<select name="discountType"><option value="percent">Percentage off</option><option value="fixed">Fixed amount off</option></select></label>
      <label>Discount <span id="discount-unit">(%)</span><input name="discount" type="number" inputmode="decimal" min="1" max="100" step="1" required></label>
      <label>Minimum spend (₹)<input name="minimum" type="number" inputmode="decimal" min="0" max="9999999.99" step=".01" placeholder="0"></label>
      <label>Points per referred sale<input name="reward" type="number" inputmode="decimal" min="0" max="9999999.99" step=".01" placeholder="0"></label>
      <label>End date<input name="ends" type="date"></label>
      <label>Offer limit<input name="cap" type="number" inputmode="numeric" min="1" max="100000" placeholder="Unlimited"></label>
      <label class="wide">Approval<select name="access"><option value="link">Automatic with a referral link</option><option value="approval">Merchant reviews each request</option></select></label>
      <label class="wide">Offer terms <span>(optional)</span><textarea name="description" maxlength="450" rows="2" placeholder="Where and when customers can use this offer"></textarea></label>
    </div>
    <p class="section-note">Each point gives ₹1 off at the business that awarded it.</p>
    <p class="form-error" role="alert" hidden></p>
    <div class="editor-actions"><button class="secondary" type="button" data-action="close">Cancel</button><button class="primary" type="submit">Create campaign</button></div>
  </form>`;
}

function linkDialog() {
  const profiles = dashboard.referrers;
  return `<form data-form="link" class="edit-form">
    <div class="section-heading"><h2 id="editor-title">Add a referral link</h2><button class="quiet close" type="button" data-action="close" aria-label="Close">×</button></div>
    ${profiles.length ? `<label>Rewards profile<select name="profileId"><option value="">Create a new profile</option>
      ${profiles.map((profile) => `<option value="${profile.id}">${escape(profile.name)}${profiles.some((other) => other.name === profile.name && other.id !== profile.id) ? ` · ${profile.id.slice(-5)}` : ''}</option>`).join('')}
    </select></label>` : ''}
    <label>Referrer name<input name="advocate" maxlength="70" required autofocus placeholder="Asha"></label>
    <label>Link type<select name="singleUse"><option value="false">Shareable link</option><option value="true">Single-use invite</option></select></label>
    <p class="section-note">Use the same rewards profile when this person refers for another business. A single-use link allows one shopper to use the offer.</p>
    <p class="form-error" role="alert" hidden></p>
    <div class="editor-actions"><button class="secondary" type="button" data-action="close">Cancel</button><button class="primary" type="submit">Create link</button></div>
  </form>`;
}

function shopperCard(item) {
  const claim = item.claim;
  if (claim?.status === 'redeemed') {
    return `<div class="claim-status"><h2>Offer redeemed</h2><p>You saved ${rupees(claim.discount)}.</p></div>`;
  }
  if (item.expired) return '<div class="claim-status"><h2>Offer ended</h2><p>The campaign has passed its end date.</p></div>';
  if (item.self) return '<div class="claim-status"><h2>Your referral link</h2><p>Share this offer with someone else. You can use your earned points on a separate bill.</p></div>';
  if (claim?.status === 'approved') {
    return '<div class="claim-status"><h2>Offer ready for checkout</h2><p>Open the business’s checkout link in this browser to apply your offer.</p></div>';
  }
  if (claim?.status === 'pending') {
    return '<div class="claim-status"><h2>Awaiting merchant approval</h2><p>Return to this link in the same browser to check your request.</p><button class="secondary" type="button" data-action="refresh-offer">Check status</button></div>';
  }
  if (claim?.status === 'declined') return '<div class="claim-status"><h2>Request declined</h2><p>The merchant declined this request.</p></div>';
  if (!item.available) return '<div class="claim-status"><h2>Offer unavailable</h2><p>This link can’t accept more claims.</p></div>';
  if (item.access === 'link') return '<div class="claim-status"><h2>Offer ready for checkout</h2><p>Ref will apply it when you open the business’s checkout link in this browser and the bill meets the terms.</p></div>';
  return '<button class="primary claim-button" type="button" data-action="claim">Request offer</button>';
}

async function renderOffer() {
  const item = await api(`/api/offers/${offerToken}`);
  document.title = `${item.business} offer · Ref Network`;
  app.innerHTML = `<main class="shopper-shell"><div class="brand shopper-brand">${brand}</div>
    <article class="ticket">
      <div class="ticket-top">
        <p class="eyebrow">${escape(item.business)}</p>
        <h1>${benefit(item)}</h1>
        <p class="ticket-title">${escape(item.title)}</p>
        <div class="endorsement"><span class="avatar" aria-hidden="true">${initial(item.advocate)}</span> Shared by <strong>${escape(item.advocate)}</strong></div>
      </div>
      <div class="ticket-body">
        ${item.description ? `<p>${escape(item.description)}</p>` : ''}
        ${item.minimum || item.ends ? `<ul class="ticket-terms">${termsFor(item)}</ul>` : ''}
        ${shopperCard(item)}
      </div>
    </article>
  </main>`;
}

function fallback(title, message) {
  app.innerHTML = `<main class="shopper-shell"><div class="brand shopper-brand">${brand}</div><section class="ticket"><div class="ticket-body">
    <h1 class="fallback-title">${escape(title)}</h1><p>${escape(message)}</p>
  </div></section></main>`;
}

async function renderCheckout() {
  const item = await api(`/api/checkouts/${checkoutId}`);
  currentCheckout = item;
  document.title = `${item.business} checkout · Ref Network`;
  const ended = item.status === 'expired' || item.status === 'cancelled';
  const summary = {
    open: item.discount ? 'Referral offer applied' : 'Review your bill',
    ready: 'Ready at the counter', paid: 'Bill marked paid', expired: 'Checkout expired', cancelled: 'Checkout cancelled',
  };
  app.innerHTML = `<main class="shopper-shell"><div class="brand shopper-brand">${brand}</div>
    <article class="ticket checkout-ticket"><div class="ticket-top">
      <p class="eyebrow">${escape(item.business)} · ${escape(item.bill)}</p>
      <h1 class="fallback-title">${summary[item.status]}</h1>
      ${item.advocate && !ended ? `<p class="section-note">Referred by ${escape(item.advocate)}</p>` : ''}
    </div><div class="ticket-body">
      ${ended ? '<p>Ask the business for an updated checkout link.</p>' : `
        <dl class="bill-breakdown">
          <div><dt>Bill subtotal</dt><dd>${rupees(item.subtotal)}</dd></div>
          ${item.discount ? `<div class="bill-saving"><dt>Referral discount</dt><dd>−${rupees(item.discount)}</dd></div>` : ''}
          ${item.status !== 'open' && item.points ? `<div class="bill-saving"><dt>Points used</dt><dd>−${rupees(item.points)}</dd></div>` : ''}
        </dl>
        ${item.status === 'open' && item.points ? `
          <label class="point-choice"><input type="checkbox" name="usePoints">
            <span>Use ${pointsLabel(item.points)} <small>Save ${rupees(item.points)} on this bill</small></span></label>` : ''}
        ${item.status === 'open' && !item.points && item.pointsAccount ? '<p class="small muted">No points available for this bill.</p>' : ''}
        <dl class="bill-breakdown bill-total" aria-live="polite"><div>
          <dt>${item.status === 'paid' ? 'Paid to business' : 'Amount due'}</dt><dd id="amount-due">${rupees(item.due)}</dd>
        </div></dl>
        ${item.status === 'open' ? '<button type="button" class="primary claim-button" data-action="ready">Confirm checkout</button>' : ''}
        ${item.status === 'ready' ? '<p class="section-note">Pay the business directly. Staff will confirm payment here.</p><button type="button" class="secondary claim-button" data-action="refresh-checkout">Check payment status</button>' : ''}
      `}
    </div></article>
    <a class="quiet" href="/rewards">My rewards <span aria-hidden="true">↗</span></a>
  </main>`;
}

async function renderRewards() {
  const key = new URLSearchParams(location.hash.slice(1)).get('key');
  if (key) {
    history.replaceState(null, '', '/rewards');
    await api('/api/rewards/session', { key });
  }
  const item = await api('/api/rewards');
  document.title = 'My rewards · Ref Network';
  const earned = item.balances.reduce((total, row) => total + row.earned, 0);
  app.innerHTML = `<main class="shopper-shell">
    <div class="brand shopper-brand">${brand}</div>
    <article class="ticket checkout-ticket rewards-ticket">
      <div class="ticket-top">
        <p class="eyebrow">${escape(item.name)}’s rewards</p>
        <h1>${pointFormat.format(earned / 100)}</h1><p class="ticket-title">Points earned across businesses</p>
      </div>
      <div class="ticket-body">
        <h2>Available to use</h2>
        <p class="section-note">One point gives ₹1 off at the business that awarded it. Choose your points at checkout.</p>
        ${item.balances.length ? `<ul class="activity-list">
          ${item.balances.map((row) => `<li><div><strong>${escape(row.business)}</strong>
            ${row.held ? `<small>${pointsLabel(row.held)} reserved for checkout</small>` : ''}</div>
            <span class="tag redeemed">${pointsLabel(row.available)}</span></li>`).join('')}
        </ul>` : '<p class="empty">Your points will appear after a referred shopper completes a paid purchase.</p>'}
        ${item.activity.length ? `<h3 class="points-history">Recent activity</h3><ul class="activity-list">
          ${item.activity.map((row) => `<li><div><strong>${escape(row.business)}</strong>
            <small>${row.kind === 'earned' ? 'Earned' : 'Used'} · ${dateLabel(row.created)}</small></div>
            <span>${row.amount > 0 ? '+' : '−'}${pointsLabel(Math.abs(row.amount))}</span></li>`).join('')}
        </ul>` : ''}
      </div>
    </article>
    <a class="quiet" href="/network">My network <span aria-hidden="true">↗</span></a>
  </main>`;
}

document.addEventListener('change', (event) => {
  if (event.target.name === 'profileId') {
    const name = event.target.form.elements.advocate;
    name.disabled = Boolean(event.target.value);
    name.closest('label').hidden = name.disabled;
  }
  if (event.target.name === 'usePoints') {
    document.querySelector('#amount-due').textContent = rupees(currentCheckout.due - (event.target.checked ? currentCheckout.points : 0));
  }
  if (event.target.name !== 'discountType') return;
  const fixed = event.target.value === 'fixed';
  const amount = event.target.form.elements.discount;
  amount.min = fixed ? '.01' : '1';
  amount.max = fixed ? '9999999.99' : '100';
  amount.step = fixed ? '.01' : '1';
  document.querySelector('#discount-unit').textContent = fixed ? '(₹)' : '(%)';
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id, token, active, decision } = button.dataset;
  button.disabled = true;
  try {
    switch (action) {
      case 'new-campaign':
      case 'new-link':
        editor.innerHTML = action === 'new-campaign' ? campaignDialog() : linkDialog();
        editor.showModal();
        break;
      case 'close':
        if (!editor.querySelector('form')?.dataset.busy) editor.close();
        break;
      case 'select':
        selectedId = id;
        dashboardView();
        document.querySelector('.campaign-choice[aria-pressed="true"]')?.focus({ preventScroll: true });
        break;
      case 'status':
        await api(`/api/campaigns/${id}/status`, { active: active === 'true' });
        await refreshDashboard();
        showNotice(active === 'true' ? 'Campaign live.' : 'Campaign paused. Approved offers still work through the end date.');
        break;
      case 'copy-link':
        await copy(location.origin + offerPath(token));
        showNotice('Referral link copied.');
        break;
      case 'rewards-invite': {
        const invite = await api(`/api/referrers/${id}/invite`, {});
        const path = `/rewards#key=${invite.key}`;
        editor.innerHTML = `<div class="edit-form">
          <div class="section-heading"><h2 id="editor-title">Private rewards invite</h2><button class="quiet close" type="button" data-action="close" aria-label="Close">×</button></div>
          <p>Send this invite to the referrer. It can be used once to open their rewards page.</p>
          <div class="editor-actions"><a class="secondary" href="${path}" target="_blank" rel="noopener">Open rewards</a>
            <button type="button" class="primary" data-action="copy-invite" data-token="${path}">Copy invite</button></div>
        </div>`;
        editor.showModal();
        break;
      }
      case 'copy-invite':
        await copy(location.origin + token);
        editor.close();
        showNotice('Private invite copied.');
        break;
      case 'copy-checkout':
        await copy(location.origin + checkoutPath(id));
        showNotice('Checkout link copied.');
        break;
      case 'ready': {
        const usePoints = Boolean(document.querySelector('[name="usePoints"]')?.checked);
        await api(`/api/checkouts/${checkoutId}/ready`, {
          usePoints, expectedDue: currentCheckout.due - (usePoints ? currentCheckout.points : 0),
        });
        await renderCheckout();
        break;
      }
      case 'refresh-checkout':
        await renderCheckout();
        break;
      case 'refresh-checkout-list':
        await refreshCheckouts();
        showNotice('Checkouts refreshed.');
        break;
      case 'pay':
      case 'cancel-checkout':
        await api(`/api/checkouts/${id}/${action === 'pay' ? 'pay' : 'cancel'}`, {});
        await refreshDashboard();
        showNotice(action === 'pay' ? 'Payment recorded.' : 'Checkout cancelled.');
        break;
      case 'revoke':
        if (!window.confirm('Revoke this link? Approved offers will still work.')) break;
        await api(`/api/links/${token}/revoke`, {});
        await refreshDashboard();
        showNotice('Referral link revoked.');
        break;
      case 'decision':
        await api(`/api/claims/${id}/decision`, { decision });
        await refreshDashboard();
        showNotice(decision === 'approve' ? 'Offer approved.' : 'Request declined.');
        break;
      case 'refresh':
        await refreshDashboard();
        showNotice('Activity refreshed.');
        break;
      case 'refresh-offer':
        await renderOffer();
        break;
      case 'claim':
        await api(`/api/offers/${offerToken}/claim`, {});
        await renderOffer();
        document.querySelector('.claim-status h2')?.setAttribute('aria-live', 'polite');
        showNotice('Request saved.');
        break;
    }
  } catch (error) {
    showNotice(error.message);
    if (action === 'claim') await renderOffer().catch(() => {});
    if (action === 'ready') await renderCheckout().catch(() => {});
  } finally {
    button.disabled = false;
  }
});

editor.addEventListener('cancel', (event) => {
  if (editor.querySelector('form')?.dataset.busy) event.preventDefault();
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  if (form.dataset.busy) return;
  form.dataset.busy = 'true';
  const save = form.querySelector('[type="submit"]');
  const errorBox = form.querySelector('.form-error');
  errorBox.hidden = true;
  save.disabled = true;
  const data = Object.fromEntries(new FormData(form));
  try {
    if (form.dataset.form === 'campaign') {
      const result = await api('/api/campaigns', data);
      selectedId = result.id;
      editor.close();
      await refreshDashboard();
      document.querySelector('.campaign-detail').scrollIntoView({ block: 'nearest' });
      showNotice('Campaign created.');
    } else if (form.dataset.form === 'link') {
      await api(`/api/campaigns/${selectedId}/links`, { ...data, singleUse: data.singleUse === 'true' });
      editor.close();
      await refreshDashboard();
      showNotice('Referral link created.');
    } else if (form.dataset.form === 'checkout') {
      await api('/api/checkouts', data);
      await refreshDashboard();
      showNotice('Checkout link created.');
    }
  } catch (error) {
    if (form.isConnected && !form.closest('dialog:not([open])')) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } else {
      showNotice(error.message);
    }
  } finally {
    delete form.dataset.busy;
    save.disabled = false;
  }
});

async function start() {
  if (location.pathname === '/rewards') {
    try {
      await renderRewards();
    } catch (error) {
      fallback('My rewards', error.message);
    }
    return;
  }
  if (checkoutId) {
    try {
      await renderCheckout();
    } catch (error) {
      fallback('Checkout unavailable', error.message);
    }
    return;
  }
  if (offerToken) {
    try {
      await renderOffer();
    } catch (error) {
      fallback('Offer unavailable', error.message);
    }
    return;
  }
  const ownerKey = new URLSearchParams(location.hash.slice(1)).get('owner');
  if (ownerKey) history.replaceState(null, '', location.pathname);
  try {
    if (ownerKey) await api('/api/session', { key: ownerKey });
    await refreshDashboard();
    document.addEventListener('visibilitychange', () => refreshCheckouts().catch(() => {}));
    setInterval(() => refreshCheckouts().catch(() => {}), 4000);
  } catch (error) {
    fallback('Merchant workspace', error.message);
  }
}

start();
