import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPersonalNetwork } from './personal-network.mjs';

const randomId = () => randomBytes(18).toString('hex');
const isoDate = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const shopperRoute = /^\/(offer|checkout)\/[a-f0-9]{36}$/;
const businessKey = (name) => name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const isId = (value) => typeof value === 'string' && /^[a-f0-9]{36}$/.test(value);

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireInput(condition, message, status = 400) {
  if (!condition) throw new RequestError(status, message);
}

function field(value, label, max, optional = false) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  requireInput((trimmed.length > 0 || optional) && trimmed.length <= max, `Enter ${label} (up to ${max} characters).`);
  return trimmed;
}

function rupees(value, label, optional = false) {
  const input = String(value ?? '').trim();
  if (optional && input === '') return 0;
  requireInput(/^\d{1,7}(\.\d{1,2})?$/.test(input), `Enter a valid ${label} in rupees.`);
  const [whole, fraction = ''] = input.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function wholeNumber(value, label, max, optional = false) {
  const input = String(value ?? '').trim();
  if (optional && input === '') return 0;
  requireInput(/^\d{1,7}$/.test(input) && Number(input) >= 1 && Number(input) <= max,
    `Enter a whole number from 1 to ${max} for ${label}.`);
  return Number(input);
}

function sameSecret(value, secret) {
  return typeof value === 'string' && value.length === secret.length
    && Buffer.byteLength(value) === secret.length
    && timingSafeEqual(Buffer.from(value), Buffer.from(secret));
}

async function jsonBody(request) {
  requireInput(request.headers['content-type']?.split(';')[0] === 'application/json', 'Expected JSON.', 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    requireInput(size <= 8192, 'This request is too large.', 413);
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new RequestError(400, 'Invalid JSON.');
  }
  requireInput(value && typeof value === 'object' && !Array.isArray(value), 'Expected a JSON object.');
  return value;
}

export function createApp({ database = resolve(import.meta.dirname, '.ref-network.sqlite'), demo = true } = {}) {
  const db = new DatabaseSync(database);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, business TEXT NOT NULL, description TEXT NOT NULL,
      discount_type TEXT NOT NULL, discount INTEGER NOT NULL, minimum INTEGER NOT NULL,
      reward INTEGER NOT NULL, access TEXT NOT NULL, ends TEXT NOT NULL, cap INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS links (
      token TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      advocate TEXT NOT NULL, single_use INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      token TEXT NOT NULL REFERENCES links(token), shopper TEXT NOT NULL, status TEXT NOT NULL,
      code TEXT UNIQUE, subtotal INTEGER, discount INTEGER, redeemed_at TEXT,
      created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (campaign_id, shopper)
    );
    CREATE INDEX IF NOT EXISTS links_campaign ON links(campaign_id);
    CREATE INDEX IF NOT EXISTS claims_token ON claims(token);
    CREATE TABLE IF NOT EXISTS referrers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, invite TEXT NOT NULL UNIQUE, session TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS offer_visits (
      shopper TEXT NOT NULL, business_key TEXT NOT NULL, token TEXT NOT NULL REFERENCES links(token),
      viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (shopper, business_key)
    );
    CREATE TABLE IF NOT EXISTS checkouts (
      id TEXT PRIMARY KEY, business_key TEXT NOT NULL, business TEXT NOT NULL, bill TEXT NOT NULL,
      subtotal INTEGER NOT NULL, shopper TEXT, profile_id TEXT REFERENCES referrers(id),
      claim_id TEXT REFERENCES claims(id), discount INTEGER NOT NULL DEFAULT 0, points INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL DEFAULT (datetime('now', '+15 minutes')),
      UNIQUE (business_key, bill)
    );
    CREATE INDEX IF NOT EXISTS checkout_hold_claim ON checkouts(claim_id, status);
    CREATE INDEX IF NOT EXISTS checkout_hold_points ON checkouts(profile_id, business_key, status);
    CREATE TABLE IF NOT EXISTS points_events (
      checkout_id TEXT NOT NULL REFERENCES checkouts(id), kind TEXT NOT NULL,
      profile_id TEXT NOT NULL REFERENCES referrers(id), business_key TEXT NOT NULL,
      business TEXT NOT NULL, amount INTEGER NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (checkout_id, kind)
    );
    CREATE INDEX IF NOT EXISTS points_by_referrer ON points_events(profile_id, business_key);
  `);

  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);

  function transaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  transaction(() => {
    if (!all('PRAGMA table_info(links)').some((column) => column.name === 'profile_id')) {
      db.exec('ALTER TABLE links ADD COLUMN profile_id TEXT REFERENCES referrers(id)');
    }
  });

  function createReferrer(name) {
    const id = randomId();
    run('INSERT INTO referrers VALUES (?, ?, ?, ?)', id, name, randomId() + randomId(), randomId() + randomId());
    return { id, name };
  }

  run("INSERT OR IGNORE INTO metadata VALUES ('owner', ?)", randomId() + randomId());
  run("INSERT OR IGNORE INTO metadata VALUES ('session', ?)", randomId() + randomId());
  const ownerKey = get("SELECT value FROM metadata WHERE key = 'owner'").value;
  const ownerSession = get("SELECT value FROM metadata WHERE key = 'session'").value;

  if (demo) transaction(() => {
    if (get("SELECT value FROM metadata WHERE key = 'seeded'")) return;
    const id = randomId();
    run(`INSERT INTO campaigns (id, title, business, description, discount_type, discount, minimum, reward, access, ends, cap)
      VALUES (?, 'Friends of Mango Yard', 'Mango Yard', 'For friends of our neighbourhood.',
        'percent', 10, 70000, 10000, 'link', '', 50)`, id);
    run('INSERT INTO links (token, campaign_id, advocate, single_use) VALUES (?, ?, ?, ?)', randomId(), id, 'Nithin', 0);
    run('INSERT INTO links (token, campaign_id, advocate, single_use) VALUES (?, ?, ?, ?)', randomId(), id, 'Riya', 1);
    run("INSERT INTO metadata VALUES ('seeded', 'yes')");
  });

  transaction(() => {
    for (const link of all('SELECT token, advocate FROM links WHERE profile_id IS NULL')) {
      run('UPDATE links SET profile_id = ? WHERE token = ?', createReferrer(link.advocate).id, link.token);
    }
    if (demo && get("SELECT value FROM metadata WHERE key = 'seeded'")) {
      run(`UPDATE campaigns SET description = 'For friends of our neighbourhood.' WHERE title = 'Friends of Mango Yard'
        AND business = 'Mango Yard' AND description = 'For friends of our neighbourhood. Show your code when you ask for the bill.'`);
    }
  });

  const campaign = (id) => {
    const result = get('SELECT * FROM campaigns WHERE id = ?', id);
    requireInput(result, 'Campaign not found.', 404);
    return result;
  };

  const expired = (row) => Boolean(row.ends && row.ends < isoDate());
  const open = (row) => row.active && !expired(row);
  const activeHold = "k.status = 'ready' AND k.expires_at > CURRENT_TIMESTAMP";
  const activeClaim = `(c.status <> 'approved' OR c.code IS NOT NULL OR EXISTS (
    SELECT 1 FROM checkouts k WHERE k.claim_id = c.id AND ${activeHold}))`;
  const reserved = (id) => get(`SELECT count(*) AS count FROM claims c WHERE c.campaign_id = ?
    AND c.status IN ('approved', 'redeemed') AND ${activeClaim}`, id).count;
  const hasCapacity = (row) => row.cap === 0 || reserved(row.id) < row.cap;
  const readClaim = (id) => get('SELECT id, status, code, discount, subtotal FROM claims WHERE id = ?', id);
  const newCode = () => randomBytes(6).toString('hex').toUpperCase();
  const findOffer = (token) => {
    const link = get('SELECT * FROM links WHERE token = ?', token);
    requireInput(link, 'Offer link not found.', 404);
    return { link, terms: campaign(link.campaign_id) };
  };
  const priorClaim = (campaignId, shopper) => get('SELECT id, token FROM claims WHERE campaign_id = ? AND shopper = ?', campaignId, shopper);
  const linkAvailable = (link) => link.active && (!link.single_use || !get(`SELECT 1 FROM claims c WHERE c.token = ? AND ${activeClaim}`, link.token));
  const setCookie = (response, name, value) => response.setHeader(
    'Set-Cookie', `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`,
  );
  const shopperSession = (cookies, response) => {
    const shopper = isId(cookies.ref_shopper) ? cookies.ref_shopper : randomId();
    if (shopper !== cookies.ref_shopper) setCookie(response, 'ref_shopper', shopper);
    return shopper;
  };
  const profileSession = (cookies) => {
    const session = cookies.ref_points;
    if (!/^[a-f0-9]{72}$/.test(session ?? '')) return null;
    return get('SELECT id, name FROM referrers WHERE session = ?', session) ?? null;
  };
  const heldClaim = (id) => get(`SELECT 1 FROM checkouts k WHERE k.claim_id = ? AND ${activeHold}`, id);
  const currentClaim = (existing) => {
    if (!existing) return null;
    const claim = readClaim(existing.id);
    return claim.status === 'approved' && !claim.code && !heldClaim(claim.id) ? null : claim;
  };
  const pointsHeld = (profileId, key) => get(`SELECT coalesce(sum(points), 0) AS total FROM checkouts
    WHERE profile_id = ? AND business_key = ? AND status = 'ready' AND expires_at > CURRENT_TIMESTAMP`, profileId, key).total;
  const spendingBalance = (profileId, key) => Math.max(0, get(`SELECT coalesce(sum(amount), 0) AS total FROM points_events
    WHERE profile_id = ? AND business_key = ?`, profileId, key).total - pointsHeld(profileId, key));

  function rewards(profile) {
    const balances = all(`SELECT business_key, max(business) AS business, sum(amount) AS balance,
      sum(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS earned
      FROM points_events WHERE profile_id = ? GROUP BY business_key ORDER BY business COLLATE NOCASE`, profile.id)
      .map((row) => {
        const held = pointsHeld(profile.id, row.business_key);
        return { business: row.business, available: Math.max(0, row.balance - held), earned: row.earned, held };
      });
    const activity = all(`SELECT business, kind, amount, created FROM points_events WHERE profile_id = ?
      ORDER BY created DESC, rowid DESC LIMIT 20`, profile.id);
    return { name: profile.name, balances, activity };
  }

  const checkout = (id) => {
    const row = get(`SELECT *, expires_at <= CURRENT_TIMESTAMP AS expired FROM checkouts WHERE id = ?`, id);
    requireInput(row, 'Checkout link not found.', 404);
    return row;
  };

  function createCheckout(input) {
    requireInput(isId(input.campaignId), 'Choose a business.');
    const terms = campaign(input.campaignId);
    const bill = field(input.bill, 'a bill reference', 50).normalize('NFKC').toUpperCase();
    const subtotal = rupees(input.total, 'bill subtotal');
    requireInput(subtotal > 0, 'Enter a subtotal above zero.');
    const key = businessKey(terms.business);
    return transaction(() => {
      const existing = get(`SELECT id, subtotal, status, expires_at <= CURRENT_TIMESTAMP AS expired
        FROM checkouts WHERE business_key = ? AND bill = ?`, key, bill);
      if (existing) {
        if (existing.status === 'cancelled' || (existing.expired && existing.status !== 'paid')) {
          const id = randomId();
          run(`UPDATE checkouts SET id = ?, subtotal = ?, shopper = NULL, profile_id = NULL, claim_id = NULL,
            discount = 0, points = 0, status = 'open', created = CURRENT_TIMESTAMP,
            expires_at = datetime('now', '+15 minutes') WHERE id = ?`, id, subtotal, existing.id);
          return { id };
        }
        requireInput(existing.subtotal === subtotal, 'This bill reference already has a different subtotal.', 409);
        return { id: existing.id };
      }
      const id = randomId();
      run('INSERT INTO checkouts (id, business_key, business, bill, subtotal) VALUES (?, ?, ?, ?, ?)',
        id, key, terms.business, bill, subtotal);
      return { id };
    });
  }

  const discountFor = (terms, subtotal) => terms.discount_type === 'fixed'
    ? Math.min(terms.discount, subtotal) : Math.round(subtotal * terms.discount / 100);

  function checkoutOffer(row, shopper, profile) {
    const visit = get(`SELECT token FROM offer_visits WHERE shopper = ? AND business_key = ?
      AND viewed_at > datetime('now', '-7 days')`, shopper, row.business_key);
    if (!visit) return null;
    const { link, terms } = findOffer(visit.token);
    if (expired(terms) || row.subtotal < terms.minimum) return null;
    const existing = priorClaim(terms.id, shopper);
    const claim = currentClaim(existing);
    const source = claim ? findOffer(existing.token).link : link;
    if (profile?.id === source.profile_id) return null;
    if (claim) {
      if (claim.status !== 'approved' || heldClaim(claim.id)) return null;
    } else if (terms.access !== 'link' || !open(terms) || !linkAvailable(link) || !hasCapacity(terms)) {
      return null;
    }
    const discount = discountFor(terms, row.subtotal);
    return discount ? { terms, source, claimId: existing?.id, reuse: Boolean(existing && !claim), discount } : null;
  }

  function checkoutView(row, shopper, profile, quotedOffer) {
    requireInput(!row.shopper || row.shopper === shopper, 'This checkout belongs to another browser.', 409);
    const status = row.expired && ['open', 'ready'].includes(row.status) ? 'expired' : row.status;
    const offer = status === 'open' ? (quotedOffer === undefined ? checkoutOffer(row, shopper, profile) : quotedOffer) : null;
    const discount = offer?.discount ?? row.discount;
    const points = status === 'open' && profile
      ? Math.min(row.subtotal - discount, spendingBalance(profile.id, row.business_key)) : row.points;
    const advocate = offer?.source.advocate ?? (row.claim_id && ['ready', 'paid'].includes(status) ? get(`SELECT l.advocate FROM links l
      JOIN claims c ON c.token = l.token WHERE c.id = ?`, row.claim_id)?.advocate : null);
    return {
      business: row.business, bill: row.bill, subtotal: row.subtotal, status, discount, points,
      due: row.subtotal - discount - (status === 'open' ? 0 : points),
      advocate, pointsAccount: Boolean(profile),
    };
  }

  function readyCheckout(id, shopper, profile, input) {
    requireInput(typeof input.usePoints === 'boolean' && Number.isSafeInteger(input.expectedDue), 'Confirm the displayed amount.');
    return transaction(() => {
      const row = checkout(id);
      const offer = row.status === 'open' && !row.expired ? checkoutOffer(row, shopper, profile) : null;
      const current = checkoutView(row, shopper, profile, offer);
      if (current.status === 'ready' || current.status === 'paid') return current;
      requireInput(current.status === 'open', 'This checkout has expired or been cancelled.', 409);
      const points = input.usePoints ? current.points : 0;
      requireInput(current.due - points === input.expectedDue, 'The available discount or points changed. Check the updated total.', 409);
      let claimId = offer?.claimId ?? null;
      if (offer && !claimId) {
        claimId = randomId();
        run("INSERT INTO claims (id, campaign_id, token, shopper, status) VALUES (?, ?, ?, ?, 'approved')",
          claimId, offer.terms.id, offer.source.token, shopper);
      } else if (offer?.reuse) {
        run('UPDATE claims SET token = ? WHERE id = ?', offer.source.token, claimId);
      }
      run(`UPDATE checkouts SET shopper = ?, profile_id = ?, claim_id = ?, discount = ?, points = ?, status = 'ready'
        WHERE id = ?`, shopper, profile?.id ?? null, claimId, current.discount, points, id);
      return checkoutView(checkout(id), shopper, profile);
    });
  }

  function settleCheckout(id) {
    return transaction(() => {
      const row = checkout(id);
      if (row.status === 'paid') return { status: 'paid' };
      requireInput(row.status === 'ready' && !row.expired, 'The shopper must confirm an active checkout first.', 409);
      const due = row.subtotal - row.discount - row.points;
      if (row.points) {
        run('INSERT INTO points_events (checkout_id, kind, profile_id, business_key, business, amount) VALUES (?, ?, ?, ?, ?, ?)',
          id, 'used', row.profile_id, row.business_key, row.business, -row.points);
      }
      if (row.claim_id) {
        const claim = get('SELECT * FROM claims WHERE id = ?', row.claim_id);
        requireInput(claim.status === 'approved', 'This offer was already used.', 409);
        const terms = campaign(claim.campaign_id);
        requireInput(!expired(terms), 'This offer has expired.', 409);
        const referrer = findOffer(claim.token).link;
        run("UPDATE claims SET status = 'redeemed', subtotal = ?, discount = ?, redeemed_at = CURRENT_TIMESTAMP WHERE id = ?",
          row.subtotal, row.discount, row.claim_id);
        if (terms.reward && due > 0 && referrer.profile_id && referrer.profile_id !== row.profile_id) {
          run('INSERT INTO points_events (checkout_id, kind, profile_id, business_key, business, amount) VALUES (?, ?, ?, ?, ?, ?)',
            id, 'earned', referrer.profile_id, row.business_key, row.business, terms.reward);
        }
      }
      run("UPDATE checkouts SET status = 'paid' WHERE id = ?", id);
      return { status: 'paid' };
    });
  }

  const listCheckouts = () => all(`SELECT id, business, bill, subtotal, discount, points,
    CASE WHEN expires_at <= CURRENT_TIMESTAMP AND status IN ('open', 'ready') THEN 'expired' ELSE status END AS status
    FROM checkouts
    ORDER BY CASE WHEN expires_at > CURRENT_TIMESTAMP AND status IN ('open', 'ready') THEN 0 ELSE 1 END, rowid DESC LIMIT 30`);

  function dashboard() {
    const campaigns = all(`SELECT campaigns.*,
      (SELECT count(*) FROM claims c WHERE c.campaign_id = campaigns.id AND ${activeClaim}) AS claims,
      (SELECT count(*) FROM claims WHERE campaign_id = campaigns.id AND status = 'redeemed') AS redeemed
      FROM campaigns ORDER BY created DESC, rowid DESC`).map((row) => ({ ...row, expired: expired(row) }));
    const links = all(`SELECT links.*, (SELECT count(*) FROM claims c WHERE c.token = links.token AND ${activeClaim}) AS claims
      FROM links ORDER BY created, rowid`);
    const claims = all(`SELECT c.id, c.campaign_id, c.status, c.subtotal, c.discount, c.redeemed_at,
      c.created, l.advocate, campaigns.title, coalesce(p.amount, 0) AS points,
      CASE WHEN k.id IS NULL THEN campaigns.reward ELSE coalesce(p.amount, 0) END AS reward
      FROM claims c JOIN links l ON l.token = c.token JOIN campaigns ON campaigns.id = c.campaign_id
      LEFT JOIN checkouts k ON k.claim_id = c.id AND k.status = 'paid'
      LEFT JOIN points_events p ON p.checkout_id = k.id AND p.kind = 'earned'
      WHERE ${activeClaim}
      ORDER BY c.created DESC, c.rowid DESC`);
    const referrers = all('SELECT id, name FROM referrers ORDER BY name COLLATE NOCASE, id');
    return {
      campaigns, links, claims, referrers, checkouts: listCheckouts(),
      metrics: {
        active: campaigns.filter(open).length,
        claims: claims.length,
        redeemed: claims.filter((row) => row.status === 'redeemed').length,
        reward: claims.reduce((sum, row) => sum + (row.status === 'redeemed' ? row.reward : 0), 0),
        pointsEarned: claims.reduce((sum, row) => sum + row.points, 0),
      },
    };
  }

  function createCampaign(input) {
    const title = field(input.title, 'a campaign name', 70);
    const business = field(input.business, 'a business name', 70);
    const description = field(input.description, 'offer terms', 450, true);
    requireInput(['percent', 'fixed'].includes(input.discountType), 'Choose a discount type.');
    const discount = input.discountType === 'percent'
      ? wholeNumber(input.discount, 'percentage', 100) : rupees(input.discount, 'discount');
    requireInput(discount > 0, 'Enter a discount larger than zero.');
    const minimum = rupees(input.minimum, 'minimum spend', true);
    const reward = rupees(input.reward, 'referral reward', true);
    requireInput(['link', 'approval'].includes(input.access), 'Choose how people qualify.');
    const ends = field(input.ends, 'an end date', 10, true);
    if (ends) {
      const date = new Date(ends + 'T00:00:00Z');
      requireInput(/^\d{4}-\d{2}-\d{2}$/.test(ends) && !isNaN(date) && date.toISOString().slice(0, 10) === ends,
        'Enter a valid end date.');
    }
    const cap = wholeNumber(input.cap, 'claim limit', 100000, true);
    const id = randomId();
    run(`INSERT INTO campaigns (id, title, business, description, discount_type, discount, minimum, reward, access, ends, cap)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, title, business, description, input.discountType, discount, minimum, reward, input.access, ends, cap);
    return { id };
  }

  function redeem(input) {
    const code = field(input.code, 'a referral code', 20).toUpperCase().replace(/\s|-/g, '');
    const subtotal = rupees(input.total, 'bill subtotal');
    requireInput(subtotal > 0, 'Enter a subtotal above zero.');
    return transaction(() => {
      const claim = get(`SELECT c.id, c.status, c.campaign_id, l.advocate FROM claims c
        JOIN links l ON l.token = c.token WHERE c.code = ?`, code);
      requireInput(claim, 'Code not found.', 404);
      requireInput(claim.status === 'approved', 'This code has already been redeemed.', 409);
      requireInput(!heldClaim(claim.id), 'This offer is reserved for a checkout already in progress.', 409);
      const terms = campaign(claim.campaign_id);
      requireInput(!expired(terms), 'This offer has expired.', 409);
      requireInput(subtotal >= terms.minimum, 'The bill is below the minimum spend for this offer.', 409);
      const discount = discountFor(terms, subtotal);
      run("UPDATE claims SET status = 'redeemed', subtotal = ?, discount = ?, redeemed_at = CURRENT_TIMESTAMP WHERE id = ?",
        subtotal, discount, claim.id);
      return { discount, due: subtotal - discount, reward: terms.reward, advocate: claim.advocate, title: terms.title };
    });
  }

  const javascript = 'text/javascript; charset=utf-8';
  const handleNetwork = createPersonalNetwork({ db, get, all, run, transaction, requireInput, field, randomId, isoDate });
  const assets = new Map([
    ['/', ['public/index.html', 'text/html; charset=utf-8']],
    ['/rewards', ['public/index.html', 'text/html; charset=utf-8']],
    ['/landing', ['public/landing.html', 'text/html; charset=utf-8']],
    ['/network', ['public/network.html', 'text/html; charset=utf-8']],
    ['/network.css', ['public/network.css', 'text/css; charset=utf-8']],
    ['/personal-network.js', ['public/personal-network.js', javascript]],
    ['/network-scene.js', ['public/network-scene.js', javascript]],
    ['/landing.css', ['public/landing.css', 'text/css; charset=utf-8']],
    ['/landing-hero.jpg', ['public/landing-hero.jpg', 'image/jpeg']],
    ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
    ['/app.js', ['public/app.js', javascript]],
    ['/referral-graph.js', ['public/referral-graph.js', javascript]],
    ['/vendor/three.module.min.js', ['node_modules/three/build/three.module.min.js', javascript]],
    ['/vendor/three.core.min.js', ['node_modules/three/build/three.core.min.js', javascript]],
  ]);

  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (value, status = 200) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(value));
    };
    try {
      const host = request.headers.host ?? '';
      requireInput(/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host), 'Use localhost to open this workspace.', 403);
      const origin = `http://${host}`;
      const { pathname: path } = new URL(request.url, origin);
      const method = request.method;
      const cookies = Object.fromEntries((request.headers.cookie ?? '').split(';').map((part) => part.trim().split('=')));
      if (method === 'GET' && (assets.has(path) || shopperRoute.test(path))) {
        const [name, contentType] = assets.get(path) ?? assets.get('/');
        response.writeHead(200, { 'Content-Type': contentType });
        return response.end(readFileSync(new URL(name, import.meta.url)));
      }
      if (method === 'POST') {
        requireInput(!request.headers.origin || request.headers.origin === origin, 'Invalid request origin.', 403);
      }
      if (path === '/api/network' || path.startsWith('/api/network/')) {
        const result = handleNetwork({
          path, method, session: cookies.ref_network, rewardProfile: profileSession(cookies),
          input: method === 'POST' ? await jsonBody(request) : {},
        });
        if (result.session) setCookie(response, 'ref_network', result.session);
        return send(result.body, result.status);
      }
      if (method === 'POST' && path === '/api/session') {
        const { key } = await jsonBody(request);
        requireInput(sameSecret(key, ownerKey), 'This workspace key is invalid.', 401);
        setCookie(response, 'ref_owner', ownerSession);
        return send({ ok: true });
      }
      if (method === 'POST' && path === '/api/rewards/session') {
        const { key } = await jsonBody(request);
        requireInput(typeof key === 'string' && /^[a-f0-9]{72}$/.test(key), 'Ask the business for your rewards invite.', 401);
        const profile = transaction(() => {
          const row = get('SELECT id, session FROM referrers WHERE invite = ?', key);
          requireInput(row, 'This invite has expired. Ask the business for a new one.', 401);
          run('UPDATE referrers SET invite = ? WHERE id = ?', randomId() + randomId(), row.id);
          return row;
        });
        setCookie(response, 'ref_points', profile.session);
        return send({ ok: true });
      }
      if (method === 'GET' && path === '/api/rewards') {
        const profile = profileSession(cookies);
        requireInput(profile, 'Open the private rewards invite from the business in this browser.', 401);
        return send(rewards(profile));
      }
      const checkoutMatch = path.match(/^\/api\/checkouts\/([a-f0-9]{36})(?:\/(ready|pay|cancel))?$/);
      if (checkoutMatch) {
        const [, id, action] = checkoutMatch;
        if (method === 'GET' && !action) {
          return send(checkoutView(checkout(id), shopperSession(cookies, response), profileSession(cookies)));
        }
        if (method === 'POST' && action === 'ready') {
          const input = await jsonBody(request);
          requireInput(isId(cookies.ref_shopper), 'Open the checkout link to see the total first.', 409);
          return send(readyCheckout(id, cookies.ref_shopper, profileSession(cookies), input));
        }
      }
      const offerMatch = path.match(/^\/api\/offers\/([a-f0-9]{36})(\/claim)?$/);
      if (offerMatch && method === 'GET' && !offerMatch[2]) {
        const { link, terms } = findOffer(offerMatch[1]);
        const shopper = shopperSession(cookies, response);
        const existing = priorClaim(terms.id, shopper);
        const { title, business, description, discount_type, discount, minimum, access, ends } = terms;
        const self = profileSession(cookies)?.id === link.profile_id;
        const available = Boolean(!self && open(terms) && linkAvailable(link) && hasCapacity(terms));
        const claim = currentClaim(existing);
        if (!self && (available || claim?.status === 'approved' || claim?.status === 'pending')) {
          run(`INSERT INTO offer_visits (shopper, business_key, token) VALUES (?, ?, ?)
            ON CONFLICT(shopper, business_key) DO UPDATE SET token = excluded.token, viewed_at = CURRENT_TIMESTAMP`,
            shopper, businessKey(business), link.token);
        }
        return send({
          title, business, description, discount_type, discount, minimum, access, ends,
          advocate: claim ? findOffer(existing.token).link.advocate : link.advocate,
          available,
          self,
          expired: expired(terms),
          claim,
        });
      }
      if (offerMatch && method === 'POST' && offerMatch[2]) {
        await jsonBody(request);
        requireInput(/^[a-f0-9]{36}$/.test(cookies.ref_shopper ?? ''), 'Open the offer page before claiming it.', 409);
        return send(transaction(() => {
          const { link, terms } = findOffer(offerMatch[1]);
          const existing = priorClaim(terms.id, cookies.ref_shopper);
          const claim = currentClaim(existing);
          if (claim) return claim;
          requireInput(profileSession(cookies)?.id !== link.profile_id, 'Your own referral link is for other shoppers.', 409);
          requireInput(open(terms) && linkAvailable(link) && hasCapacity(terms), 'This offer is no longer available on this link.', 409);
          const id = existing?.id ?? randomId();
          const approval = terms.access === 'approval';
          if (existing) {
            run('UPDATE claims SET token = ?, status = ?, code = ? WHERE id = ?',
              link.token, approval ? 'pending' : 'approved', approval ? null : newCode(), id);
          } else {
            run('INSERT INTO claims (id, campaign_id, token, shopper, status, code) VALUES (?, ?, ?, ?, ?, ?)',
              id, terms.id, link.token, cookies.ref_shopper, approval ? 'pending' : 'approved', approval ? null : newCode());
          }
          return readClaim(id);
        }), 201);
      }
      requireInput(sameSecret(cookies.ref_owner, ownerSession), 'Open the owner link printed by the local server.', 401);
      if (method === 'GET' && path === '/api/dashboard') return send(dashboard());
      if (method === 'GET' && path === '/api/checkouts') return send(listCheckouts());
      requireInput(method === 'POST', 'Page not found.', 404);
      const input = await jsonBody(request);
      if (path === '/api/campaigns') return send(createCampaign(input), 201);
      if (path === '/api/redeem') return send(redeem(input));
      if (path === '/api/checkouts') return send(createCheckout(input), 201);
      if (checkoutMatch?.[2] === 'pay') return send(settleCheckout(checkoutMatch[1]));
      if (checkoutMatch?.[2] === 'cancel') {
        return send(transaction(() => {
          const row = checkout(checkoutMatch[1]);
          requireInput(['open', 'ready'].includes(row.status), 'This checkout has already ended.', 409);
          run("UPDATE checkouts SET status = 'cancelled' WHERE id = ?", row.id);
          return { status: 'cancelled' };
        }));
      }
      const inviteMatch = path.match(/^\/api\/referrers\/([a-f0-9]{36})\/invite$/);
      if (inviteMatch) {
        const key = randomId() + randomId();
        requireInput(run('UPDATE referrers SET invite = ? WHERE id = ?', key, inviteMatch[1]).changes, 'Referrer not found.', 404);
        return send({ key });
      }

      const campaignMatch = path.match(/^\/api\/campaigns\/([a-f0-9]{36})\/(links|status)$/);
      if (campaignMatch) {
        const [, id, action] = campaignMatch;
        const terms = campaign(id);
        if (action === 'status') {
          requireInput(typeof input.active === 'boolean', 'Choose a campaign status.');
          requireInput(!input.active || !expired(terms), 'This campaign has expired.', 409);
          run('UPDATE campaigns SET active = ? WHERE id = ?', Number(input.active), id);
          return send({ ok: true });
        }
        requireInput(!expired(terms), 'This campaign has expired.', 409);
        requireInput(typeof input.singleUse === 'boolean', 'Choose a link type.');
        return send(transaction(() => {
          let profile;
          if (input.profileId) {
            requireInput(isId(input.profileId), 'Choose a referrer.');
            profile = get('SELECT id, name FROM referrers WHERE id = ?', input.profileId);
            requireInput(profile, 'Referrer not found.', 404);
          } else {
            profile = createReferrer(field(input.advocate, 'a referrer name', 70));
          }
          const token = randomId();
          run('INSERT INTO links (token, campaign_id, advocate, single_use, profile_id) VALUES (?, ?, ?, ?, ?)',
            token, id, profile.name, Number(input.singleUse), profile.id);
          return { token, profileId: profile.id };
        }), 201);
      }
      const revokeMatch = path.match(/^\/api\/links\/([a-f0-9]{36})\/revoke$/);
      if (revokeMatch) {
        requireInput(run('UPDATE links SET active = 0 WHERE token = ?', revokeMatch[1]).changes, 'Link not found.', 404);
        return send({ ok: true });
      }
      const claimMatch = path.match(/^\/api\/claims\/([a-f0-9]{36})\/decision$/);
      if (claimMatch) {
        const [ , id ] = claimMatch;
        requireInput(['approve', 'decline'].includes(input.decision), 'Choose approve or decline.');
        return send(transaction(() => {
          const item = get('SELECT * FROM claims WHERE id = ?', id);
          requireInput(item, 'Request not found.', 404);
          requireInput(item.status === 'pending', 'This request has already been reviewed.', 409);
          const approved = input.decision === 'approve';
          if (approved) {
            const terms = campaign(item.campaign_id);
            requireInput(open(terms) && hasCapacity(terms), 'This campaign cannot issue more codes right now.', 409);
            requireInput(get('SELECT active FROM links WHERE token = ?', item.token).active, 'This referral link was revoked.', 409);
          }
          run('UPDATE claims SET status = ?, code = ? WHERE id = ?', approved ? 'approved' : 'declined', approved ? newCode() : null, id);
          return readClaim(id);
        }));
      }
      throw new RequestError(404, 'Page not found.');
    } catch (error) {
      if (!(error instanceof RequestError)) console.error(error);
      if (!response.headersSent && !response.destroyed) send({ error: error instanceof RequestError ? error.message : 'Something went wrong.' }, error.status ?? 500);
      else if (!response.writableEnded) response.end();
    }
  });

  return { server, ownerKey, close: () => new Promise((done) => server.close(() => { db.close(); done(); })) };
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const app = createApp({ database: process.env.REF_DB, demo: !process.argv.includes('--empty') });
  const port = Number(process.env.REF_PORT || 4173);
  app.server.listen(port, '127.0.0.1', () => {
    const address = `http://127.0.0.1:${app.server.address().port}`;
    console.log(`Ref Network owner link\n${address}/#owner=${app.ownerKey}`);
  });
}
