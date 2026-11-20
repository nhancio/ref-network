import { buildGraphModel } from '../lib/graph-model.js';
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
  let sidebarTab = 'inspector';
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
            placeholder="Search people, companies, roles (e.g. Swiggy, Founder)…"
            autocomplete="off"
          />
          <button type="button" class="ws-search-clear" id="ws-search-clear" hidden aria-label="Clear search">×</button>
        </div>
        <div class="ws-actions">
          <button type="button" class="btn btn-primary btn-sm" id="btn-connect-sources">+ Connect LinkedIn & Contacts</button>
          <button type="button" class="btn btn-outline btn-sm" id="btn-open-circle">Circle & Intros <span id="circle-req-badge"></span></button>
          <button type="button" class="ws-user-chip" id="btn-user-menu" title="Sign out">
            <span class="avatar-circle">${photoUrl ? `<img src="${esc(photoUrl)}" alt="" />` : esc(initials(displayName))}</span>
            <span>${esc(displayName.split(' ')[0])}</span>
            <span style="color:var(--ref-muted); font-size:0.75rem;">Sign out</span>
          </button>
        </div>
      </header>

      <div class="ws-main">
        <section class="graph-pane" aria-label="3D Relationship graph">
          <div class="graph-toolbar">
            <div class="filter-pills" role="tablist" aria-label="Filter by source">
              <button type="button" class="pill-btn active" data-filter="all">All</button>
              <button type="button" class="pill-btn" data-filter="linkedin">LinkedIn</button>
              <button type="button" class="pill-btn" data-filter="contacts">Contacts</button>
              <button type="button" class="pill-btn" data-filter="circle">Circle</button>
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
              <div class="path-label">${esc(displayName)} · 3D Personal Graph</div>
              <div class="path-sub">Drag to orbit in 3D · Click any company orb to expand its people</div>
            </div>
            <div class="graph-zoom-controls">
              <button type="button" id="zoom-out" title="Zoom out" aria-label="Zoom out">−</button>
              <button type="button" id="zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
              <button type="button" id="zoom-fit" title="Reset 3D view">Reset</button>
            </div>
          </div>
        </section>

        <aside class="ws-sidebar" aria-label="Network details and directory">
          <div class="ws-stats-bar">
            <div class="ws-stat"><strong id="stat-contacts">0</strong><span>Contacts</span></div>
            <div class="ws-stat"><strong id="stat-companies">0</strong><span>Companies</span></div>
            <div class="ws-stat"><strong id="stat-circle">0</strong><span>Circle</span></div>
          </div>
          <div class="sidebar-tabs">
            <button type="button" class="sidebar-tab active" data-tab="inspector">Inspector</button>
            <button type="button" class="sidebar-tab" data-tab="directory">Directory</button>
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
        <div class="path-sub">${node.count} direct ${node.count === 1 ? 'connection' : 'connections'}${node.introCount ? ` · ${node.introCount} marked ready to intro` : ''}</div>
      `;
    } else if (node.kind === 'person') {
      pathPill.innerHTML = `
        <div class="path-label">${esc(displayName)} → ${esc(node.label)}${node.data.company ? ` (${esc(node.data.company)})` : ''}</div>
        <div class="path-sub">${esc(node.data.role || 'Direct contact')} · ${esc(node.data.sources.join(' + '))}</div>
      `;
    } else if (node.kind === 'circle') {
      pathPill.innerHTML = `
        <div class="path-label">${esc(displayName)} ↔ ${esc(node.label)} (Ref Circle)</div>
        <div class="path-sub">${node.data.sharedCompanies.length} organizations reachable via ${esc(node.label.split(' ')[0])}</div>
      `;
    } else if (node.kind === 'second-company') {
      pathPill.innerHTML = `
        <div class="path-label">${esc(displayName)} → ${esc(node.viaFriend.name)} → ${esc(node.label)}</div>
        <div class="path-sub">2nd-degree warm intro path · ${node.data.count} contacts via ${esc(node.viaFriend.name.split(' ')[0])}</div>
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
        <h3>${previewSample ? 'Previewing a sample 3D Bengaluru graph' : 'Your 3D constellation is ready'}</h3>
        <p>${previewSample
          ? 'Connect your real LinkedIn .zip / Connections.csv or Google Contacts to replace this preview with your actual relationships.'
          : 'Import your LinkedIn .zip export or sync Google Contacts to instantly map every company and warm intro path in 3D.'}</p>
        <div class="onboarding-banner-actions">
          <button type="button" class="btn btn-primary btn-sm" id="ob-connect">Connect LinkedIn & Contacts</button>
          <button type="button" class="btn btn-outline btn-sm" id="ob-toggle-sample">${previewSample ? 'Hide sample' : 'Preview 3D sample'}</button>
        </div>
      </div>
    `;
    onboardingSlot.querySelector('#ob-connect').addEventListener('click', onOpenConnect);
    onboardingSlot.querySelector('#ob-toggle-sample').addEventListener('click', () => {
      previewSample = !previewSample;
      selectedNode = null;
      expandedCompanyKey = previewSample ? 'swiggy' : null;
      refresh(false);
    });
  }

  function renderInspector() {
    const node = selectedNode;
    if (!node || node.kind === 'you') {
      const topCompanies = (latestModel?.companies || []).slice(0, 6);
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
            <span class="badge linkedin">LinkedIn: ${latestModel?.stats.linkedinCount || 0}</span>
            <span class="badge google">Contacts: ${latestModel?.stats.contactsCount || 0}</span>
            <span class="badge intro">Can Intro: ${latestModel?.stats.introCount || 0}</span>
          </div>
          ${profile?.publicProfileEnabled && profile?.publicHandle
            ? `<div class="inspector-meta"><a href="/u/${esc(profile.publicHandle)}" target="_blank" rel="noopener">Public intro page: /u/${esc(profile.publicHandle)} ↗</a></div>`
            : ''}
          ${profile?.linkedinUrl ? `<div class="inspector-meta"><a href="${esc(profile.linkedinUrl)}" target="_blank" rel="noopener">Your LinkedIn profile ↗</a></div>` : ''}
          <button type="button" class="btn btn-primary btn-sm" id="ins-connect">+ Import / manage contacts</button>
        </div>

        ${topCompanies.length ? `
          <div>
            <p class="kicker" style="margin-bottom:8px;">Top organizations in your graph</p>
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
        ` : `<p style="font-size:0.86rem; color:var(--ref-muted);">Connect LinkedIn or Google Contacts to populate your organization reach.</p>`}
      `;
      sidebarBody.querySelector('#ins-connect')?.addEventListener('click', onOpenConnect);
      wireCompanyPickers();
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
              <p class="inspector-sub">${co.people.length} ${co.people.length === 1 ? 'connection' : 'connections'} in your network</p>
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
          <p class="kicker" style="margin-bottom:8px;">People at ${esc(co.name)}</p>
          <div class="dir-list">
            ${co.people.map((p) => `
              <button type="button" class="dir-item" data-pick-person="${esc(p.id)}">
                <div class="avatar-circle" style="${p.canIntroduce ? 'background:var(--ref-terracotta);' : 'background:var(--ref-olive);'}">
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
            ${p.linkedinUrl ? `<div>LinkedIn: <a href="${esc(p.linkedinUrl)}" target="_blank" rel="noopener">Open profile ↗</a></div>` : ''}
            ${p.connectedOn ? `<div style="color:var(--ref-muted);">Connected on ${esc(p.connectedOn)}</div>` : ''}
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
          ` : `<p style="font-size:0.8rem; color:var(--ref-muted);">Sample preview contact. Import your own network to edit notes and intro status.</p>`}
        </div>
      `;

      sidebarBody.querySelector('#btn-quick-handoff').addEventListener('click', () => {
        onOpenQuickHandoff(p);
      });

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
          <span class="badge circle" style="width:fit-content;">Trusted Circle Bridge</span>
        </div>
        <div>
          <p class="kicker" style="margin-bottom:8px;">Companies ${esc(friend.name.split(' ')[0])} can introduce you to</p>
          <div class="dir-list">
            ${friend.sharedCompanies.map((co) => `
              <div class="dir-item" style="cursor:default;">
                <div class="dir-item-main">
                  <strong>${esc(co.company)}</strong>
                  <small>${co.count} ${co.count === 1 ? 'contact' : 'contacts'}</small>
                </div>
                <button type="button" class="btn btn-primary btn-sm" data-ask-intro="${esc(co.company)}">Ask intro</button>
              </div>
            `).join('') || `<p style="font-size:0.85rem; color:var(--ref-muted);">No shared organizations yet.</p>`}
          </div>
        </div>
      `;
      sidebarBody.querySelectorAll('[data-ask-intro]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (previewSample && !getContacts().length) {
            onOpenCircle();
            return;
          }
          onRequestIntro({ connectorUid: friend.uid, connectorName: friend.name, targetCompany: btn.dataset.askIntro });
        });
      });
      return;
    }

    if (node.kind === 'second-company') {
      const friend = node.viaFriend;
      const co = node.data;
      sidebarBody.innerHTML = `
        <div class="inspector-card">
          <div class="inspector-head">
            <div class="inspector-avatar circle">${esc(initials(co.company))}</div>
            <div>
              <h3 class="inspector-title">${esc(co.company)}</h3>
              <p class="inspector-sub">Warm path via <strong>${esc(friend.name)}</strong></p>
            </div>
          </div>
          <p style="font-size:0.88rem; color:var(--ref-muted); line-height:1.5;">
            ${esc(friend.name)} has <strong>${co.count}</strong> ${co.count === 1 ? 'connection' : 'connections'} at ${esc(co.company)}. Request a private warm introduction below.
          </p>
          <button type="button" class="btn btn-primary" id="btn-ask-second-intro">Ask ${esc(friend.name.split(' ')[0])} for an intro</button>
        </div>
      `;
      sidebarBody.querySelector('#btn-ask-second-intro').addEventListener('click', () => {
        if (previewSample && !getContacts().length) {
          onOpenCircle();
          return;
        }
        onRequestIntro({ connectorUid: friend.uid, connectorName: friend.name, targetCompany: co.company });
      });
    }
  }

  function renderDirectory() {
    const companies = latestModel?.companies || [];
    const people = latestModel?.matchedContacts || [];
    const showingCompanies = latestModel?.effectiveMode === 'companies' && !searchQuery;

    if (showingCompanies) {
      sidebarBody.innerHTML = `
        <p class="kicker">${companies.length} organizations</p>
        <div class="dir-list">
          ${companies.slice(0, 80).map((co) => `
            <button type="button" class="dir-item ${expandedCompanyKey === co.key ? 'active' : ''}" data-pick-company="${esc(co.key)}">
              <div class="dir-item-main">
                <strong>${esc(co.name)}</strong>
                <small>${co.people.slice(0, 2).map((p) => esc(p.name)).join(', ')}</small>
              </div>
              <span class="dir-count">${co.people.length}</span>
            </button>
          `).join('') || `<p style="font-size:0.86rem; color:var(--ref-muted);">No organizations match this filter.</p>`}
        </div>
      `;
      wireCompanyPickers();
    } else {
      sidebarBody.innerHTML = `
        <p class="kicker">${people.length} matching people</p>
        <div class="dir-list">
          ${people.slice(0, 100).map((p) => `
            <button type="button" class="dir-item ${selectedNode?.id === 'person:' + p.id ? 'active' : ''}" data-pick-person="${esc(p.id)}">
              <div class="avatar-circle" style="background:${p.canIntroduce ? 'var(--ref-terracotta)' : 'var(--ref-olive)'};">
                ${p.photoUrl ? `<img src="${esc(p.photoUrl)}" alt="" />` : esc(initials(p.name))}
              </div>
              <div class="dir-item-main">
                <strong>${esc(p.name)}</strong>
                <small>${esc([p.role, p.company].filter(Boolean).join(' · ') || p.email || p.sources.join(' · '))}</small>
              </div>
              ${p.strength === 'strong' ? `<span class="badge google">Strong</span>` : p.canIntroduce ? `<span class="badge intro">Intro</span>` : ''}
            </button>
          `).join('') || `<p style="font-size:0.86rem; color:var(--ref-muted);">No contacts match “${esc(searchQuery)}”.</p>`}
        </div>
      `;
      wirePersonPickers();
    }
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
    if (sidebarTab === 'directory') renderDirectory();
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
    const badgeEl = container.querySelector('#circle-req-badge');
    badgeEl.innerHTML = pendingIn ? `<span class="badge intro" style="margin-left:4px;">${pendingIn}</span>` : '';

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
