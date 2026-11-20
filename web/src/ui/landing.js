import { buildGraphModel } from '../lib/graph-model.js';
import { SAMPLE_USER, SAMPLE_CONTACTS, SAMPLE_CIRCLE } from '../lib/sample-data.js';
import { create3DGraph } from './graph-3d.js';

export function mountLanding(container, { onOpenAuth, pendingInvite }) {
  container.innerHTML = `
    <div class="lp-root" id="top">
      <header class="lp-header">
        <div class="lp-wrap lp-nav">
          <a class="lp-brand" href="#top" aria-label="Ref Network">
            <img src="/ref-logo-reverse.svg" alt="Ref Network" />
          </a>
          <nav class="lp-nav-links" aria-label="Primary">
            <a href="#how-it-works">How it works</a>
            <a href="#privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </nav>
          <div class="lp-nav-actions">
            <button type="button" class="lp-text-action" id="nav-signin">Sign in</button>
            <button type="button" class="lp-btn lp-btn-light lp-btn-sm" id="nav-start">Open graph</button>
          </div>
        </div>
      </header>

      <main>
        <section class="lp-hero">
          <div class="lp-wrap lp-hero-layout">
            <div class="lp-hero-copy">
              ${pendingInvite ? `
                <div class="lp-invite-note">
                  <span>A friend sent you a private circle invite</span>
                  <button type="button" id="btn-invite-signin">Sign in to accept</button>
                </div>
              ` : ''}
              <h1>See who you know at any company</h1>
              <p class="lp-hero-sub">
                Combine your LinkedIn export and Google Contacts into one private 3D map. Find direct connections, trace second-degree paths through trusted friends, and send warm introductions on WhatsApp.
              </p>
              <div class="lp-hero-actions">
                <button type="button" class="lp-btn lp-btn-light" id="hero-start">Continue with Google or email</button>
                <a class="lp-text-action" href="#how-it-works">How it works</a>
              </div>
            </div>

            <div class="lp-stage-frame">
              <div class="lp-stage-canvas" id="landing-graph-host" aria-label="Interactive 3D sample network"></div>
              <div class="lp-stage-bar">
                <div class="lp-stage-readout">
                  <div class="lp-route-line" id="landing-route">Nithin → Swiggy</div>
                  <div class="lp-route-meta" id="landing-detail">3 direct contacts · Rohan Deshmukh, Kavya Nair, Siddharth Menon</div>
                </div>
                <div class="lp-route-switcher" role="group" aria-label="Sample routes">
                  <button type="button" class="lp-route-tab active" data-fly="company:swiggy">Swiggy</button>
                  <button type="button" class="lp-route-tab" data-fly="company:razorpay">Razorpay</button>
                  <button type="button" class="lp-route-tab" data-fly="second:circle-asha:araku coffee">Araku Coffee</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="lp-paper-section" id="how-it-works">
          <div class="lp-wrap">
            <div class="lp-section-intro">
              <p class="lp-label">How it works</p>
              <h2>One map from LinkedIn, Google Contacts, and your circle</h2>
            </div>

            <div class="lp-split-panels">
              <article class="lp-panel">
                <div class="lp-panel-copy">
                  <h3>Merge LinkedIn and phone contacts automatically</h3>
                  <p>Drop LinkedIn’s full zip export or sync Google Contacts. Ref infers companies from work email domains, deduplicates overlaps, and ranks who you actually know when message timestamps are included.</p>
                </div>
                <div class="lp-preview-table" aria-label="Sample merged organization reach">
                  <div class="lp-preview-head">
                    <span>Organization</span>
                    <span>Sources</span>
                    <span class="num">People</span>
                  </div>
                  <div class="lp-preview-row is-accent">
                    <strong>Swiggy</strong>
                    <span>LinkedIn, Google</span>
                    <span class="num">3</span>
                  </div>
                  <div class="lp-preview-row">
                    <strong>Razorpay</strong>
                    <span>LinkedIn, work email</span>
                    <span class="num">2</span>
                  </div>
                  <div class="lp-preview-row">
                    <strong>Mango Yard</strong>
                    <span>Google, manual</span>
                    <span class="num">2</span>
                  </div>
                  <div class="lp-preview-row">
                    <strong>Peak XV Partners</strong>
                    <span>LinkedIn</span>
                    <span class="num">1</span>
                  </div>
                </div>
              </article>

              <article class="lp-panel lp-panel-narrow">
                <div class="lp-panel-copy">
                  <h3>Approve every introduction before anything is shared</h3>
                  <p>Friends in your circle see which companies you can reach, never raw phone numbers or emails. When they ask for an intro, you review the context and forward it on WhatsApp or email.</p>
                </div>
                <div class="lp-intro-card" aria-label="Sample warm introduction request">
                  <div class="lp-intro-meta">Warm intro request</div>
                  <div class="lp-intro-heading">Ananya asked for an intro</div>
                  <div class="lp-intro-sub">Mango Yard · Partnerships</div>
                  <div class="lp-chain" aria-hidden="true">
                    <span class="lp-chain-node">AR</span>
                    <span class="lp-chain-wire"></span>
                    <span class="lp-chain-node is-mid">ND</span>
                    <span class="lp-chain-wire"></span>
                    <span class="lp-chain-node is-end">MY</span>
                  </div>
                  <div class="lp-intro-actions">
                    <span class="lp-mock-primary">Vouch and share</span>
                    <span class="lp-mock-quiet">Decline</span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section class="lp-dark-section" id="privacy">
          <div class="lp-wrap lp-story-layout">
            <figure class="lp-photo-figure">
              <img src="/landing-hero.jpg" width="1440" height="960" alt="A shopper showing her phone to a neighbourhood shopkeeper in Bengaluru" loading="lazy" />
              <figcaption>Built in Bengaluru for referrals that start in real conversations</figcaption>
            </figure>

            <div class="lp-facts">
              <p class="lp-label lp-label-dark">Privacy and control</p>
              <h2>Your contacts stay locked to your account</h2>
              <dl class="lp-fact-list">
                <div>
                  <dt>Private Firestore vault</dt>
                  <dd>Imported contacts live under <code>users/{uid}/contacts</code> with security rules blocking every other account from reading them.</dd>
                </div>
                <div>
                  <dt>Company reach only</dt>
                  <dd>Your Ref Circle and optional public page at <code>/u/your-handle</code> show only organization names and counts, never personal emails or phone numbers.</dd>
                </div>
                <div>
                  <dt>Export or delete anytime</dt>
                  <dd>Download a JSON backup, clear a single import source, or permanently delete your account and vault from inside the app.</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section class="lp-closing">
          <div class="lp-wrap lp-closing-inner">
            <h2>Map your network in a minute</h2>
            <p>Sign in with Google or email, connect your contacts, and explore your own 3D graph.</p>
            <button type="button" class="lp-btn lp-btn-accent" id="final-start">Sign in to Ref Network</button>
          </div>
        </section>
      </main>

      <footer class="lp-footer">
        <div class="lp-wrap lp-footer-inner">
          <a class="lp-brand" href="#top"><img src="/ref-logo-primary.svg" alt="Ref Network" /></a>
          <div class="lp-footer-links">
            <a href="/privacy">Privacy policy</a>
            <a href="/terms">Terms of service</a>
            <a href="https://github.com/nhancio/ref-network" target="_blank" rel="noopener">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  `;

  let expandedCompanyKey = 'swiggy';
  const routeEl = container.querySelector('#landing-route');
  const detailEl = container.querySelector('#landing-detail');
  const tabs = container.querySelectorAll('.lp-route-tab');

  function updateReadout(node) {
    if (!node || node.kind === 'you') {
      routeEl.textContent = 'Nithin';
      detailEl.textContent = `${SAMPLE_CONTACTS.length} direct contacts across ${new Set(SAMPLE_CONTACTS.map((c) => c.companyKey)).size} organizations · Drag to orbit`;
      return;
    }
    if (node.kind === 'company') {
      routeEl.textContent = `Nithin → ${node.label}`;
      detailEl.textContent = `${node.count} direct ${node.count === 1 ? 'contact' : 'contacts'} · ${node.data.people.map((p) => p.name).slice(0, 3).join(', ')}`;
    } else if (node.kind === 'second-company') {
      routeEl.textContent = `Nithin → ${node.viaFriend.name} → ${node.label}`;
      detailEl.textContent = `Second-degree path via ${node.viaFriend.name.split(' ')[0]} · ${node.data.count} contacts`;
    } else if (node.kind === 'circle') {
      routeEl.textContent = `Nithin — ${node.label}`;
      detailEl.textContent = `Circle bridge · ${node.data.sharedCompanies.map((c) => c.company).join(', ')}`;
    } else if (node.kind === 'person') {
      routeEl.textContent = `Nithin → ${node.label}`;
      detailEl.textContent = [node.data.role, node.data.company].filter(Boolean).join(' · ');
    }
  }

  let latestModel = null;
  const graph = create3DGraph(container.querySelector('#landing-graph-host'), {
    autoRotate: true,
    initialDistance: 14.4,
    onSelect(node) {
      if (node.kind === 'company') {
        expandedCompanyKey = expandedCompanyKey === node.data.key ? null : node.data.key;
        updateSampleGraph(true);
      }
      updateReadout(node);
    },
    onHover(node) {
      if (node) updateReadout(node);
    },
  });

  function updateSampleGraph(keepCamera = false) {
    latestModel = buildGraphModel({
      user: SAMPLE_USER,
      contacts: SAMPLE_CONTACTS,
      circleConnections: SAMPLE_CIRCLE,
      mode: 'companies',
      expandedCompanyKey,
    });
    graph.setData(latestModel, { keepCamera });
  }
  updateSampleGraph(false);

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      const targetId = tab.dataset.fly;
      if (targetId.startsWith('company:')) {
        expandedCompanyKey = targetId.slice('company:'.length);
        updateSampleGraph(true);
      }
      const targetNode = latestModel?.nodes.find((n) => n.id === targetId);
      if (targetNode) {
        graph.focusNode(targetId);
        updateReadout(targetNode);
      }
    });
  });

  container.querySelector('#nav-signin').addEventListener('click', () => onOpenAuth('signin'));
  container.querySelector('#nav-start').addEventListener('click', () => onOpenAuth('signup'));
  container.querySelector('#hero-start').addEventListener('click', () => onOpenAuth('signin'));
  container.querySelector('#final-start').addEventListener('click', () => onOpenAuth('signin'));
  container.querySelector('#btn-invite-signin')?.addEventListener('click', () => onOpenAuth('signin'));

  return {
    destroy() {
      graph.destroy();
    },
  };
}
