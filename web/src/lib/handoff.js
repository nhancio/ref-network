// Warm intro handoff helpers (WhatsApp / Email prefilled messages & public profile handle formatting)

export function normalizeHandle(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 32);
}

export function buildWarmIntroMessage({
  connectorName = '',
  requesterName = '',
  targetCompany = '',
  note = '',
  contactName = '',
}) {
  const greeting = contactName ? `Hey ${contactName.split(' ')[0]},` : 'Hey,';
  const req = requesterName || 'a friend from my circle';
  const co = targetCompany ? ` at ${targetCompany}` : '';
  const contextLine = note ? `\n\nContext: ${note.trim()}` : '';
  const signoff = connectorName ? `\n\n— ${connectorName.split(' ')[0]} (via Ref Network)` : '';
  return `${greeting} wanted to make a warm intro to ${req} who is looking to connect${co}.${contextLine}\n\nHappy to put you both in a quick thread if you're open to it!${signoff}`;
}

export function whatsappShareUrl(message, phone = '') {
  const digits = String(phone ?? '').replace(/\D/g, '');
  const base = digits.length >= 10 ? `https://wa.me/${digits}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
}

export function emailShareUrl({ to = '', subject = 'Warm intro via Ref Network', body = '' }) {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${encodeURIComponent(to)}?${params.toString()}`;
}
