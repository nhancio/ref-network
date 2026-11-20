// Pure parsers for LinkedIn Connections.csv / full .zip export (with messages.csv strength signals),
// Google Contacts CSV, vCard (.vcf), and Google People API.
import { unzipSync, strFromU8 } from 'fflate';

export function parseCsvRows(rawText) {
  const text = String(rawText ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

function findHeaderIndex(rows, requiredPatterns) {
  const limit = Math.min(rows.length, 15);
  for (let i = 0; i < limit; i++) {
    const lower = rows[i].map((c) => c.toLowerCase().trim());
    if (requiredPatterns.every((pattern) => lower.some((cell) => pattern.test(cell)))) {
      return i;
    }
  }
  return -1;
}

function colIndex(headers, patterns) {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const p of patterns) {
    const idx = lower.findIndex((h) => (p instanceof RegExp ? p.test(h) : h === p));
    if (idx !== -1) return idx;
  }
  return -1;
}

function extractLinkedInSlug(url) {
  const m = String(url ?? '').toLowerCase().match(/linkedin\.com\/in\/([^/?#,\s]+)/);
  return m ? m[1].replace(/\/+$/, '') : '';
}

export function parseLinkedInCsv(rawText) {
  const rows = parseCsvRows(rawText);
  if (!rows.length) return [];

  const headerIdx = findHeaderIndex(rows, [/^first name$/i, /^last name$/i]);
  if (headerIdx === -1) return [];

  const headers = rows[headerIdx];
  const iFirst = colIndex(headers, ['first name']);
  const iLast = colIndex(headers, ['last name']);
  const iUrl = colIndex(headers, ['url', 'profile url', 'linkedin url']);
  const iEmail = colIndex(headers, ['email address', 'email']);
  const iCompany = colIndex(headers, ['company', 'organization']);
  const iPosition = colIndex(headers, ['position', 'title', 'role']);
  const iConnected = colIndex(headers, ['connected on', 'connected']);

  const contacts = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const cells = rows[r];
    const name = [cells[iFirst], cells[iLast]].filter(Boolean).join(' ').trim();
    if (!name) continue;
    contacts.push({
      name,
      email: iEmail !== -1 ? (cells[iEmail] || '').trim() : '',
      phone: '',
      company: iCompany !== -1 ? (cells[iCompany] || '').trim() : '',
      role: iPosition !== -1 ? (cells[iPosition] || '').trim() : '',
      linkedinUrl: iUrl !== -1 ? (cells[iUrl] || '').trim() : '',
      connectedOn: iConnected !== -1 ? (cells[iConnected] || '').trim() : '',
      photoUrl: '',
      sources: ['linkedin'],
    });
  }
  return contacts;
}

// Reads ONLY participant metadata + timestamps from LinkedIn messages.csv (never reads message bodies)
export function parseLinkedInMessagesMeta(rawText) {
  const rows = parseCsvRows(rawText);
  if (rows.length < 2) return new Map();

  const headerIdx = findHeaderIndex(rows, [/^from$/i, /^date$/i]);
  if (headerIdx === -1) return new Map();

  const headers = rows[headerIdx];
  const iFrom = colIndex(headers, ['from']);
  const iTo = colIndex(headers, ['to']);
  const iSenderUrl = colIndex(headers, ['sender profile url']);
  const iRecipientUrls = colIndex(headers, ['recipient profile urls']);
  const iDate = colIndex(headers, ['date']);

  const stats = new Map(); // slug or lower-name -> { messageCount, lastMessagedAt }
  const bump = (key, dateStr) => {
    if (!key) return;
    const prev = stats.get(key) || { messageCount: 0, lastMessagedAt: '' };
    prev.messageCount++;
    if (dateStr && (!prev.lastMessagedAt || dateStr > prev.lastMessagedAt)) {
      prev.lastMessagedAt = dateStr.slice(0, 10);
    }
    stats.set(key, prev);
  };

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const cells = rows[r];
    const dateStr = iDate !== -1 ? (cells[iDate] || '').trim() : '';
    const senderSlug = iSenderUrl !== -1 ? extractLinkedInSlug(cells[iSenderUrl]) : '';
    if (senderSlug) bump('slug:' + senderSlug, dateStr);
    const fromName = iFrom !== -1 ? (cells[iFrom] || '').trim().toLowerCase() : '';
    if (fromName) bump('name:' + fromName, dateStr);

    if (iRecipientUrls !== -1 && cells[iRecipientUrls]) {
      for (const piece of cells[iRecipientUrls].split(',')) {
        const slug = extractLinkedInSlug(piece);
        if (slug) bump('slug:' + slug, dateStr);
      }
    }
    if (iTo !== -1 && cells[iTo]) {
      for (const piece of cells[iTo].split(',')) {
        const n = piece.trim().toLowerCase();
        if (n) bump('name:' + n, dateStr);
      }
    }
  }
  return stats;
}

export function parseLinkedInZip(uint8Array) {
  const archive = unzipSync(uint8Array);
  const entryNames = Object.keys(archive);
  const connKey = entryNames.find((k) => /(^|\/)connections\.csv$/i.test(k));
  if (!connKey) {
    throw new Error('Could not find Connections.csv inside this ZIP archive. Request "Connections" from LinkedIn Data Export.');
  }

  const contacts = parseLinkedInCsv(strFromU8(archive[connKey]));
  const msgKey = entryNames.find((k) => /(^|\/)messages\.csv$/i.test(k));
  let enrichedSignals = 0;

  if (msgKey) {
    const msgStats = parseLinkedInMessagesMeta(strFromU8(archive[msgKey]));
    for (const c of contacts) {
      const slug = extractLinkedInSlug(c.linkedinUrl);
      const hit = (slug && msgStats.get('slug:' + slug)) || msgStats.get('name:' + c.name.toLowerCase());
      if (hit && hit.messageCount > 0) {
        c.messageCount = hit.messageCount;
        c.lastMessagedAt = hit.lastMessagedAt;
        c.strength = hit.messageCount >= 5 ? 'strong' : 'warm';
        enrichedSignals++;
      }
    }
  }

  return { contacts, enrichedSignals };
}

export function parseGenericContactsCsv(rawText, defaultSource = 'csv') {
  const rows = parseCsvRows(rawText);
  if (rows.length < 2) return [];

  if (findHeaderIndex(rows, [/^first name$/i, /^last name$/i, /^(company|connected on)$/i]) !== -1) {
    return parseLinkedInCsv(rawText);
  }

  const headers = rows[0];
  const iName = colIndex(headers, ['name', 'full name', 'display name']);
  const iFirst = colIndex(headers, ['first name', 'given name']);
  const iMiddle = colIndex(headers, ['middle name', 'additional name']);
  const iLast = colIndex(headers, ['last name', 'family name']);
  const iEmail = colIndex(headers, [/^e-?mail 1 - value$/i, /^email( address)?$/i, /e-?mail/i]);
  const iPhone = colIndex(headers, [/^phone 1 - value$/i, /^phone( number)?$/i, /mobile|tel/i]);
  const iCompany = colIndex(headers, ['organization name', 'organization 1 - name', 'company', 'organization']);
  const iRole = colIndex(headers, ['organization title', 'organization 1 - title', 'job title', 'title', 'position', 'role']);
  const iUrl = colIndex(headers, ['linkedin', 'linkedin url', 'website 1 - value', 'url']);

  const contacts = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const composed = [cells[iFirst], cells[iMiddle], cells[iLast]].filter(Boolean).join(' ').trim();
    const name = (iName !== -1 ? cells[iName] : '') || composed;
    const email = iEmail !== -1 ? (cells[iEmail] || '').split(':::')[0].trim() : '';
    const phone = iPhone !== -1 ? (cells[iPhone] || '').split(':::')[0].trim() : '';
    const finalName = name || email.split('@')[0] || phone;
    if (!finalName) continue;
    const urlVal = iUrl !== -1 ? (cells[iUrl] || '').trim() : '';
    contacts.push({
      name: finalName,
      email,
      phone,
      company: iCompany !== -1 ? (cells[iCompany] || '').trim() : '',
      role: iRole !== -1 ? (cells[iRole] || '').trim() : '',
      linkedinUrl: /linkedin\.com/i.test(urlVal) ? urlVal : '',
      connectedOn: '',
      photoUrl: '',
      sources: [defaultSource],
    });
  }
  return contacts;
}

function unescapeVCardValue(val) {
  return String(val ?? '')
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

export function parseVCard(rawText) {
  const unfolded = String(rawText ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '');

  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1);
  const contacts = [];

  for (const card of cards) {
    const body = card.split(/END:VCARD/i)[0] || '';
    const lines = body.split('\n');
    let fn = '';
    let nName = '';
    let email = '';
    let phone = '';
    let company = '';
    let role = '';
    let linkedinUrl = '';

    for (const rawLine of lines) {
      const colonIdx = rawLine.indexOf(':');
      if (colonIdx === -1) continue;
      const keyPart = rawLine.slice(0, colonIdx).toUpperCase();
      const prop = keyPart.replace(/^[^.]+\./, '').split(';')[0];
      const val = unescapeVCardValue(rawLine.slice(colonIdx + 1));
      if (!val) continue;

      if (prop === 'FN' && !fn) {
        fn = val;
      } else if (prop === 'N' && !nName) {
        const parts = rawLine.slice(colonIdx + 1).split(';').map(unescapeVCardValue);
        nName = [parts[1], parts[2], parts[0]].filter(Boolean).join(' ').trim();
      } else if (prop === 'EMAIL' && !email) {
        email = val;
      } else if (prop === 'TEL' && !phone) {
        phone = val;
      } else if (prop === 'ORG' && !company) {
        company = rawLine.slice(colonIdx + 1).split(';').map(unescapeVCardValue).filter(Boolean)[0] || '';
      } else if (prop === 'TITLE' && !role) {
        role = val;
      } else if ((prop === 'URL' || prop === 'X-SOCIALPROFILE') && /linkedin\.com/i.test(val) && !linkedinUrl) {
        linkedinUrl = val;
      }
    }

    const name = fn || nName || email.split('@')[0] || phone;
    if (!name) continue;

    contacts.push({
      name,
      email,
      phone,
      company,
      role,
      linkedinUrl,
      connectedOn: '',
      photoUrl: '',
      sources: ['vcf'],
    });
  }
  return contacts;
}

export function normalizeGooglePeople(connections = []) {
  const contacts = [];
  for (const person of connections) {
    const name = person.names?.[0]?.displayName?.trim() || '';
    const email = person.emailAddresses?.[0]?.value?.trim() || '';
    const phone = person.phoneNumbers?.[0]?.value?.trim() || '';
    const org = person.organizations?.[0] || {};
    const company = org.name?.trim() || '';
    const role = org.title?.trim() || '';
    const photo = person.photos?.find((p) => !p.default)?.url || '';
    const linkedinUrl = person.urls?.find((u) => /linkedin\.com/i.test(u.value || ''))?.value || '';

    const finalName = name || email.split('@')[0] || phone;
    if (!finalName) continue;

    contacts.push({
      name: finalName,
      email,
      phone,
      company,
      role,
      linkedinUrl,
      connectedOn: '',
      photoUrl: photo,
      sources: ['google'],
    });
  }
  return contacts;
}
