import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import {
  parseLinkedInCsv,
  parseLinkedInZip,
  parseGenericContactsCsv,
  parseVCard,
  normalizeGooglePeople,
} from '../src/lib/parsers.js';
import {
  inferCompanyFromEmail,
  normalizeCompanyKey,
  mergeContactLists,
  enrichMissingCompanies,
  summarizeCompanyReach,
} from '../src/lib/dedupe.js';
import {
  normalizeHandle,
  buildWarmIntroMessage,
  whatsappShareUrl,
} from '../src/lib/handoff.js';
import { buildGraphModel } from '../src/lib/graph-model.js';

test('parseLinkedInCsv handles preamble notes, quoted commas, and missing emails', () => {
  const csv = [
    'Notes:',
    '"When exporting your connection data, you may notice that some email addresses are missing."',
    '',
    'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
    'Ananya,Rao,https://www.linkedin.com/in/ananya-rao/,ananya@mangoyard.in,"Mango Yard, Bengaluru","Founder, Host",12 Oct 2025',
    'Rohan,Deshmukh,https://www.linkedin.com/in/rohan-d,,Swiggy Pvt. Ltd.,VP Product,04 Jan 2024',
  ].join('\r\n');

  const parsed = parseLinkedInCsv(csv);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'Ananya Rao');
  assert.equal(parsed[0].company, 'Mango Yard, Bengaluru');
  assert.equal(parsed[0].role, 'Founder, Host');
  assert.deepEqual(parsed[0].sources, ['linkedin']);
  assert.equal(parsed[1].email, '');
  assert.equal(parsed[1].company, 'Swiggy Pvt. Ltd.');
});

test('parseLinkedInZip extracts Connections.csv and computes strength from messages.csv metadata only', () => {
  const connectionsCsv = [
    'Notes:',
    'Preamble',
    'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
    'Ananya,Rao,https://www.linkedin.com/in/ananya-rao/,,Mango Yard,Founder,12 Oct 2025',
    'Rohan,Deshmukh,https://www.linkedin.com/in/rohan-d/,,Swiggy,VP Product,01 Jan 2024',
  ].join('\n');

  const messagesCsv = [
    'CONVERSATION ID,CONVERSATION TITLE,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT',
    ...Array.from({ length: 6 }, (_, i) =>
      `c1,,Ananya Rao,https://www.linkedin.com/in/ananya-rao/,Nithin,https://www.linkedin.com/in/nithin/,2026-10-0${i + 1} 10:00:00 UTC,,Secret private text ${i}`,
    ),
    'c2,,Rohan Deshmukh,https://www.linkedin.com/in/rohan-d/,Nithin,https://www.linkedin.com/in/nithin/,2026-08-14 09:00:00 UTC,,Hello',
  ].join('\n');

  const zipped = zipSync({
    'Basic_LinkedInDataExport/Connections.csv': strToU8(connectionsCsv),
    'Basic_LinkedInDataExport/messages.csv': strToU8(messagesCsv),
  });

  const { contacts, enrichedSignals } = parseLinkedInZip(zipped);
  assert.equal(contacts.length, 2);
  assert.equal(enrichedSignals, 2);
  assert.equal(contacts[0].strength, 'strong');
  assert.equal(contacts[0].messageCount, 6);
  assert.equal(contacts[0].lastMessagedAt, '2026-10-06');
  assert.equal(contacts[1].strength, 'warm');
  assert.equal(contacts[1].messageCount, 1);
  // Ensure message content is never copied onto contact objects
  assert.equal(JSON.stringify(contacts).includes('Secret private text'), false);
});

test('parseVCard handles folded lines, escaped characters, and multiple cards', () => {
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:Meera Krishnan',
    'ORG:Razorpay Technologies Pvt Ltd;Partnerships',
    'TITLE:Head of',
    ' Partnerships',
    'TEL;TYPE=CELL:+91 98860 33112',
    'EMAIL;TYPE=WORK:meera@razorpay.com',
    'URL:https://linkedin.com/in/meera-krishnan',
    'END:VCARD',
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:Shetty;Vikram;;;',
    'TEL:9845199812',
    'END:VCARD',
  ].join('\r\n');

  const parsed = parseVCard(vcf);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'Meera Krishnan');
  assert.equal(parsed[0].company, 'Razorpay Technologies Pvt Ltd');
  assert.equal(parsed[0].role, 'Head ofPartnerships');
  assert.equal(parsed[0].linkedinUrl, 'https://linkedin.com/in/meera-krishnan');
  assert.equal(parsed[1].name, 'Vikram Shetty');
  assert.deepEqual(parsed[1].sources, ['vcf']);
});

test('parseGenericContactsCsv parses Google Contacts export and auto-detects LinkedIn CSV', () => {
  const googleCsv = [
    'First Name,Last Name,E-mail 1 - Value,Phone 1 - Value,Organization Name,Organization Title',
    'Asha,Murthy,asha@fieldsupply.in,+91 98455 61209,Field Supply,Owner',
  ].join('\n');

  const parsed = parseGenericContactsCsv(googleCsv, 'google');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, 'Asha Murthy');
  assert.equal(parsed[0].company, 'Field Supply');
  assert.deepEqual(parsed[0].sources, ['google']);
});

test('inferCompanyFromEmail & enrichMissingCompanies upgrade work emails while skipping consumer domains', () => {
  assert.equal(inferCompanyFromEmail('meera@razorpay.com'), 'Razorpay');
  assert.equal(inferCompanyFromEmail('founder@third-wave.co.in'), 'Third Wave');
  assert.equal(inferCompanyFromEmail('someone@gmail.com'), '');
  assert.equal(inferCompanyFromEmail('someone@yahoo.co.in'), '');
  assert.equal(inferCompanyFromEmail('someone@icloud.com'), '');

  const { enriched, changed } = enrichMissingCompanies([
    { id: '1', name: 'A', email: 'a@nhancio.com', company: '', companyKey: '' },
    { id: '2', name: 'B', email: 'b@gmail.com', company: '', companyKey: '' },
  ]);
  assert.equal(changed.length, 1);
  assert.equal(enriched[0].company, 'Nhancio');
  assert.equal(enriched[0].companyInferred, true);
  assert.equal(enriched[1].company, '');
});

test('dedupe merges cross-source LinkedIn + Google Contacts and normalizes companies', () => {
  assert.equal(normalizeCompanyKey('Swiggy Pvt. Ltd.'), 'swiggy');
  assert.equal(normalizeCompanyKey('Swiggy Technologies India'), 'swiggy');

  const linkedin = [
    { name: 'Meera Krishnan', email: 'meera@razorpay.com', company: 'Razorpay', role: 'Head of Partnerships', linkedinUrl: 'https://linkedin.com/in/meera-k', sources: ['linkedin'] },
    { name: 'Rohan Deshmukh', email: '', company: 'Swiggy Pvt. Ltd.', role: 'VP Product', linkedinUrl: 'https://linkedin.com/in/rohan-d', sources: ['linkedin'] },
  ];
  const google = normalizeGooglePeople([
    {
      names: [{ displayName: 'Meera Krishnan' }],
      emailAddresses: [{ value: 'MEERA@RAZORPAY.COM' }],
      phoneNumbers: [{ value: '+91 98860 33112' }],
      organizations: [{ name: 'Razorpay Software Pvt Ltd', title: 'Partnerships' }],
      photos: [{ url: 'https://example.com/meera.jpg' }],
    },
    {
      names: [{ displayName: 'Rohan Deshmukh' }],
      phoneNumbers: [{ value: '+91 98450 22109' }],
      organizations: [{ name: 'Swiggy', title: 'VP Product' }],
    },
  ]);

  const { merged, addedCount, updatedCount } = mergeContactLists(linkedin, google);
  assert.equal(merged.length, 2);
  assert.equal(addedCount, 0);
  assert.equal(updatedCount, 2);
  assert.deepEqual(merged[0].sources.sort(), ['google', 'linkedin']);
  assert.equal(merged[0].phone, '+91 98860 33112');
  assert.equal(merged[0].photoUrl, 'https://example.com/meera.jpg');

  const reach = summarizeCompanyReach(merged);
  assert.equal(reach.length, 2);
});

test('handoff helpers format handles and prefilled WhatsApp warm-intro URLs', () => {
  assert.equal(normalizeHandle('Nithin Didigam!'), 'nithin-didigam');
  const msg = buildWarmIntroMessage({
    connectorName: 'Nithin Didigam',
    requesterName: 'Ananya',
    targetCompany: 'Swiggy',
    note: 'Partnership chat',
    contactName: 'Rohan Deshmukh',
  });
  assert.ok(msg.includes('Hey Rohan,'));
  assert.ok(msg.includes('Ananya'));
  assert.ok(msg.includes('Swiggy'));
  const wa = whatsappShareUrl(msg, '+91 98450 22109');
  assert.ok(wa.startsWith('https://wa.me/919845022109?text='));
});

test('buildGraphModel groups large networks by company hub, expands on demand, and includes 2nd-degree circle paths', () => {
  const manyContacts = Array.from({ length: 30 }, (_, i) => ({
    id: `c_${i}`,
    name: `Person ${i}`,
    company: i < 10 ? 'Swiggy' : i < 20 ? 'Razorpay' : 'Zerodha',
    companyKey: i < 10 ? 'swiggy' : i < 20 ? 'razorpay' : 'zerodha',
    role: 'Engineer',
    email: `p${i}@example.com`,
    phone: '',
    linkedinUrl: '',
    sources: i % 2 === 0 ? ['linkedin'] : ['google'],
    canIntroduce: i === 0,
    notes: '',
  }));

  const circle = [{
    uid: 'u2',
    name: 'Asha Murthy',
    status: 'connected',
    sharedCompanies: [{ companyKey: 'araku', company: 'Araku Coffee', count: 3, introCount: 1 }],
  }];

  const model = buildGraphModel({
    user: { name: 'Nithin' },
    contacts: manyContacts,
    circleConnections: circle,
    expandedCompanyKey: 'swiggy',
  });

  assert.equal(model.effectiveMode, 'companies');
  assert.equal(model.companies.length, 3);
  assert.ok(model.nodes.some((n) => n.id === 'company:swiggy' && n.expanded));
  assert.ok(model.nodes.some((n) => n.id === 'person:c_0'));
  assert.ok(model.nodes.some((n) => n.id === 'second:u2:araku'));

  const searched = buildGraphModel({
    user: { name: 'Nithin' },
    contacts: manyContacts,
    circleConnections: circle,
    searchQuery: 'araku',
  });
  assert.equal(searched.matchedContacts.length, 0);
  assert.equal(searched.activeCircle.length, 1);
  assert.ok(searched.nodes.some((n) => n.id === 'second:u2:araku'));

  // Phone-only contacts (<3 real companies) stay in people mode so the 3D graph isn't a single hub
  const phoneOnly = Array.from({ length: 30 }, (_, i) => ({
    id: `ph_${i}`, name: `Friend ${i}`, company: '', companyKey: '', role: '', email: '', phone: `98450000${String(i).padStart(2, '0')}`,
    linkedinUrl: '', sources: ['google'], canIntroduce: false, notes: '',
  }));
  const phoneModel = buildGraphModel({ user: { name: 'Nithin' }, contacts: phoneOnly });
  assert.equal(phoneModel.effectiveMode, 'people');
  assert.ok(phoneModel.nodes.length > 20);
});

test('mergeContactLists avoids redundant writes when re-importing identical records', () => {
  const first = [{ name: 'Meera Krishnan', email: 'meera@razorpay.com', company: 'Razorpay', role: 'Partnerships', sources: ['linkedin'] }];
  const pass1 = mergeContactLists([], first);
  assert.equal(pass1.addedCount, 1);
  assert.equal(pass1.changed.length, 1);

  const pass2 = mergeContactLists(pass1.merged, first);
  assert.equal(pass2.addedCount, 0);
  assert.equal(pass2.updatedCount, 0);
  assert.equal(pass2.unchangedCount, 1);
  assert.equal(pass2.changed.length, 0);
});
