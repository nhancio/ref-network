import { create3DGraph } from './graph-3d.js';
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
        <div style="max-width:440px;">
          <img src="/ref-logo-reverse.svg" alt="Ref Network" style="height:26px; margin-bottom:24px;" />
          <h1 style="font-family:var(--font-serif); font-size:2.6rem; font-weight:400;">Intro page not found</h1>
          <p style="color:#c5cbb9; margin:12px 0 24px;">This link may have been turned off or moved by its owner.</p>
          <button type="button" class="lp-btn lp-btn-accent" id="pub-home">Explore Ref Network →</button>
        </div>
      </div>
    `;
    container.querySelector('#pub-home').addEventListener('click', onGoHome);
    return { destroy() {} };
  }

  const companies = publicProfile.introCompanies || [];
  const isOwner = currentUser && currentUser.uid === publicProfile.uid;

  container.innerHTML = `
    <div class="lp-root" style="min-height:100svh; display:flex; flex-direction:column;">
      <header class="lp-nav-wrap">
        <div class="lp-wrap lp-nav">
          <a class="lp-brand" href="/" id="pub-brand"><img src="/ref-logo-reverse.svg" alt="Ref Network" /></a>
          <div class="lp-nav-cta">
            <button type="button" class="lp-btn lp-btn-glass" id="pub-my-graph">${currentUser ? 'Open my 3D graph' : 'Build your own graph'}</button>
          </div>
        </div>
      </header>

      <section class="lp-hero" style="min-height:auto; padding:112px 0 56px;">
        <div class="lp-hero-3d" id="pub-3d-host"></div>
        <div class="lp-hero-scrim" aria-hidden="true"></div>
        <div class="lp-wrap lp-hero-grid" style="min-height:460px;">
          <div class="lp-hero-copy">
            <div class="lp-eyebrow-pill"><span class="lp-dot"></span>Verified Warm-Intro Reach · ref.nhancio.com/u/${esc(publicProfile.handle)}</div>
            <div style="display:flex; align-items:center; gap:14px; margin-top:20px;">
              <div class="inspector-avatar" style="width:56px; height:56px; font-size:1.3rem;">
                ${publicProfile.photoUrl ? `<img src="${esc(publicProfile.photoUrl)}" alt="" />` : esc(initials(publicProfile.displayName))}
              </div>
              <div>
                <h1 style="font-size:clamp(2.4rem, 4.5vw, 3.8rem); margin:0;">${esc(publicProfile.displayName)}</h1>
                ${publicProfile.headline ? `<p style="color:#cfd5c3; margin-top:4px;">${esc(publicProfile.headline)}</p>` : ''}
              </div>
            </div>
            <p class="lp-hero-sub" style="margin-top:16px;">
              ${esc(publicProfile.displayName.split(' ')[0])} can make warm introductions across <strong>${companies.length} organizations</strong>. Pick any organization below to send a private intro request.
            </p>
            <div class="lp-cta-row">
              ${publicProfile.linkedinUrl ? `<a class="lp-btn lp-btn-glass" href="${esc(publicProfile.linkedinUrl)}" target="_blank" rel="noopener">View LinkedIn ↗</a>` : ''}
              <a class="lp-btn lp-btn-accent" href="#pub-directory">Browse ${companies.length} organizations ↓</a>
            </div>
          </div>
          <div class="lp-hero-hud">
            <div class="lp-hud-card">
              <div class="lp-hud-head">
                <span class="lp-hud-tag">PRIVACY PROTECTED</span>
                <span class="lp-hud-hint">Drag to orbit · Scroll to zoom</span>
              </div>
              <div class="lp-hud-route" id="pub-hud-route">${esc(publicProfile.displayName)} → ${companies.length} organizations</div>
              <div class="lp-hud-detail" id="pub-hud-detail">Only company names and counts are visible. Personal emails &amp; phone numbers stay locked in ${esc(publicProfile.displayName.split(' ')[0])}’s vault.</div>
            </div>
          </div>
        </div>
      </section>

      <section class="lp-bento-section" id="pub-directory" style="flex:1;">
        <div class="lp-wrap">
          <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:16px; margin-bottom:24px;">
            <div>
              <p class="kicker">Warm Intro Directory</p>
              <h2 style="font-family:var(--font-serif); font-size:clamp(2rem, 3.6vw, 3rem); font-weight:400; margin-top:6px;">Where ${esc(publicProfile.displayName.split(' ')[0])} can introduce you</h2>
            </div>
            <input type="search" id="pub-search" class="ws-search" style="max-width:340px;" placeholder="Filter organizations…" />
          </div>

          <div id="pub-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:14px;"></div>
        </div>
      </section>

      <footer class="lp-footer">
        <div class="lp-wrap lp-footer-inner">
          <a class="lp-brand" href="/"><img src="/ref-logo-reverse.svg" alt="Ref Network" style="height:20px;" /></a>
          <div style="display:flex; gap:18px;">
            <a href="/privacy" style="color:#cfd5c3;">Privacy Policy</a>
            <a href="/terms" style="color:#cfd5c3;">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  `;

  // Build lightweight 3D graph model of publicProfile's introCompanies
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
        detailEl.textContent = `${node.count} ${node.count === 1 ? 'connection' : 'connections'} · Click “Ask for intro” below to connect.`;
      }
    },
  });
  graph.setData(graphModel);

  const gridEl = container.querySelector('#pub-grid');
  function renderList(filter = '') {
    const q = filter.trim().toLowerCase();
    const list = q ? companies.filter((c) => c.company.toLowerCase().includes(q)) : companies;
    gridEl.innerHTML = list.map((c) => `
      <article class="step-card" style="padding:18px; gap:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <h3 style="font-family:var(--font-display); font-size:1.05rem;">${esc(c.company)}</h3>
          <span class="dir-count">${c.count}</span>
        </div>
        <p style="font-size:0.83rem; color:var(--ref-muted);">${c.introCount ? `${c.introCount} ready to intro` : `${c.count} connections`}</p>
        ${isOwner
          ? `<span class="badge" style="width:fit-content;">Your public listing</span>`
          : `<button type="button" class="btn btn-primary btn-sm" data-req-co="${esc(c.company)}">Ask ${esc(publicProfile.displayName.split(' ')[0])} for an intro</button>`}
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
