import { buildGraphModel } from '../lib/graph-model.js';
import { safeHttpUrl, normalizeCompanyKey } from '../lib/dedupe.js';
import { SAMPLE_CONTACTS, SAMPLE_CIRCLE } from '../lib/sample-data.js';
import { create3DGraph } from './graph-3d.js';
import { esc } from './modals.js';

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || '?').slice(0, 2).toUpperCase();
}

export function mountWorkspace(container, {
  user,
  profile,
  getContacts,
  getCircle,
  getIntroRequests,
  onOpenConnect,
  onOpenCircle,
  onToggleIntro,
  onBulkToggleCompanyIntro,
  onOpenQuickHandoff,
  onRespondIntro,
  onOpenRequestHandoff,
  onSaveNotes,
  onDeleteContact,
  onRequestIntro,
  onSignOut,
}) {
  let mode = 'auto';
  let sourceFilter = 'all';
  let searchQuery = '';
  let expandedCompanyKey = null;
  let selectedNode = null;
  let sidebarTab = 'inspector'; // 'inspector' | 'directory' | 'requests'
  let previewSample = false;

  const displayName = profile?.displayName || user.displayName || user.email?.split('@')[0] || 'You';
  const photoUrl = profile?.photoUrl || user.photoURL || '';

  container.innerHTML = `
    <div class="workspace-shell">
      <header class="ws-topbar">
        <a class="ws-brand" href="#graph" aria-label="Ref Network">
          <img src="/ref-logo-primary.svg" alt="Ref Network" />
        </a>
        <div class="ws-search-wrap">
          <span class="ws-search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            id="ws-search-input"
            class="ws-search"
            placeholder="Search a company or role (e.g. Swiggy, Myntra, VP Product)…"
            autocomplete="off"
          />
          <button type="button" class="ws-search-clear" id="ws-search-clear" hidden aria-label="Clear search">×</button>
        </div>
        <div class="ws-actions">
          <button type="button" class="btn btn-primary btn-sm" id="btn-connect-sources">+ Connect Contacts</button>
          <button type="button" class="btn btn-outline btn-sm" id="btn-open-circle">Circle &amp; Invite</button>
          <button type="button" class="ws-user-chip" id="btn-user-menu" title="Sign out">
            <span class="avatar-circle">${photoUrl ? `<img src="${esc(photoUrl)}" alt="" />` : esc(initials(displayName))}</span>
            <span>${esc(displayName.split(' ')[0])}</span>
            <span style="color:#75746e; font-size:0.75rem;">Sign out</span>
          </button>
        </div>
      </header>

      <div class="ws-main">
        <section class="graph-pane" aria-label="3D Relationship graph">
          <div class="graph-toolbar">
            <div class="filter-pills" role="tablist" aria-label="Filter by source">
              <button type="button" class="pill-btn active" data-filter="all">All</button>
              <button type="button" class="pill-btn" data-filter="contacts">My Contacts</button>
              <button type="button" class="pill-btn" data-filter="circle">My Circle (2nd°)</button>
              <button type="button" class="pill-btn" data-filter="intro">Can Intro</button>
            </div>
            <div class="mode-toggle" role="group" aria-label="Graph grouping">
              <button type="button" class="pill-btn active" data-mode="companies">Companies</button>
              <button type="button" class="pill-btn" data-mode="people">People</button>
            </div>
          </div>

          <div id="onboarding-slot"></div>
          <div class="graph-canvas-host" id="ws-graph-host"></div>

          <div class="graph-bottom-bar">
            <div class="graph-path-pill" id="ws-path-pill">
              <div class="path-label">${esc(displayName)} · 3D Relationship Graph</div>
              <div class="path-sub">Search any company to trace warm intro paths · Drag to orbit</div>
            </div>
            <div class="graph-zoom-controls">
              <button type="button" id="zoom-out" title="Zoom out" aria-label="Zoom out">−</button>
              <button type="button" id="zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
              <button type="button" id="zoom-fit" title="Reset 3D view">Reset</button>
            </div>
          </div>
        </section>

        <aside class="ws-sidebar" aria-label="Network details, search results, and intro requests">
          <div class="ws-stats-bar">
            <div class="ws-stat"><strong id="stat-contacts">0</strong><span>Contacts</span></div>
            <div class="ws-stat"><strong id="stat-companies">0</strong><span>Companies</span></div>
            <div class="ws-stat"><strong id="stat-circle">0</strong><span>Circle</span></div>
          </div>
          <div class="sidebar-tabs sidebar-tabs-3">
            <button type="button" class="sidebar-tab active" data-tab="inspector">Inspector</button>
            <button type="button" class="sidebar-tab" data-tab="directory">Search &amp; List</button>
            <button type="button" class="sidebar-tab" data-tab="requests">Requests <span id="tab-req-badge"></span></button>
          </div>
          <div class="sidebar-body" id="ws-sidebar-body"></div>
        </aside>
      </div>
    </div>
  `;

  const searchInput = container.querySelector('#ws-search-input');
  const searchClear = container.querySelector('#ws-search-clear');
  const pathPill = container.querySelector('#ws-path-pill');
  const sidebarBody = container.querySelector('#ws-sidebar-body');
  const onboardingSlot = container.querySelector('#onboarding-slot');

  let latestModel = null;

  const graph = create3DGraph(container.querySelector('#ws-graph-host'), {
    autoRotate: true,
    initialDistance: 15.8,
    onSelect(node) {
      selectedNode = node;
      sidebarTab = 'inspector';
      updateTabButtons();
      if (node.kind === 'company') {
        expandedCompanyKey = expandedCompanyKey === node.data.key ? null : node.data.key;
        refresh(true);
        graph.focusNode(node.id);
      } else {
        updatePathPill(node);
        renderSidebar();
      }
    },
    onHover(node) {
      if (node) updatePathPill(node);
      else updatePathPill(selectedNode);
    },
  });

  function updatePathPill(node) {
    if (!node || node.kind === 'you') {
      const s = latestModel?.stats || { totalContacts: 0, companyCount: 0 };
      pathPill.innerHTML = `
        <div class="path-label">${esc(displayName)} · ${previewSample ? 'Sample 3D Preview' : 'Your 3D Network'}</div>
        <div class="path-sub">${s.totalContacts} contacts across ${s.companyCount} companies · Drag to orbit, scroll to zoom</div>
      `;
      return;
    }
    if (node.kind === 'company') {
      pathPill.innerHTML = `
        <div class="path-label">${esc(displayName)} → ${esc(node.label)}</div>
        <div class="path-sub">${node.count} direct ${node.count === 1 ? 'contact' : 'contacts'}${node.introCount ? ` · ${node.introCount} marked ready to intro` : ''}</div>
      `;
    } else if (node.kind === 'person') {
      pathPill.innerHTML = `
        <div class="path-label">${esc(displayName)} → ${esc(node.label)}${node.data.company ? ` (${esc(node.data.company)})` : ''}</div>
        <div class="path-sub">${esc(node.data.role || 'Direct contact')} · Private to your vault</div>
      `;
    } else if (node.kind === 'circle') {
      pathPill.innerHTML = `
        <div class="path-label">${esc(displayName)} ↔ ${esc(node.label)} (Ref Circle)</div>
        <div class="path-sub">${node.data.sharedCompanies.length} organizations reachable via ${esc(node.label.split(' ')[0])}</div>
      `;
    } else if (node.kind === 'second-company') {
      const roles = Array.isArray(node.data.roles) && node.data.roles.length ? ` · ${node.data.roles.join(', ')}` : '';
      pathPill.innerHTML = `
        <div class="path-label">${esc(displayName)} → ${esc(node.viaFriend.name)} → ${esc(node.label)}</div>
        <div class="path-sub">2nd-degree warm path · ${node.data.count} ${node.data.count === 1 ? 'contact' : 'contacts'}${esc(roles)} · Private until ${esc(node.viaFriend.name.split(' ')[0])} vouches</div>
      `;
    }
  }

  function updateTabButtons() {
    container.querySelectorAll('.sidebar-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === sidebarTab);
    });
  }

  function renderOnboarding(isRealEmpty) {
    if (!isRealEmpty) {
      onboardingSlot.innerHTML = '';
      return;
    }
    onboardingSlot.innerHTML = `
      <div class="onboarding-banner">
        <h3>${previewSample ? 'Previewing Nithin ↔ Uma sample 3D graph' : 'Your 3D relationship graph is ready'}</h3>
        <p>${previewSample
          ? 'Try searching “Swiggy” (via Uma) or “Myntra” (direct). Connect your real contacts to build your own private graph.'
          : 'Sync Google Contacts or invite a friend to your Ref Circle to map warm paths in 3D.'}</p>
        <div class="onboarding-banner-actions">
          <button type="button" class="btn btn-primary btn-sm" id="ob-connect">Sync Google Contacts</button>
          <button type="button" class="btn btn-outline btn-sm" id="ob-toggle-sample">${previewSample ? 'Hide sample' : 'Try sample graph'}</button>
        </div>
      </div>
    `;
    onboardingSlot.querySelector('#ob-connect').addEventListener('click', onOpenConnect);
    onboardingSlot.querySelector('#ob-toggle-sample').addEventListener('click', () => {
      previewSample = !previewSample;
      selectedNode = null;
      expandedCompanyKey = previewSample ? 'myntra' : null;
      refresh(false);
    });
  }

  function renderInspector() {
    const node = selectedNode;
    if (!node || node.kind === 'you') {
      const topCompanies = (latestModel?.companies || []).slice(0, 6);
      const circlePaths = (latestModel?.activeCircle || []).flatMap((f) =>
        (f.sharedCompanies || []).map((co) => ({ friend: f, co })),
      ).slice(0, 4);

      sidebarBody.innerHTML = `
        <div class="inspector-card">
          <div class="inspector-head">
            <div class="inspector-avatar">${photoUrl ? `<img src="${esc(photoUrl)}" alt="" />` : esc(initials(displayName))}</div>
            <div>
              <h3 class="inspector-title">${esc(displayName)}</h3>
              <p class="inspector-sub">${esc(profile?.headline || user.email || 'Ref Network Member')}</p>
            </div>
          </div>
          <div class="source-badges">
            <span class="badge google">Contacts: ${latestModel?.stats.totalContacts || 0}</span>
            <span class="badge circle">Circle: ${latestModel?.stats.circleCount || 0}</span>
            <span class="badge intro">Can Intro: ${latestModel?.stats.introCount || 0}</span>
          </div>
          ${profile?.publicProfileEnabled && profile?.publicHandle
            ? `<div class="inspector-meta"><a href="/u/${esc(profile.publicHandle)}" target="_blank" rel="noopener">Public intro page: /u/${esc(profile.publicHandle)} ↗</a></div>`
            : ''}
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn btn-primary btn-sm" id="ins-connect">+ Sync contacts</button>
            <button type="button" class="btn btn-outline btn-sm" id="ins-invite">Invite a friend</button>
          </div>
        </div>

        ${circlePaths.length ? `
          <div>
            <p class="kicker" style="margin-bottom:8px;">Warm paths via your Circle (2nd-degree)</p>
            <div class="dir-list">
              ${circlePaths.map(({ friend, co }) => `
                <div class="dir-item" style="cursor:default;">
                  <div class="dir-item-main">
                    <strong>${esc(co.company)}</strong>
                    <small>Via ${esc(friend.name)}${co.roles?.length ? ` · ${esc(co.roles.slice(0, 2).join(', '))}` : ` · ${co.count} contacts`}</small>
                  </div>
                  <button type="button" class="btn btn-primary btn-sm" data-quick-ask-uid="${esc(friend.uid)}" data-quick-ask-name="${esc(friend.name)}" data-quick-ask-co="${esc(co.company)}">Ask intro</button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${topCompanies.length ? `
          <div>
            <p class="kicker" style="margin-bottom:8px;">Your direct organizations</p>
            <div class="dir-list">
              ${topCompanies.map((co) => `
                <button type="button" class="dir-item" data-pick-company="${esc(co.key)}">
                  <div class="dir-item-main">
                    <strong>${esc(co.name)}</strong>
                    <small>${co.people.slice(0, 2).map((p) => esc(p.name)).join(', ')}${co.people.length > 2 ? ` +${co.people.length - 2}` : ''}</small>
                  </div>
                  <span class="dir-count">${co.people.length}</span>
                </button>
              `).join('')}
            </div>
          </div>
        ` : `<p style="font-size:0.86rem; color:#666560;">Sync Google Contacts or invite a friend to start mapping warm intro paths.</p>`}
      `;
      sidebarBody.querySelector('#ins-connect')?.addEventListener('click', onOpenConnect);
      sidebarBody.querySelector('#ins-invite')?.addEventListener('click', onOpenCircle);
      wireCompanyPickers();
      wireQuickAskButtons();
      return;
    }

    if (node.kind === 'company') {
      const co = node.data;
      const isSample = previewSample && !getContacts().length;
      const allMarked = co.people.length > 0 && co.people.every((p) => p.canIntroduce);
      sidebarBody.innerHTML = `
        <div class="inspector-card">
          <div class="inspector-head">
            <div class="inspector-avatar company">${co.people.length}</div>
            <div>
              <h3 class="inspector-title">${esc(co.name)}</h3>
              <p class="inspector-sub">${co.people.length} direct ${co.people.length === 1 ? 'contact' : 'contacts'} in your private vault</p>
            </div>
          </div>
          <div class="source-badges">
            ${Array.from(co.sources).map((s) => `<span class="badge ${s === 'linkedin' ? 'linkedin' : 'google'}">${esc(s)}</span>`).join('')}
            ${co.introCount ? `<span class="badge intro">${co.introCount} can intro</span>` : ''}
          </div>
          ${!isSample && co.key !== '__direct__' ? `
            <button type="button" class="btn ${allMarked ? 'btn-outline' : 'btn-primary'} btn-sm" id="btn-bulk-intro">
              ${allMarked ? `Unmark all at ${esc(co.name)}` : `Mark all ${co.people.length} as “Can introduce”`}
            </button>
          ` : ''}
        </div>
        <div>
          <p class="kicker" style="margin-bottom:8px;">Your contacts at ${esc(co.name)}</p>
          <div class="dir-list">
            ${co.people.map((p) => `
              <button type="button" class="dir-item" data-pick-person="${esc(p.id)}">
                <div class="avatar-circle" style="${p.canIntroduce ? 'background:#a03824;' : 'background:#2c2f27;'}">
                  ${p.photoUrl ? `<img src="${esc(p.photoUrl)}" alt="" />` : esc(initials(p.name))}
                </div>
                <div class="dir-item-main">
                  <strong>${esc(p.name)}</strong>
                  <small>${esc(p.role || p.email || p.sources.join(' · '))}</small>
                </div>
                ${p.strength === 'strong' ? `<span class="badge google">Strong</span>` : p.canIntroduce ? `<span class="badge intro">Intro</span>` : ''}
              </button>
            `).join('')}
          </div>
        </div>
      `;
      sidebarBody.querySelector('#btn-bulk-intro')?.addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        await onBulkToggleCompanyIntro(co.people.map((p) => p.id), !allMarked, co.name);
        refresh(true);
      });
      wirePersonPickers();
      return;
    }

    if (node.kind === 'person') {
      const p = node.data;
      const isSample = previewSample && !getContacts().length;
      sidebarBody.innerHTML = `
        <div class="inspector-card">
          <div class="inspector-head">
            <div class="inspector-avatar">${p.photoUrl ? `<img src="${esc(p.photoUrl)}" alt="" />` : esc(initials(p.name))}</div>
            <div>
              <h3 class="inspector-title">${esc(p.name)}</h3>
              <p class="inspector-sub">${esc([p.role, p.company].filter(Boolean).join(' · ') || 'Direct connection')}</p>
            </div>
          </div>
          <div class="source-badges">
            ${p.sources.map((s) => `<span class="badge ${s === 'linkedin' ? 'linkedin' : 'google'}">${esc(s)}</span>`).join('')}
            ${p.strength === 'strong' ? `<span class="badge google">Strong tie · ${p.messageCount} msgs</span>` : p.strength === 'warm' ? `<span class="badge google">Warm tie · ${p.messageCount} msgs</span>` : ''}
            ${p.companyInferred ? `<span class="badge">Company via work email</span>` : ''}
            ${p.canIntroduce ? `<span class="badge intro">Can introduce</span>` : ''}
          </div>
          <div class="inspector-meta">
            ${p.email ? `<div>Email: <a href="mailto:${esc(p.email)}">${esc(p.email)}</a></div>` : ''}
            ${p.phone ? `<div>Phone: <a href="tel:${esc(p.phone)}">${esc(p.phone)}</a></div>` : ''}
            ${safeHttpUrl(p.linkedinUrl) ? `<div>LinkedIn: <a href="${esc(safeHttpUrl(p.linkedinUrl))}" target="_blank" rel="noopener">Open profile ↗</a></div>` : ''}
            ${p.connectedOn ? `<div style="color:#75746e;">Connected on ${esc(p.connectedOn)}</div>` : ''}
          </div>
          <button type="button" class="btn btn-olive btn-sm" id="btn-quick-handoff">Draft warm intro on WhatsApp / Email</button>
          ${!isSample ? `
            <label class="inspector-toggle">
              <span>I can introduce people here</span>
              <input type="checkbox" id="toggle-can-intro" ${p.canIntroduce ? 'checked' : ''} />
            </label>
            <div>
              <textarea class="inspector-notes" id="contact-notes" placeholder="Private notes (how you know them, best way to reach)…">${esc(p.notes || '')}</textarea>
              <div style="display:flex; justify-content:space-between; margin-top:8px;">
                <button type="button" class="btn btn-outline btn-sm" id="btn-save-notes">Save note</button>
                <button type="button" class="btn btn-ghost btn-sm" id="btn-delete-contact" style="color:#8b261d;">Remove</button>
              </div>
            </div>
          ` : `<p style="font-size:0.8rem; color:#75746e;">Sample preview contact. Sync your contacts to edit notes and intro status.</p>`}
        </div>
      `;

      sidebarBody.querySelector('#btn-quick-handoff').addEventListener('click', () => onOpenQuickHandoff(p));

      if (!isSample) {
        sidebarBody.querySelector('#toggle-can-intro').addEventListener('change', async (e) => {
          await onToggleIntro(p.id, e.target.checked);
          refresh(true);
        });
        sidebarBody.querySelector('#btn-save-notes').addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          const val = sidebarBody.querySelector('#contact-notes').value;
          await onSaveNotes(p.id, val);
          btn.disabled = false;
        });
        sidebarBody.querySelector('#btn-delete-contact').addEventListener('click', async () => {
          if (!confirm(`Remove ${p.name} from your private graph?`)) return;
          await onDeleteContact(p.id);
          selectedNode = null;
          refresh(true);
        });
      }
      return;
    }

    if (node.kind === 'circle') {
      const friend = node.data;
      sidebarBody.innerHTML = `
        <div class="inspector-card">
          <div class="inspector-head">
            <div class="inspector-avatar circle">${friend.photoUrl ? `<img src="${esc(friend.photoUrl)}" alt="" />` : esc(initials(friend.name))}</div>
            <div>
              <h3 class="inspector-title">${esc(friend.name)}</h3>
              <p class="inspector-sub">${esc(friend.headline || 'Connected in your Ref Circle')}</p>
            </div>
          </div>
          <span class="badge circle" style="width:fit-content;">Trusted Circle · Contacts stay private</span>
        </div>
        <div>
          <p class="kicker" style="margin-bottom:8px;">Companies ${esc(friend.name.split(' ')[0])} can introduce you to</p>
          <div class="dir-list">
            ${friend.sharedCompanies.map((co) => `
              <div class="dir-item" style="cursor:default;">
                <div class="dir-item-main">
                  <strong>${esc(co.company)}</strong>
                  <small>${co.count} ${co.count === 1 ? 'contact' : 'contacts'}${co.roles?.length ? ` · ${esc(co.roles.join(', '))}` : ''}</small>
                </div>
                <button type="button" class="btn btn-primary btn-sm" data-quick-ask-uid="${esc(friend.uid)}" data-quick-ask-name="${esc(friend.name)}" data-quick-ask-co="${esc(co.company)}">Ask intro</button>
              </div>
            `).join('') || `<p style="font-size:0.85rem; color:#666560;">No shared organizations yet.</p>`}
          </div>
        </div>
      `;
      wireQuickAskButtons();
      return;
    }

    if (node.kind === 'second-company') {
      const friend = node.viaFriend;
      const co = node.data;
      const roles = Array.isArray(co.roles) && co.roles.length ? co.roles : [];
      sidebarBody.innerHTML = `
        <div class="inspector-card">
          <div class="inspector-head">
            <div class="inspector-avatar circle">${esc(initials(co.company))}</div>
            <div>
              <h3 class="inspector-title">${esc(co.company)}</h3>
              <p class="inspector-sub">${esc(displayName)} → <strong>${esc(friend.name)}</strong> → ${esc(co.company)}</p>
            </div>
          </div>
          ${roles.length ? `
            <div class="source-badges">
              ${roles.map((r) => `<span class="badge">${esc(r)}</span>`).join('')}
            </div>
          ` : ''}
          <p style="font-size:0.86rem; color:#52514d; line-height:1.55;">
            <strong>${esc(friend.name)}</strong> knows <strong>${co.count}</strong> ${co.count === 1 ? 'person' : 'people'} at ${esc(co.company)}. Their personal contact details stay private — ask ${esc(friend.name.split(' ')[0])} to make a warm introduction.
          </p>
          <button type="button" class="btn btn-primary" data-quick-ask-uid="${esc(friend.uid)}" data-quick-ask-name="${esc(friend.name)}" data-quick-ask-co="${esc(co.company)}">
            Ask ${esc(friend.name.split(' ')[0])} for an intro
          </button>
        </div>
      `;
      wireQuickAskButtons();
    }
  }

  function renderDirectory() {
    const companies = latestModel?.companies || [];
    const people = latestModel?.matchedContacts || [];
    const circleHits = (latestModel?.activeCircle || []).flatMap((friend) =>
      (friend.sharedCompanies || []).map((co) => ({ friend, co })),
    );
    const showingCompanies = latestModel?.effectiveMode === 'companies' && !searchQuery;

    const circleSectionHtml = circleHits.length ? `
      <div>
        <p class="kicker" style="margin-bottom:8px;">Warm paths via your Circle (${circleHits.length})</p>
        <div class="dir-list">
          ${circleHits.map(({ friend, co }) => `
            <div class="dir-item" style="cursor:default;">
              <div class="avatar-circle" style="background:#f4e2d8; color:#872e1c;">${esc(initials(friend.name))}</div>
              <div class="dir-item-main">
                <strong>${esc(co.company)} <span style="font-weight:400; color:#75746e;">via ${esc(friend.name)}</span></strong>
                <small>${co.count} ${co.count === 1 ? 'contact' : 'contacts'}${co.roles?.length ? ` · ${esc(co.roles.slice(0, 2).join(', '))}` : ''} · Private until ${esc(friend.name.split(' ')[0])} vouches</small>
              </div>
              <button type="button" class="btn btn-primary btn-sm" data-quick-ask-uid="${esc(friend.uid)}" data-quick-ask-name="${esc(friend.name)}" data-quick-ask-co="${esc(co.company)}">Ask intro</button>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    if (showingCompanies) {
      sidebarBody.innerHTML = `
        ${circleSectionHtml}
        <div>
          <p class="kicker" style="margin-bottom:8px;">Your organizations (${companies.length})</p>
          <div class="dir-list">
            ${companies.slice(0, 80).map((co) => `
              <button type="button" class="dir-item ${expandedCompanyKey === co.key ? 'active' : ''}" data-pick-company="${esc(co.key)}">
                <div class="dir-item-main">
                  <strong>${esc(co.name)}</strong>
                  <small>${co.people.slice(0, 2).map((p) => esc(p.name)).join(', ')}</small>
                </div>
                <span class="dir-count">${co.people.length}</span>
              </button>
            `).join('') || `<p style="font-size:0.86rem; color:#666560;">No direct organizations match this filter.</p>`}
          </div>
        </div>
      `;
      wireCompanyPickers();
      wireQuickAskButtons();
    } else {
      sidebarBody.innerHTML = `
        ${circleSectionHtml}
        <div>
          <p class="kicker" style="margin-bottom:8px;">Your direct contacts (${people.length})</p>
          <div class="dir-list">
            ${people.slice(0, 100).map((p) => `
              <button type="button" class="dir-item ${selectedNode?.id === 'person:' + p.id ? 'active' : ''}" data-pick-person="${esc(p.id)}">
                <div class="avatar-circle" style="background:${p.canIntroduce ? '#a03824' : '#2c2f27'};">
                  ${p.photoUrl ? `<img src="${esc(p.photoUrl)}" alt="" />` : esc(initials(p.name))}
                </div>
                <div class="dir-item-main">
                  <strong>${esc(p.name)}</strong>
                  <small>${esc([p.role, p.company].filter(Boolean).join(' · ') || p.email || p.sources.join(' · '))}</small>
                </div>
                ${p.strength === 'strong' ? `<span class="badge google">Strong</span>` : p.canIntroduce ? `<span class="badge intro">Intro</span>` : ''}
              </button>
            `).join('') || (!circleHits.length ? `<p style="font-size:0.86rem; color:#666560;">No connections match “${esc(searchQuery)}”.</p>` : '')}
          </div>
        </div>
      `;
      wirePersonPickers();
      wireQuickAskButtons();
    }
  }

  // Dedicated Requests tab: receive incoming requests (Uma -> Nithin -> Myntra) + pick which contact to intro + track sent requests
  function renderRequests() {
    const reqs = getIntroRequests();
    const incoming = reqs.incoming || [];
    const outgoing = reqs.outgoing || [];
    const myContacts = getContacts();

    const matchingContactsFor = (companyName) => {
      const targetKey = normalizeCompanyKey(companyName);
      const lower = String(companyName || '').toLowerCase();
      return myContacts.filter((c) =>
        (targetKey && c.companyKey === targetKey)
        || (lower && (c.company || '').toLowerCase().includes(lower)),
      );
    };

    sidebarBody.innerHTML = `
      <div>
        <p class="kicker" style="margin-bottom:8px;">Incoming referral requests (${incoming.length})</p>
        ${incoming.length ? `
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${incoming.map((req) => {
              const matches = matchingContactsFor(req.targetCompany);
              return `
                <div class="request-card">
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                    <strong style="font-size:0.9rem;">${esc(req.requesterName)} → ${esc(req.targetCompany)}</strong>
                    <span class="badge ${req.status === 'vouched' ? 'google' : req.status === 'declined' ? '' : 'intro'}">${esc(req.status)}</span>
                  </div>
                  ${req.note ? `<p style="font-size:0.84rem; color:#52514d; line-height:1.45;">“${esc(req.note)}”</p>` : ''}
                  ${matches.length ? `
                    <label class="field" style="font-size:0.78rem; color:#666560;">
                      Your private ${esc(req.targetCompany)} contact to introduce:
                      <select data-req-pick="${esc(req.id)}" style="margin-top:4px; padding:7px 9px; border-radius:8px; border:1px solid #dcdcd6; background:#fff; font-size:0.84rem; color:#141413;">
                        ${matches.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}${c.role ? ` (${esc(c.role)})` : ''}</option>`).join('')}
                        <option value="">Choose contact manually on WhatsApp</option>
                      </select>
                    </label>
                  ` : ''}
                  <div class="request-card-actions">
                    ${req.status === 'pending' ? `
                      <button type="button" class="btn btn-primary btn-sm" data-ws-vouch="${esc(req.id)}">Vouch &amp; send on WhatsApp</button>
                      <button type="button" class="btn btn-outline btn-sm" data-ws-decline="${esc(req.id)}">Decline</button>
                    ` : req.status === 'vouched' ? `
                      <button type="button" class="btn btn-outline btn-sm" data-ws-handoff="${esc(req.id)}">Open WhatsApp / Email handoff</button>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `<div class="inspector-card"><p style="font-size:0.85rem; color:#666560;">No incoming requests yet. When a friend in your circle searches a company you know (like Myntra) and asks for an intro, it appears right here in real time.</p></div>`}
      </div>

      <div>
        <p class="kicker" style="margin-bottom:8px;">Requests you sent (${outgoing.length})</p>
        ${outgoing.length ? `
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${outgoing.map((req) => `
              <div class="request-card">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                  <strong style="font-size:0.88rem;">${esc(req.targetCompany)} via ${esc(req.connectorName)}</strong>
                  <span class="badge ${req.status === 'vouched' ? 'google' : req.status === 'declined' ? '' : 'intro'}">${req.status === 'pending' ? `Waiting for ${esc(req.connectorName.split(' ')[0])}` : esc(req.status)}</span>
                </div>
                ${req.note ? `<p style="font-size:0.82rem; color:#666560;">“${esc(req.note)}”</p>` : ''}
              </div>
            `).join('')}
          </div>
        ` : `<p style="font-size:0.84rem; color:#666560;">Search any company in your Circle to ask a friend for a warm intro.</p>`}
      </div>
    `;

    sidebarBody.querySelectorAll('[data-ws-vouch]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const req = incoming.find((r) => r.id === btn.dataset.wsVouch);
        const pickedId = sidebarBody.querySelector(`[data-req-pick="${CSS.escape(btn.dataset.wsVouch)}"]`)?.value || '';
        const pickedContact = myContacts.find((c) => c.id === pickedId) || null;
        btn.disabled = true;
        await onRespondIntro(btn.dataset.wsVouch, 'vouched');
        if (req) onOpenRequestHandoff(req, pickedContact);
      });
    });

    sidebarBody.querySelectorAll('[data-ws-handoff]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const req = incoming.find((r) => r.id === btn.dataset.wsHandoff);
        const pickedId = sidebarBody.querySelector(`[data-req-pick="${CSS.escape(btn.dataset.wsHandoff)}"]`)?.value || '';
        const pickedContact = myContacts.find((c) => c.id === pickedId) || null;
        if (req) onOpenRequestHandoff(req, pickedContact);
      });
    });

    sidebarBody.querySelectorAll('[data-ws-decline]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await onRespondIntro(btn.dataset.wsDecline, 'declined');
      });
    });
  }

  function wireQuickAskButtons() {
    sidebarBody.querySelectorAll('[data-quick-ask-uid]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (previewSample && !getContacts().length) {
          onOpenCircle();
          return;
        }
        onRequestIntro({
          connectorUid: btn.dataset.quickAskUid,
          connectorName: btn.dataset.quickAskName,
          targetCompany: btn.dataset.quickAskCo,
        });
      });
    });
  }

  function wireCompanyPickers() {
    sidebarBody.querySelectorAll('[data-pick-company]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.pickCompany;
        expandedCompanyKey = key;
        const co = latestModel.companies.find((c) => c.key === key);
        if (co) {
          selectedNode = { id: `company:${key}`, kind: 'company', label: co.name, count: co.people.length, introCount: co.introCount, data: co };
          sidebarTab = 'inspector';
          updateTabButtons();
          refresh(true);
          graph.focusNode(`company:${key}`);
        }
      });
    });
  }

  function wirePersonPickers() {
    sidebarBody.querySelectorAll('[data-pick-person]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.pickPerson;
        const list = previewSample && !getContacts().length ? SAMPLE_CONTACTS : getContacts();
        const person = list.find((c) => c.id === id);
        if (person) {
          if (latestModel?.effectiveMode === 'companies' && person.companyKey && expandedCompanyKey !== person.companyKey) {
            expandedCompanyKey = person.companyKey;
            selectedNode = { id: `person:${id}`, kind: 'person', label: person.name, data: person };
            sidebarTab = 'inspector';
            updateTabButtons();
            refresh(true);
            graph.focusNode(`person:${id}`);
            return;
          }
          selectedNode = { id: `person:${id}`, kind: 'person', label: person.name, data: person };
          sidebarTab = 'inspector';
          updateTabButtons();
          updatePathPill(selectedNode);
          renderSidebar();
          graph.focusNode(`person:${id}`);
        }
      });
    });
  }

  function renderSidebar() {
    if (sidebarTab === 'requests') renderRequests();
    else if (sidebarTab === 'directory') renderDirectory();
    else renderInspector();
  }

  function refresh(keepCamera = false, { background = false } = {}) {
    const realContacts = getContacts();
    const realCircle = getCircle();
    const isRealEmpty = realContacts.length === 0 && realCircle.length === 0;
    const contacts = isRealEmpty && previewSample ? SAMPLE_CONTACTS : realContacts;
    const circleConnections = isRealEmpty && previewSample ? SAMPLE_CIRCLE : realCircle;

    renderOnboarding(isRealEmpty);

    latestModel = buildGraphModel({
      user: { name: displayName, photoUrl },
      contacts,
      circleConnections,
      mode,
      sourceFilter,
      searchQuery,
      expandedCompanyKey,
    });

    graph.setData(latestModel, { keepCamera });

    container.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === latestModel.effectiveMode);
    });

    container.querySelector('#stat-contacts').textContent = String(latestModel.stats.totalContacts);
    container.querySelector('#stat-companies').textContent = String(latestModel.stats.companyCount);
    container.querySelector('#stat-circle').textContent = String(latestModel.stats.circleCount);

    const pendingIn = (getIntroRequests().incoming || []).filter((r) => r.status === 'pending').length;
    const tabBadge = container.querySelector('#tab-req-badge');
    if (tabBadge) {
      tabBadge.innerHTML = pendingIn ? `<span class="badge intro" style="margin-left:3px; padding:1px 6px;">${pendingIn}</span>` : '';
    }

    if (selectedNode) {
      const updated = latestModel.nodes.find((n) => n.id === selectedNode.id);
      if (updated) selectedNode = updated;
    }

    updatePathPill(selectedNode);
    const isEditingSidebar = background && sidebarBody.contains(document.activeElement)
      && (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT');
    if (!isEditingSidebar) {
      renderSidebar();
    }
  }

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    searchClear.hidden = !searchQuery;
    if (searchQuery) {
      sidebarTab = 'directory';
      updateTabButtons();
    }
    refresh(false);
  });

  searchClear.addEventListener('click', () => {
    searchQuery = '';
    searchInput.value = '';
    searchClear.hidden = true;
    refresh(false);
  });

  container.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sourceFilter = btn.dataset.filter;
      container.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('active', b === btn));
      refresh(false);
    });
  });

  container.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      refresh(false);
    });
  });

  container.querySelectorAll('.sidebar-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      sidebarTab = btn.dataset.tab;
      updateTabButtons();
      renderSidebar();
    });
  });

  container.querySelector('#zoom-in').addEventListener('click', () => graph.zoomBy(1.22));
  container.querySelector('#zoom-out').addEventListener('click', () => graph.zoomBy(0.82));
  container.querySelector('#zoom-fit').addEventListener('click', () => graph.fitToView());

  container.querySelector('#btn-connect-sources').addEventListener('click', onOpenConnect);
  container.querySelector('#btn-open-circle').addEventListener('click', onOpenCircle);
  container.querySelector('#btn-user-menu').addEventListener('click', onSignOut);

  refresh(false);

  return {
    refresh,
    destroy() {
      graph.destroy();
    },
  };
}
