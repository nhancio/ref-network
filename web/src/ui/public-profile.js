import { create3DGraph } from './graph-3d.js';
import { safeHttpUrl } from '../lib/dedupe.js';
import { esc } from './modals.js';

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || '?').slice(0, 2).toUpperCase();
}

export function mountPublicProfile(container, {
  publicProfile,
  currentUser,
  onOpenAuth,
  onRequestIntro,
  onGoHome,
}) {
  if (!publicProfile) {
    container.innerHTML = `
      <div class="lp-root" style="min-height:100svh; display:grid; place-content:center; padding:32px; text-align:center;">
        <div style="max-width:420px; display:grid; gap:16px; justify-items:center;">
          <img src="/ref-logo-reverse.svg" alt="Ref Network" style="height:24px;" />
          <h1 style="font-family:var(--font-serif); font-size:2.5rem; font-weight:400;">Intro page not found</h1>
          <p style="color:#aca69b;">This link may have been turned off or moved by its owner.</p>
          <button type="button" class="lp-btn lp-btn-light" id="pub-home">Open Ref Network</button>
        </div>
      </div>
    `;
    container.querySelector('#pub-home').addEventListener('click', onGoHome);
    return { destroy() {} };
  }

  const companies = publicProfile.introCompanies || [];
  const isOwner = currentUser && currentUser.uid === publicProfile.uid;
  const firstName = publicProfile.displayName.split(' ')[0];
  const safeLinkedIn = safeHttpUrl(publicProfile.linkedinUrl);
  const safePhoto = safeHttpUrl(publicProfile.photoUrl);

  container.innerHTML = `
    <div class="lp-root" style="min-height:100svh; display:flex; flex-direction:column;">
      <header class="lp-header">
        <div class="lp-wrap lp-nav">
          <a class="lp-brand" href="/" id="pub-brand"><img src="/ref-logo-reverse.svg" alt="Ref Network" /></a>
          <div class="lp-nav-actions">
            <button type="button" class="lp-btn lp-btn-light lp-btn-sm" id="pub-my-graph">${currentUser ? 'Open my graph' : 'Build your graph'}</button>
          </div>
        </div>
      </header>

      <section class="lp-hero" style="min-height:auto; padding:48px 0;">
        <div class="lp-wrap lp-hero-layout">
          <div class="lp-hero-copy">
            <p class="lp-label lp-label-dark">ref.nhancio.com/u/${esc(publicProfile.handle)}</p>
            <div style="display:flex; align-items:center; gap:16px; margin-top:12px;">
              <div class="inspector-avatar" style="width:52px; height:52px;">
                ${safePhoto ? `<img src="${esc(safePhoto)}" alt="" />` : esc(initials(publicProfile.displayName))}
              </div>
              <div>
                <h1 style="font-size:clamp(2.25rem, 4vw, 3.25rem); margin:0;">${esc(publicProfile.displayName)}</h1>
                ${publicProfile.headline ? `<p style="color:#aca69b; margin-top:4px; font-size:0.95rem;">${esc(publicProfile.headline)}</p>` : ''}
              </div>
            </div>
            <p class="lp-hero-sub">
              ${esc(firstName)} can make warm introductions across ${companies.length} ${companies.length === 1 ? 'organization' : 'organizations'}. Only company names and counts are shown here.
            </p>
            <div class="lp-hero-actions">
              <a class="lp-btn lp-btn-light" href="#pub-directory">Browse organizations</a>
              ${safeLinkedIn ? `<a class="lp-text-action" href="${esc(safeLinkedIn)}" target="_blank" rel="noopener">LinkedIn profile</a>` : ''}
            </div>
          </div>

          <div class="lp-stage-frame">
            <div class="lp-stage-canvas" id="pub-3d-host"></div>
            <div class="lp-stage-bar">
              <div class="lp-stage-readout">
                <div class="lp-route-line" id="pub-hud-route">${esc(publicProfile.displayName)} · ${companies.length} organizations</div>
                <div class="lp-route-meta" id="pub-hud-detail">Select any node to inspect · Personal emails and phones remain private</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="lp-paper-section" id="pub-directory" style="flex:1;">
        <div class="lp-wrap">
          <div style="display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:24px;">
            <div>
              <p class="lp-label">Organizations</p>
              <h2 style="font-family:var(--font-serif); font-size:clamp(2rem, 3.5vw, 2.75rem); font-weight:400; margin-top:8px;">Where ${esc(firstName)} can introduce you</h2>
            </div>
            <input type="search" id="pub-search" class="ws-search" style="max-width:300px;" placeholder="Filter organizations" />
          </div>
          <div id="pub-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:16px;"></div>
        </div>
      </section>

      <footer class="lp-footer">
        <div class="lp-wrap lp-footer-inner">
          <a class="lp-brand" href="/"><img src="/ref-logo-primary.svg" alt="Ref Network" /></a>
          <div class="lp-footer-links">
            <a href="/privacy">Privacy policy</a>
            <a href="/terms">Terms of service</a>
          </div>
        </div>
      </footer>
    </div>
  `;

  const graphModel = {
    nodes: [
      { id: 'you', kind: 'you', label: publicProfile.displayName, radius: 34 },
      ...companies.slice(0, 24).map((c) => ({
        id: `company:${c.companyKey}`,
        kind: 'company',
        label: c.company,
        count: c.count,
        introCount: c.introCount || 1,
        data: c,
      })),
    ],
    edges: companies.slice(0, 24).map((c) => ({
      from: 'you',
      to: `company:${c.companyKey}`,
      kind: 'intro',
    })),
  };

  const routeEl = container.querySelector('#pub-hud-route');
  const detailEl = container.querySelector('#pub-hud-detail');
  const graph = create3DGraph(container.querySelector('#pub-3d-host'), {
    autoRotate: true,
    initialDistance: 13.8,
    onSelect(node) {
      if (node.kind === 'company') {
        routeEl.textContent = `${publicProfile.displayName} → ${node.label}`;
        detailEl.textContent = `${node.count} ${node.count === 1 ? 'connection' : 'connections'} · Request an intro below`;
      }
    },
  });
  graph.setData(graphModel);

  const gridEl = container.querySelector('#pub-grid');
  function renderList(filter = '') {
    const q = filter.trim().toLowerCase();
    const list = q ? companies.filter((c) => c.company.toLowerCase().includes(q)) : companies;
    gridEl.innerHTML = list.map((c) => `
      <article class="lp-panel" style="padding:20px; gap:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <h3 style="font-size:1rem; font-weight:500;">${esc(c.company)}</h3>
          <span class="dir-count">${c.count}</span>
        </div>
        <p style="font-size:0.85rem; color:var(--ref-muted);">${c.introCount ? `${c.introCount} marked ready to intro` : `${c.count} connections`}</p>
        ${isOwner
          ? `<span class="badge" style="width:fit-content;">Your public listing</span>`
          : `<button type="button" class="btn btn-primary btn-sm" data-req-co="${esc(c.company)}">Ask ${esc(firstName)} for an intro</button>`}
      </article>
    `).join('') || `<p style="color:var(--ref-muted);">No organizations match “${esc(filter)}”.</p>`;

    gridEl.querySelectorAll('[data-req-co]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!currentUser) {
          onOpenAuth('signin');
          return;
        }
        onRequestIntro({
          connectorUid: publicProfile.uid,
          connectorName: publicProfile.displayName,
          targetCompany: btn.dataset.reqCo,
        });
      });
    });
  }
  renderList();

  container.querySelector('#pub-search').addEventListener('input', (e) => renderList(e.target.value));
  container.querySelector('#pub-my-graph').addEventListener('click', onGoHome);
  container.querySelector('#pub-brand').addEventListener('click', (e) => {
    e.preventDefault();
    onGoHome();
  });

  return {
    destroy() {
      graph.destroy();
    },
  };
}
