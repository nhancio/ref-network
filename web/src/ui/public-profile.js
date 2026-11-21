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
      <div class="hp-root" style="min-height:100svh; display:grid; place-content:center; padding:32px; text-align:center;">
        <div style="max-width:420px; display:grid; gap:16px; justify-items:center;">
          <img src="/ref-logo-primary.svg" alt="Ref Network" style="height:24px;" />
          <h1 style="font-size:2rem; font-weight:600; letter-spacing:-0.03em;">Intro page not found</h1>
          <p style="color:#666560;">This link may have been turned off or moved by its owner.</p>
          <button type="button" class="hp-btn hp-btn-primary hp-btn-pill" id="pub-home">Open Ref Network</button>
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
    <div class="hp-root" style="min-height:100svh; display:flex; flex-direction:column;">
      <header class="hp-header">
        <div class="hp-wrap hp-nav">
          <a class="hp-brand" href="/" id="pub-brand"><img src="/ref-logo-primary.svg" alt="Ref Network" /></a>
          <div class="hp-nav-actions">
            <button type="button" class="hp-btn hp-btn-primary hp-btn-sm" id="pub-my-graph">${currentUser ? 'Open my 3D graph' : 'Build your graph'}</button>
          </div>
        </div>
      </header>

      <section class="hp-hero" style="padding:48px 0 40px;">
        <div class="hp-wrap hp-network-grid" style="align-items:center;">
          <div class="hp-hero-copy">
            <div class="hp-news-pill" style="cursor:default;">ref.nhancio.com/u/${esc(publicProfile.handle)}</div>
            <div style="display:flex; align-items:center; gap:16px;">
              <div class="inspector-avatar" style="width:52px; height:52px;">
                ${safePhoto ? `<img src="${esc(safePhoto)}" alt="" />` : esc(initials(publicProfile.displayName))}
              </div>
              <div>
                <h1 style="font-size:clamp(2rem, 3.6vw, 2.85rem); margin:0;">${esc(publicProfile.displayName)}</h1>
                ${publicProfile.headline ? `<p style="color:#666560; margin-top:4px; font-size:0.95rem;">${esc(publicProfile.headline)}</p>` : ''}
              </div>
            </div>
            <p class="hp-hero-sub">
              ${esc(firstName)} can make warm introductions across <strong>${companies.length} ${companies.length === 1 ? 'organization' : 'organizations'}</strong>. Only company names and counts are shown here.
            </p>
            <div class="hp-cta-row">
              <a class="hp-btn hp-btn-primary hp-btn-pill" href="#pub-directory">Browse organizations</a>
              ${safeLinkedIn ? `<a class="hp-btn hp-btn-google hp-btn-pill" href="${esc(safeLinkedIn)}" target="_blank" rel="noopener">LinkedIn profile ↗</a>` : ''}
            </div>
          </div>

          <div class="hp-3d-shell">
            <div class="hp-3d-canvas" id="pub-3d-host" style="height:380px;"></div>
            <div class="hp-3d-footer">
              <div>
                <div class="hp-3d-route" id="pub-hud-route">${esc(publicProfile.displayName)} · ${companies.length} organizations</div>
                <div class="hp-3d-detail" id="pub-hud-detail">Select any node to inspect · Personal emails and phones stay private</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="hp-network-section" id="pub-directory" style="flex:1; padding-top:48px;">
        <div class="hp-wrap">
          <div style="display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:24px;">
            <div>
              <h2 style="font-size:clamp(1.6rem, 3vw, 2.2rem); font-weight:600; letter-spacing:-0.03em;">Where ${esc(firstName)} can introduce you</h2>
            </div>
            <input type="search" id="pub-search" class="ws-search" style="max-width:300px;" placeholder="Filter organizations" />
          </div>
          <div id="pub-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:16px;"></div>
        </div>
      </section>

      <footer class="hp-footer">
        <div class="hp-wrap hp-footer-bottom" style="padding-top:0; border-top:0;">
          <span>Ref Network · ref.nhancio.com</span>
          <div style="display:flex; gap:18px;">
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
      <article class="hp-org-card">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <h3>${esc(c.company)}</h3>
          <span class="dir-count">${c.count}</span>
        </div>
        <p>${c.introCount ? `${c.introCount} marked ready to intro` : `${c.count} connections`}</p>
        ${isOwner
          ? `<span class="badge" style="width:fit-content;">Your public listing</span>`
          : `<button type="button" class="btn btn-primary btn-sm" data-req-co="${esc(c.company)}">Ask ${esc(firstName)} for an intro</button>`}
      </article>
    `).join('') || `<p style="color:#666560;">No organizations match “${esc(filter)}”.</p>`;

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
