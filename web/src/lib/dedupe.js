// Contact normalization, work-email company inference, company clustering keys, and cross-source deduplication

const COMPANY_SUFFIXES = /\b(private limited|pvt\.?\s*ltd\.?|limited|ltd\.?|inc\.?|incorporated|llc|l\.l\.c\.?|corp\.?|corporation|co\.?|llp|plc|gmbh|technologies|technology|solutions|india)\b/gi;

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'ymail.com',
  'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'pm.me', 'tutanota.com', 'fastmail.com', 'hey.com',
  'rediffmail.com', 'aol.com', 'zoho.com', 'zohomail.in', 'gmx.com', 'mail.com',
  'noreply.github.com', 'users.noreply.github.com', 'privaterelay.appleid.com',
]);

export function inferCompanyFromEmail(email) {
  const clean = String(email ?? '').trim().toLowerCase();
  const at = clean.lastIndexOf('@');
  if (at === -1) return '';
  const domain = clean.slice(at + 1).replace(/^mail\./, '');
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return '';
  // Skip academic / disposable / IP-like hosts
  if (/\.(edu|ac\.in|gov|gov\.in)$/.test(domain) || /^\d+\./.test(domain)) return '';

  // Strip country & generic TLDs (.co.in, .com.au, .com, .io, .ai, .in, etc.)
  const root = domain
    .replace(/\.(co|com|org|net)\.[a-z]{2}$/, '')
    .replace(/\.[a-z]{2,10}$/, '');
  const primary = root.split('.').pop() || '';
  if (primary.length < 2) return '';

  return primary
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => (part.length <= 3 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(' ');
}

export function normalizeCompanyKey(company) {
  const cleaned = String(company ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[&/.,()\-]+/g, ' ')
    .replace(COMPANY_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned) return cleaned;
  return String(company ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePhoneKey(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normalizeEmailKey(email) {
  const clean = String(email ?? '').trim().toLowerCase();
  return clean.includes('@') ? clean : '';
}

export function normalizeLinkedInKey(url) {
  const match = String(url ?? '').toLowerCase().match(/linkedin\.com\/in\/([^/?#]+)/);
  return match ? match[1].replace(/\/+$/, '') : '';
}

export function normalizeNameKey(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fnvHex(input) {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'));
}

export function stableContactId(contact) {
  const email = normalizeEmailKey(contact.email);
  if (email) return 'c_' + fnvHex('email:' + email);
  const li = normalizeLinkedInKey(contact.linkedinUrl);
  if (li) return 'c_' + fnvHex('li:' + li);
  const phone = normalizePhoneKey(contact.phone);
  if (phone) return 'c_' + fnvHex('phone:' + phone);
  const nameKey = normalizeNameKey(contact.name);
  const compKey = normalizeCompanyKey(contact.company);
  return 'c_' + fnvHex(`name:${nameKey}|co:${compKey}`);
}

export function normalizeContact(raw) {
  const name = String(raw.name ?? '').trim().slice(0, 120);
  const email = String(raw.email ?? '').trim().slice(0, 160);
  const phone = String(raw.phone ?? '').trim().slice(0, 40);
  let company = String(raw.company ?? '').trim().slice(0, 120);
  let companyInferred = Boolean(raw.companyInferred);

  if (!company && email) {
    const inferred = inferCompanyFromEmail(email);
    if (inferred) {
      company = inferred;
      companyInferred = true;
    }
  }

  const role = String(raw.role ?? '').trim().slice(0, 140);
  const linkedinUrl = String(raw.linkedinUrl ?? '').trim().slice(0, 260);
  const photoUrl = String(raw.photoUrl ?? '').trim().slice(0, 400);
  const connectedOn = String(raw.connectedOn ?? '').trim().slice(0, 40);
  const notes = String(raw.notes ?? '').trim().slice(0, 500);
  const sources = Array.from(new Set((raw.sources || ['manual']).filter(Boolean)));
  const companyKey = normalizeCompanyKey(company);
  const messageCount = Number(raw.messageCount || 0);
  const lastMessagedAt = String(raw.lastMessagedAt ?? '').trim().slice(0, 20);
  const strength = raw.strength || (messageCount >= 5 ? 'strong' : messageCount >= 1 ? 'warm' : '');

  return {
    id: raw.id || stableContactId({ name, email, phone, company, linkedinUrl }),
    name,
    email,
    phone,
    company,
    companyKey,
    companyInferred,
    role,
    linkedinUrl,
    photoUrl,
    connectedOn,
    messageCount,
    lastMessagedAt,
    strength,
    canIntroduce: Boolean(raw.canIntroduce),
    notes,
    sources,
  };
}

function mergeTwo(base, incoming) {
  const sources = Array.from(new Set([...(base.sources || []), ...(incoming.sources || [])]));
  // Prefer explicit company over email-inferred company
  const useIncomingCompany = (!base.company && incoming.company)
    || (base.companyInferred && incoming.company && !incoming.companyInferred);
  const company = useIncomingCompany ? incoming.company : (base.company || incoming.company);
  const companyInferred = useIncomingCompany ? incoming.companyInferred : (base.company ? base.companyInferred : incoming.companyInferred);
  const messageCount = Math.max(base.messageCount || 0, incoming.messageCount || 0);
  const lastMessagedAt = (base.lastMessagedAt || '') >= (incoming.lastMessagedAt || '')
    ? (base.lastMessagedAt || '')
    : (incoming.lastMessagedAt || '');

  return {
    ...base,
    id: base.id,
    name: base.name.length >= incoming.name.length ? base.name : incoming.name,
    email: base.email || incoming.email,
    phone: base.phone || incoming.phone,
    company,
    companyKey: normalizeCompanyKey(company),
    companyInferred: Boolean(companyInferred),
    role: base.role || incoming.role,
    linkedinUrl: base.linkedinUrl || incoming.linkedinUrl,
    photoUrl: base.photoUrl || incoming.photoUrl,
    connectedOn: base.connectedOn || incoming.connectedOn,
    messageCount,
    lastMessagedAt,
    strength: messageCount >= 5 ? 'strong' : messageCount >= 1 ? 'warm' : (base.strength || incoming.strength || ''),
    canIntroduce: Boolean(base.canIntroduce || incoming.canIntroduce),
    notes: base.notes || incoming.notes,
    sources,
  };
}

export function mergeContactLists(existingList = [], incomingList = []) {
  const records = [];
  const byEmail = new Map();
  const byPhone = new Map();
  const byLinkedIn = new Map();
  const byNameCompany = new Map();
  const byId = new Map();

  function indexRecord(rec, idx) {
    byId.set(rec.id, idx);
    const e = normalizeEmailKey(rec.email);
    if (e) byEmail.set(e, idx);
    const p = normalizePhoneKey(rec.phone);
    if (p) byPhone.set(p, idx);
    const l = normalizeLinkedInKey(rec.linkedinUrl);
    if (l) byLinkedIn.set(l, idx);
    const n = normalizeNameKey(rec.name);
    if (n && rec.companyKey) byNameCompany.set(`${n}|${rec.companyKey}`, idx);
  }

  function findMatch(rec) {
    if (byId.has(rec.id)) return byId.get(rec.id);
    const e = normalizeEmailKey(rec.email);
    if (e && byEmail.has(e)) return byEmail.get(e);
    const l = normalizeLinkedInKey(rec.linkedinUrl);
    if (l && byLinkedIn.has(l)) return byLinkedIn.get(l);
    const p = normalizePhoneKey(rec.phone);
    if (p && byPhone.has(p)) return byPhone.get(p);
    const n = normalizeNameKey(rec.name);
    if (n && rec.companyKey && byNameCompany.has(`${n}|${rec.companyKey}`)) {
      return byNameCompany.get(`${n}|${rec.companyKey}`);
    }
    return -1;
  }

  for (const item of existingList) {
    const rec = normalizeContact(item);
    if (!rec.name) continue;
    const matchIdx = findMatch(rec);
    if (matchIdx === -1) {
      const idx = records.length;
      records.push(rec);
      indexRecord(rec, idx);
    } else {
      records[matchIdx] = mergeTwo(records[matchIdx], rec);
      indexRecord(records[matchIdx], matchIdx);
    }
  }

  let addedCount = 0;
  let updatedCount = 0;
  const changed = [];

  for (const item of incomingList) {
    const rec = normalizeContact(item);
    if (!rec.name) continue;
    const matchIdx = findMatch(rec);
    if (matchIdx === -1) {
      const idx = records.length;
      records.push(rec);
      indexRecord(rec, idx);
      addedCount++;
      changed.push(rec);
    } else {
      const merged = mergeTwo(records[matchIdx], rec);
      records[matchIdx] = merged;
      indexRecord(merged, matchIdx);
      updatedCount++;
      changed.push(merged);
    }
  }

  return { merged: records, changed, addedCount, updatedCount };
}

// Upgrade already-saved contacts that lacked a company but have a work email
export function enrichMissingCompanies(contacts = []) {
  const enriched = [];
  const changed = [];
  for (const raw of contacts) {
    if (!raw.company && raw.email) {
      const inferred = inferCompanyFromEmail(raw.email);
      if (inferred) {
        const next = { ...raw, company: inferred, companyKey: normalizeCompanyKey(inferred), companyInferred: true };
        enriched.push(next);
        changed.push(next);
        continue;
      }
    }
    enriched.push(raw);
  }
  return { enriched, changed };
}

export function summarizeCompanyReach(contacts = []) {
  const map = new Map();
  for (const c of contacts) {
    if (!c.companyKey) continue;
    const entry = map.get(c.companyKey) || {
      companyKey: c.companyKey,
      company: c.company,
      count: 0,
      introCount: 0,
    };
    entry.count++;
    if (c.canIntroduce) entry.introCount++;
    if (c.company.length > entry.company.length) entry.company = c.company;
    map.set(c.companyKey, entry);
  }
  return Array.from(map.values())
    .sort((a, b) => b.introCount - a.introCount || b.count - a.count || a.company.localeCompare(b.company));
}
