import { createNetworkGraph } from '/network-scene.js';

const find = (selector) => document.querySelector(selector);
const graphStage = find('.network-stage');
const graphNodes = find('.network-nodes');
const graphLines = find('.network-lines');
const graph = createNetworkGraph({
  stage: graphStage,
  controls: find('.graph-controls'),
  instructions: find('#network-instructions'),
});
const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0,
});
const rupees = (paise) => currency.format(paise / 100);
const benefit = (item) => item.discount_type === 'percent' ? item.discount + '% off' : rupees(item.discount) + ' off';
const text = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const personKey = (id) => 'person-' + id;
const offerKey = (id) => 'offer-' + id;
const inviteQuery = new URLSearchParams(location.search).get('invite');
let inviteToken = /^[a-f0-9]{36}$/.test(inviteQuery ?? '') ? inviteQuery : null;
let state;
let activeContactId;
let activeOfferId;
let focusNode = 'you';
let working = false;

async function api(path, input) {
  const response = await fetch('/api/network' + path, input === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  const item = await response.json();
  if (!response.ok) throw new Error(item.error);
  return item;
}

function notice(message, error = false) {
  const target = find('#network-notice');
  target.textContent = message;
  target.toggleAttribute('data-error', error);
}

function invitePanel(item, error) {
  find('#invite-panel').hidden = !item && !error;
  if (!item && !error) return;
  find('#invite-title').textContent = item ? item.name + ' invited you' : 'Invitation unavailable';
  find('#invite-detail').textContent = error ?? (item.own
    ? 'Share this link with someone you know, then confirm their name when they accept.'
    : item.accepted ? 'You already accepted this invite.'
      : state.profile ? 'Accept the invitation to ask ' + item.name + ' to confirm the connection.'
        : 'Create your profile first, then accept the invitation.');
  find('[data-action="accept-invite"]').hidden = !item || item.own || item.accepted || !state.profile;
}

function findContact() {
  return state.contacts.find((item) => item.id === activeContactId);
}

function chooseDefault() {
  const contact = findContact();
  if (contact) {
    if (activeOfferId && !contact.listings.some((item) => item.id === activeOfferId)) {
      activeOfferId = null;
      focusNode = personKey(contact.id);
    }
    return;
  }
  const first = state.contacts.find((item) => item.listings.length) ?? state.contacts[0];
  activeContactId = first?.id;
  activeOfferId = first?.listings[0]?.id;
  focusNode = activeOfferId ? offerKey(activeOfferId) : first ? personKey(first.id) : 'you';
}

function inView(items, selected) {
  const active = items.find((item) => item.id === selected);
  const visible = items.slice(0, 3);
  return active && !visible.includes(active) ? [...visible.slice(0, 2), active] : visible;
}

function renderGraph() {
  const connected = state.contacts.length;
  find('#graph-summary').textContent = connected + (connected === 1 ? ' connection' : ' connections');
  graphStage.toggleAttribute('data-empty', !connected);
  const contact = findContact();
  const offers = contact ? inView(contact.listings, activeOfferId) : [];
  const people = inView(state.contacts, activeContactId);
  const nodes = {
    you: { position: [connected ? -2.95 : 0, 0.2, 0], flat: [connected ? 15 : 50, 45],
      colour: '#f5dfbd', radius: .46, label: 'You', marker: 'Y', role: state.profile.name },
  };
  const edges = [];
  const selectedEdges = [];
  for (const [index, person] of people.entries()) {
    const y = ((people.length - 1) / 2 - index) * 2.32;
    const key = personKey(person.id);
    nodes[key] = { position: [-.16, y, .62 + .12 * (index % 2)], flat: [contact?.listings.length ? 48 : 70, 49 - y * 14.5],
      colour: '#f1ab8a', radius: .41, label: person.name, role: 'Connection' };
    edges.push(['you', key]);
    if (person.id === contact?.id) selectedEdges.push(['you', key]);
  }
  for (const [index, item] of offers.entries()) {
    const y = ((offers.length - 1) / 2 - index) * 2.32;
    const key = offerKey(item.id);
    const connector = personKey(contact.id);
    nodes[key] = { position: [2.8, y, -.28 + .22 * (index % 2)], flat: [83, 49 - y * 14.5],
      colour: '#ddebca', radius: .43, label: item.business, role: item.offerPath ? 'Offer' : 'Introduction' };
    edges.push([connector, key]);
    if (!activeOfferId || activeOfferId === item.id) selectedEdges.push([connector, key]);
  }
  graphNodes.innerHTML = Object.entries(nodes).map(([id, node]) => `
    <button type="button" class="graph-node" data-node="${id}" aria-pressed="${id === focusNode}"
      aria-label="${text(node.label)} · ${text(node.role)}" aria-controls="network-selection">
      <span class="node-marker" aria-hidden="true">${text(node.marker ?? [...node.label][0])}</span>
      <span class="node-label"><strong>${text(node.label)}</strong><small>${text(node.role)}</small></span>
    </button>`).join('');
  for (const button of graphNodes.querySelectorAll('[data-node]')) {
    const node = nodes[button.dataset.node];
    button.style.setProperty('--flat-x', node.flat[0] + '%');
    button.style.setProperty('--flat-y', node.flat[1] + '%');
    button.style.setProperty('--node-colour', node.colour);
  }
  graphLines.replaceChildren(...edges.map(([a, b]) => {
    const [x1, y1] = nodes[a].flat;
    const [x2, y2] = nodes[b].flat;
    const line = document.createElement('i');
    line.style.clipPath = `polygon(${x1}% ${y1 - .3}%, ${x2}% ${y2 - .3}%, ${x2}% ${y2 + .3}%, ${x1}% ${y1 + .3}%)`;
    line.toggleAttribute('data-active', selectedEdges.some(([start, end]) => start === a && end === b));
    return line;
  }));
  graph.setData({ nodes, edges });
  graph.select(focusNode, selectedEdges);
}

function renderSelection() {
  const target = find('#network-selection');
  const contact = findContact();
  const offer = contact?.listings.find((item) => item.id === activeOfferId);
  if (!contact || focusNode === 'you') {
    target.innerHTML = `<p class="graph-route">Your network</p><p class="graph-detail">${
      state.contacts.length ? 'Select a person to see the businesses they’ve shared with you.'
        : 'Invite someone you know. They’ll appear here after you confirm the connection.'
    }</p>`;
    return;
  }
  if (!offer) {
    target.innerHTML = `<p class="graph-route">You → ${text(contact.name)}</p>
      <p class="graph-detail">${contact.listings.length ? 'Select a business to view an offer or request an introduction.'
        : 'This connection hasn’t shared any businesses with you yet.'}</p>`;
    return;
  }
  let action;
  if (offer.offerPath) action = `<a class="primary" href="${text(offer.offerPath)}">View offer <span aria-hidden="true">↗</span></a>`;
  else if (offer.request === 'pending') action = `<span class="graph-status">Waiting for ${text(contact.name)} to respond.</span>`;
  else if (offer.request === 'declined') action = '<span class="graph-status">Introduction declined.</span>';
  else action = `<button class="primary" type="button" data-action="request" data-id="${offer.id}">Request a referral</button>`;
  target.innerHTML = `<p class="graph-route">You → ${text(contact.name)} → ${text(offer.business)}</p>
    <p class="graph-detail">${text(offer.title)} · ${benefit(offer)}${offer.minimum ? ' from ' + rupees(offer.minimum) : ''}
    ${offer.offerPath || offer.request ? '' : ' · Ask your contact to share the link.'}</p>
    <div class="network-graph-action">${action}</div>`;
}

function renderDirectory() {
  const contact = findContact();
  find('#contact-list').innerHTML = state.contacts.length ? `<ul class="network-choices">
    ${state.contacts.map((item) => `<li><button type="button" class="network-choice" data-focus="${personKey(item.id)}"
      aria-pressed="${item.id === activeContactId}"><span><strong>${text(item.name)}</strong>
      <small>${item.listings.length} shared ${item.listings.length === 1 ? 'offer' : 'offers'}</small></span><span aria-hidden="true">›</span></button></li>`).join('')}
    </ul>` : '<p class="empty">Confirmed connections will appear here.</p>';
  find('#business-list').innerHTML = !contact ? '' : `<p class="network-section-label">Through ${text(contact.name)}</p>
    ${contact.listings.length ? `<ul class="network-choices">${contact.listings.map((item) => `
      <li><button type="button" class="network-choice" data-focus="${offerKey(item.id)}" aria-pressed="${item.id === activeOfferId}">
        <span><strong>${text(item.business)}</strong><small>${text(item.title)} · ${item.offerPath ? benefit(item) : 'Ask for an introduction'}</small></span>
        <span aria-hidden="true">›</span></button></li>`).join('')}</ul>` : '<p class="network-inline-note">No businesses shared yet.</p>'}
    <button type="button" class="quiet danger network-remove" data-action="connection" data-id="${contact.id}" data-decision="remove">Remove connection</button>`;
}

function requestControls(id, action, decisions) {
  return `<div class="network-request-buttons">${decisions.map(([decision, label], index) => `
    <button type="button" class="${index ? 'quiet' : 'secondary'}" data-action="${action}" data-id="${id}"
      data-decision="${decision}">${label}</button>`).join('')}</div>`;
}

function renderManagement() {
  const { incomingConnections, waitingConnections, incomingReferrals } = state;
  const rows = [
    ...incomingConnections.map((item) => `<li><div><strong>${text(item.name)}</strong><small>Accepted your connection invitation</small></div>
      ${requestControls(item.id, 'connection', [['confirm', 'Confirm connection'], ['decline', 'Decline']])}</li>`),
    ...waitingConnections.map((item) => `<li><div><strong>${text(item.name)}</strong><small>Waiting for them to confirm your connection</small></div>
      ${requestControls(item.id, 'connection', [['remove', 'Cancel']])}</li>`),
    ...incomingReferrals.map((item) => `<li><div><strong>${text(item.requester)} → ${text(item.business)}</strong>
      <small>Requested an introduction</small></div>
      ${requestControls(item.id, 'intro', [['approve', 'Share offer'], ['decline', 'Decline']])}</li>`),
  ];
  find('#network-requests').innerHTML = rows.length ? `<ul class="network-list">${rows.join('')}</ul>` : '<p class="empty">You’re all caught up.</p>';

  const options = [['private', 'Private'], ['offer', 'Show offer'], ['intro', 'Ask me first']];
  find('#my-network-offers').innerHTML = !state.profile.rewardsLinked ? `
    <p class="network-inline-note">Link your Ref rewards profile to share a business you refer for. Only confirmed connections can see the offers you share here.</p>
    ${state.rewardName ? `<button class="secondary" type="button" data-action="link-rewards">Link rewards for ${text(state.rewardName)}</button>`
      : '<p class="network-inline-note">Open your private rewards invite in this browser, then return here.</p><a class="secondary" href="/rewards">My rewards</a>'}`
    : state.myOffers.length ? `<p class="network-inline-note">Choose which offers your confirmed contacts can open, or ask them to check with you first.</p>
    <ul class="network-list">${state.myOffers.map((item) => `<li>
      <div><strong>${text(item.business)}</strong><small>${text(item.title)}${item.available ? '' : ' · Unavailable'}</small></div>
      <label class="visibility-form">Visibility
        <select data-visibility="${item.token}" aria-label="${text(item.business + ' · ' + item.title)} visibility">
          ${options.map(([value, label]) => `<option value="${value}" ${item.mode === value ? 'selected' : ''}
            ${value !== 'private' && !item.available ? 'disabled' : ''}>${label}</option>`).join('')}
        </select>
      </label>
    </li>`).join('')}</ul>` : '<p class="empty">Your reusable referral links will appear here when a business gives you one.</p>';
}

function render() {
  const profile = state.profile;
  find('#setup-panel').hidden = Boolean(profile);
  find('#network-tools').hidden = !profile;
  find('#network-dashboard').hidden = !profile;
  find('#profile-label').hidden = !profile;
  if (!profile) {
    if (state.rewardName && !find('#network-profile-form').elements.name.value) {
      find('#network-profile-form').elements.name.value = state.rewardName;
    }
    return;
  }
  find('#profile-label').textContent = 'Signed in as ' + profile.name;
  chooseDefault();
  renderGraph();
  renderSelection();
  renderDirectory();
  renderManagement();
}

async function refresh() {
  state = await api('');
  render();
  if (inviteToken) {
    try {
      invitePanel(await api('/invites/' + inviteToken));
    } catch (error) {
      invitePanel(null, error.message);
    }
  } else if (inviteQuery && !/^[a-f0-9]{36}$/.test(inviteQuery)) {
    invitePanel(null, 'Check that the complete invitation link was shared.');
  } else {
    invitePanel(null, null);
  }
}

function selectNode(key) {
  const contact = state.contacts.find((item) => personKey(item.id) === key);
  if (contact) {
    activeContactId = contact.id;
    activeOfferId = null;
  } else if (key !== 'you') {
    const offer = findContact()?.listings.find((item) => offerKey(item.id) === key);
    if (!offer) return;
    activeOfferId = offer.id;
  }
  focusNode = key;
  renderGraph();
  renderSelection();
  renderDirectory();
}

async function perform(control, action) {
  if (working) return;
  working = true;
  control.disabled = true;
  try {
    await action();
  } catch (error) {
    notice(error.message, true);
  } finally {
    working = false;
    control.disabled = false;
  }
}

find('#network-profile-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  perform(form.querySelector('button'), async () => {
    await api('/profile', { name: form.elements.name.value });
    await refresh();
    if (inviteToken && !find('[data-action="accept-invite"]').hidden) find('[data-action="accept-invite"]').focus();
    else find('[data-action="invite"]').focus();
  });
});

document.addEventListener('change', (event) => {
  const control = event.target.closest('select[data-visibility]');
  if (!control) return;
  perform(control, async () => {
    try {
      await api('/listings/' + control.dataset.visibility, { mode: control.value });
      await refresh();
      notice('Offer visibility updated.');
    } catch (error) {
      control.value = state.myOffers.find((item) => item.token === control.dataset.visibility)?.mode ?? 'private';
      throw error;
    }
  });
});

document.addEventListener('click', (event) => {
  const control = event.target.closest('button');
  if (!control) return;
  const { node, focus, action, id, decision } = control.dataset;
  if (node || focus) {
    const key = node || focus;
    selectNode(key);
    const attribute = node ? 'data-node' : 'data-focus';
    find(`[${attribute}="${key}"]`)?.focus({ preventScroll: true });
    if (focus && key.startsWith('offer-')) find('#network-selection').scrollIntoView({ block: 'nearest' });
    return;
  }
  if (!action) return;
  perform(control, async () => {
    switch (action) {
      case 'refresh':
        await refresh();
        notice('Network updated.');
        break;
      case 'invite': {
        const { token } = await api('/invites', {});
        find('#invite-url').value = location.origin + '/network?invite=' + token;
        find('#invite-share').hidden = false;
        find('[data-action="copy-invite"]').focus();
        break;
      }
      case 'copy-invite': {
        const input = find('#invite-url');
        if (navigator.clipboard) await navigator.clipboard.writeText(input.value);
        else input.select();
        notice(navigator.clipboard ? 'Invitation copied.' : 'Select and copy the invitation link.');
        break;
      }
      case 'accept-invite':
        await api('/invites/' + inviteToken + '/accept', {});
        inviteToken = null;
        history.replaceState(null, '', '/network');
        await refresh();
        notice('Invitation accepted. The sender can now confirm your connection.');
        break;
      case 'connection':
        if (decision === 'remove' && !confirm('Remove this connection and its referral paths?')) return;
        await api('/connections/' + id, { decision });
        if (decision === 'confirm') find('#invite-share').hidden = true;
        await refresh();
        notice(decision === 'confirm' ? 'Connection confirmed.' : 'Connection updated.');
        break;
      case 'link-rewards':
        await api('/rewards', {});
        await refresh();
        notice('Rewards profile linked.');
        break;
      case 'request':
        await api('/referrals', { listingId: id });
        await refresh();
        notice('Referral request sent in Ref Network.');
        break;
      case 'intro':
        await api('/referrals/' + id, { decision });
        await refresh();
        notice(decision === 'approve' ? 'Offer shared with your contact.' : 'Referral request declined.');
        break;
    }
  });
});

refresh().catch((error) => notice(error.message, true));
