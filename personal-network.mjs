export function createPersonalNetwork({ db, get, all, run, transaction, requireInput, field, randomId, isoDate }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS network_profiles (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, session TEXT NOT NULL UNIQUE,
      referrer_id TEXT UNIQUE REFERENCES referrers(id)
    );
    CREATE TABLE IF NOT EXISTS network_invites (
      token TEXT PRIMARY KEY, inviter_id TEXT NOT NULL REFERENCES network_profiles(id),
      accepted_by TEXT REFERENCES network_profiles(id),
      expires_at TEXT NOT NULL DEFAULT (datetime('now', '+7 days'))
    );
    CREATE INDEX IF NOT EXISTS network_invites_by_inviter ON network_invites(inviter_id, accepted_by);
    CREATE TABLE IF NOT EXISTS network_connections (
      id TEXT PRIMARY KEY, first_id TEXT NOT NULL REFERENCES network_profiles(id),
      second_id TEXT NOT NULL REFERENCES network_profiles(id), inviter_id TEXT NOT NULL REFERENCES network_profiles(id),
      status TEXT NOT NULL, UNIQUE (first_id, second_id)
    );
    CREATE INDEX IF NOT EXISTS network_connections_reverse ON network_connections(second_id, status);
    CREATE TABLE IF NOT EXISTS network_listings (
      id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES network_profiles(id),
      token TEXT NOT NULL UNIQUE REFERENCES links(token), mode TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS network_listings_by_profile ON network_listings(profile_id, mode);
    CREATE TABLE IF NOT EXISTS network_referrals (
      id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES network_listings(id),
      requester_id TEXT NOT NULL REFERENCES network_profiles(id), status TEXT NOT NULL,
      UNIQUE (listing_id, requester_id)
    );
    CREATE INDEX IF NOT EXISTS network_referrals_by_requester ON network_referrals(requester_id);
  `);

  const activeOffer = "l.active = 1 AND l.single_use = 0 AND c.active = 1 AND (c.ends = '' OR c.ends >= ?)";
  const visibleListings = `FROM network_listings n JOIN links l ON l.token = n.token JOIN campaigns c ON c.id = l.campaign_id
    WHERE n.mode IN ('offer', 'intro') AND ${activeOffer}`;
  const pair = (a, b) => [a, b].sort();
  const connection = (a, b) => get('SELECT * FROM network_connections WHERE first_id = ? AND second_id = ?', ...pair(a, b));

  function snapshot(profile, rewardProfile) {
    if (!profile) return { profile: null, rewardName: rewardProfile?.name ?? null };
    const matches = all(`SELECT n.id, n.inviter_id, n.status, p.id AS contact_id, p.name
      FROM network_connections n
      JOIN network_profiles p ON p.id = CASE WHEN n.first_id = ? THEN n.second_id ELSE n.first_id END
      WHERE (n.first_id = ? OR n.second_id = ?) AND n.status IN ('connected', 'pending')
      ORDER BY p.name COLLATE NOCASE, n.id`, profile.id, profile.id, profile.id);
    const confirmed = matches.filter((item) => item.status === 'connected');
    const contactIds = new Set(confirmed.map((item) => item.contact_id));
    const published = confirmed.length ? all(`SELECT n.id, n.profile_id, n.token, n.mode, c.business, c.title,
      c.discount_type, c.discount, c.minimum
      ${visibleListings} AND n.profile_id IN (${confirmed.map(() => '?').join(',')})
      ORDER BY c.business COLLATE NOCASE, c.title COLLATE NOCASE`, isoDate(), ...contactIds) : [];
    const byContact = new Map();
    const sent = new Map(all('SELECT listing_id, status FROM network_referrals WHERE requester_id = ?', profile.id)
      .map((item) => [item.listing_id, item.status]));
    for (const item of published) {
      const { id, business, title, mode, discount_type, discount, minimum } = item;
      const request = sent.get(id);
      const offerPath = mode === 'offer' || request === 'approved' ? '/offer/' + item.token : null;
      const list = byContact.get(item.profile_id) ?? [];
      list.push({ id, business, title, mode, discount_type, discount, minimum, offerPath,
        request: request === 'cancelled' ? null : request ?? null });
      byContact.set(item.profile_id, list);
    }
    const contacts = confirmed.map(({ id, name, contact_id }) => ({ id, name, listings: byContact.get(contact_id) ?? [] }));
    const incomingConnections = matches.filter((item) => item.status === 'pending' && item.inviter_id === profile.id)
      .map(({ id, name }) => ({ id, name }));
    const waitingConnections = matches.filter((item) => item.status === 'pending' && item.inviter_id !== profile.id)
      .map(({ id, name }) => ({ id, name }));
    const incomingReferrals = all(`SELECT r.id, r.requester_id, p.name AS requester, c.business, c.title
      FROM network_referrals r JOIN network_listings n ON n.id = r.listing_id
      JOIN links l ON l.token = n.token JOIN campaigns c ON c.id = l.campaign_id
      JOIN network_profiles p ON p.id = r.requester_id
      WHERE ${activeOffer} AND n.profile_id = ? AND n.mode = 'intro' AND r.status = 'pending'
      ORDER BY r.rowid DESC`, isoDate(), profile.id)
      .filter((item) => contactIds.has(item.requester_id))
      .map(({ id, requester, business, title }) => ({ id, requester, business, title }));
    const myOffers = profile.referrer_id ? all(`SELECT l.token, c.business, c.title, coalesce(n.mode, 'private') AS mode,
      (${activeOffer}) AS available
      FROM links l JOIN campaigns c ON c.id = l.campaign_id LEFT JOIN network_listings n ON n.token = l.token
      WHERE l.profile_id = ? AND l.single_use = 0 ORDER BY c.business COLLATE NOCASE, c.title COLLATE NOCASE`,
      isoDate(), profile.referrer_id) : [];
    return {
      profile: { name: profile.name, rewardsLinked: Boolean(profile.referrer_id) },
      rewardName: rewardProfile?.name ?? null,
      contacts, incomingConnections, waitingConnections, incomingReferrals, myOffers,
    };
  }

  function createProfile(input) {
    const name = field(input.name, 'your display name', 70);
    const session = randomId() + randomId();
    run('INSERT INTO network_profiles (id, name, session) VALUES (?, ?, ?)', randomId(), name, session);
    return { session, body: { name }, status: 201 };
  }

  function attachRewards(profile, rewardProfile) {
    requireInput(rewardProfile, 'Open your rewards account in this browser first.', 409);
    return transaction(() => {
      requireInput(!profile.referrer_id || profile.referrer_id === rewardProfile.id, 'A rewards account is already linked.', 409);
      const already = get('SELECT id FROM network_profiles WHERE referrer_id = ?', rewardProfile.id);
      requireInput(!already || already.id === profile.id, 'This rewards account is linked to another network profile.', 409);
      run('UPDATE network_profiles SET referrer_id = ? WHERE id = ?', rewardProfile.id, profile.id);
      return { linked: true };
    });
  }

  function makeInvite(profile) {
    return transaction(() => {
      const existing = get(`SELECT token, expires_at FROM network_invites WHERE inviter_id = ?
        AND accepted_by IS NULL AND expires_at > CURRENT_TIMESTAMP ORDER BY rowid DESC LIMIT 1`, profile.id);
      if (existing) return existing;
      const token = randomId();
      run('INSERT INTO network_invites (token, inviter_id) VALUES (?, ?)', token, profile.id);
      return get('SELECT token, expires_at FROM network_invites WHERE token = ?', token);
    });
  }

  function inviteRow(token) {
    const invite = get(`SELECT i.*, p.name FROM network_invites i
      JOIN network_profiles p ON p.id = i.inviter_id
      WHERE i.token = ? AND i.expires_at > CURRENT_TIMESTAMP`, token);
    requireInput(invite, 'This invite has expired or could not be found.', 404);
    return invite;
  }

  function acceptInvite(profile, token) {
    return transaction(() => {
      const invite = inviteRow(token);
      requireInput(invite.inviter_id !== profile.id, 'Send this invite to someone else.', 409);
      requireInput(!invite.accepted_by || invite.accepted_by === profile.id, 'This invite has already been used.', 409);
      const prior = connection(profile.id, invite.inviter_id);
      if (invite.accepted_by) {
        requireInput(prior, 'This invite has already been used.', 409);
        return { id: prior.id, status: prior.status };
      }
      run('UPDATE network_invites SET accepted_by = ? WHERE token = ?', profile.id, token);
      if (prior && ['connected', 'pending'].includes(prior.status)) return { id: prior.id, status: prior.status };
      const id = prior?.id ?? randomId();
      run(`INSERT INTO network_connections (id, first_id, second_id, inviter_id, status)
        VALUES (?, ?, ?, ?, 'pending') ON CONFLICT (first_id, second_id)
        DO UPDATE SET inviter_id = excluded.inviter_id, status = 'pending'`,
      id, ...pair(profile.id, invite.inviter_id), invite.inviter_id);
      return { id, status: 'pending' };
    });
  }

  function decideConnection(profile, id, decision) {
    requireInput(['confirm', 'decline', 'remove'].includes(decision), 'Choose a connection action.');
    return transaction(() => {
      const item = get('SELECT * FROM network_connections WHERE id = ? AND (first_id = ? OR second_id = ?)',
        id, profile.id, profile.id);
      requireInput(item, 'Connection not found.', 404);
      const status = { confirm: 'connected', decline: 'declined', remove: 'removed' }[decision];
      if (decision !== 'remove') requireInput(item.inviter_id === profile.id, 'Only the sender of the invite can review it.', 403);
      if (item.status === status) return { status };
      requireInput(item.status === 'pending' || (decision === 'remove' && item.status === 'connected'), 'This connection is no longer pending.', 409);
      run('UPDATE network_connections SET status = ? WHERE id = ?', status, id);
      if (decision === 'remove') {
        run(`UPDATE network_referrals SET status = 'cancelled'
          WHERE status IN ('pending', 'approved') AND (
            (requester_id = ? AND listing_id IN (SELECT id FROM network_listings WHERE profile_id = ?))
            OR (requester_id = ? AND listing_id IN (SELECT id FROM network_listings WHERE profile_id = ?))
          )`, item.first_id, item.second_id, item.second_id, item.first_id);
      }
      return { status };
    });
  }

  function shareOffer(profile, token, mode) {
    requireInput(['private', 'offer', 'intro'].includes(mode), 'Choose an offer visibility.');
    return transaction(() => {
      const eligible = get(`SELECT (${activeOffer}) AS available FROM links l JOIN campaigns c ON c.id = l.campaign_id
        WHERE l.token = ? AND l.profile_id = ? AND l.single_use = 0`, isoDate(), token, profile.referrer_id);
      requireInput(eligible, 'Offer not found.', 404);
      requireInput(mode === 'private' || eligible.available, 'This offer is no longer active.', 409);
      run(`INSERT INTO network_listings (id, profile_id, token, mode) VALUES (?, ?, ?, ?)
        ON CONFLICT (token) DO UPDATE SET mode = excluded.mode`, randomId(), profile.id, token, mode);
      const listing = get('SELECT id, mode FROM network_listings WHERE token = ?', token);
      if (mode === 'private') {
        run("UPDATE network_referrals SET status = 'cancelled' WHERE listing_id = ? AND status IN ('pending', 'approved')", listing.id);
      }
      return listing;
    });
  }

  function requestIntro(profile, listingId) {
    requireInput(typeof listingId === 'string' && /^[a-f0-9]{36}$/.test(listingId), 'Choose a business.');
    return transaction(() => {
      const listing = get(`SELECT n.id, n.profile_id, n.mode ${visibleListings} AND n.id = ?`, isoDate(), listingId);
      requireInput(listing && listing.profile_id !== profile.id && connection(profile.id, listing.profile_id)?.status === 'connected',
        'Introduction not found.', 404);
      requireInput(listing.mode === 'intro', 'This offer can be opened directly.', 409);
      run(`INSERT INTO network_referrals (id, listing_id, requester_id, status) VALUES (?, ?, ?, 'pending')
        ON CONFLICT (listing_id, requester_id) DO UPDATE SET status = 'pending' WHERE status = 'cancelled'`,
      randomId(), listing.id, profile.id);
      return get('SELECT id, status FROM network_referrals WHERE listing_id = ? AND requester_id = ?', listing.id, profile.id);
    });
  }

  function decideIntro(profile, id, decision) {
    requireInput(['approve', 'decline'].includes(decision), 'Choose approve or decline.');
    return transaction(() => {
      const item = get(`SELECT r.requester_id, r.status
        FROM network_referrals r JOIN network_listings n ON n.id = r.listing_id
        JOIN links l ON l.token = n.token JOIN campaigns c ON c.id = l.campaign_id
        WHERE ${activeOffer} AND n.profile_id = ? AND n.mode = 'intro' AND r.id = ?`, isoDate(), profile.id, id);
      requireInput(item && connection(profile.id, item.requester_id)?.status === 'connected', 'Introduction not found.', 404);
      const status = decision === 'approve' ? 'approved' : 'declined';
      if (item.status === status) return { status };
      requireInput(item.status === 'pending', 'This request has already been reviewed.', 409);
      run('UPDATE network_referrals SET status = ? WHERE id = ?', status, id);
      return { status };
    });
  }

  return function handle({ path, method, session, rewardProfile, input }) {
    const profile = /^[a-f0-9]{72}$/.test(session ?? '')
      ? get('SELECT id, name, referrer_id FROM network_profiles WHERE session = ?', session) : null;
    const invite = path.match(/^\/api\/network\/invites\/([a-f0-9]{36})(\/accept)?$/);
    if (method === 'GET' && path === '/api/network') return { body: snapshot(profile, rewardProfile) };
    if (method === 'GET' && invite && !invite[2]) {
      const item = inviteRow(invite[1]);
      requireInput(!item.accepted_by || item.accepted_by === profile?.id, 'This invite has already been used.', 409);
      return { body: { name: item.name, own: item.inviter_id === profile?.id, accepted: Boolean(item.accepted_by) } };
    }
    requireInput(method === 'POST', 'Page not found.', 404);
    if (path === '/api/network/profile') {
      requireInput(!profile, 'You already have a network profile in this browser.', 409);
      return createProfile(input);
    }
    requireInput(profile, 'Create your network profile first.', 401);
    if (path === '/api/network/rewards') return { body: attachRewards(profile, rewardProfile) };
    if (path === '/api/network/invites') return { body: makeInvite(profile), status: 201 };
    if (invite?.[2]) return { body: acceptInvite(profile, invite[1]) };
    const action = path.match(/^\/api\/network\/(connections|listings|referrals)\/([a-f0-9]{36})$/);
    if (action?.[1] === 'connections') return { body: decideConnection(profile, action[2], input.decision) };
    if (action?.[1] === 'listings') return { body: shareOffer(profile, action[2], input.mode) };
    if (action?.[1] === 'referrals') return { body: decideIntro(profile, action[2], input.decision) };
    if (path === '/api/network/referrals') return { body: requestIntro(profile, input.listingId), status: 201 };
    requireInput(false, 'Page not found.', 404);
  };
}
