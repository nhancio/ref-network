import { buildGraphModel } from '../lib/graph-model.js';
import { SAMPLE_USER, SAMPLE_CONTACTS, SAMPLE_CIRCLE } from '../lib/sample-data.js';
import { create3DGraph } from './graph-3d.js';

const GOOGLE_G_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
</svg>`;

const DEMO_SCENARIOS = [
  {
    prompt: 'Who do I know at Swiggy?',
    followUp: 'See how Nithin handles Uma’s Myntra intro request →',
    sources: ['Your contacts', 'Your circle (Uma, Asha)'],
    results: [
      {
        initials: 'UM',
        tone: 'warm',
        name: 'Swiggy · 3 contacts via Uma',
        via: 'Nithin → Uma → Swiggy (VP Product, Design Lead)',
        bio: 'Uma’s contacts stay private. Ask Uma to vouch and introduce you.',
        action: 'Ask Uma for an intro',
      },
      {
        initials: 'MY',
        tone: 'sage',
        name: 'Myntra · 2 direct contacts',
        via: 'In your Google Contacts (Priya Nair, Karthik Reddy)',
        bio: 'Direct connections in your own vault — ready to introduce friends.',
      },
      {
        initials: 'AM',
        tone: 'stone',
        name: 'Araku Coffee · 2 contacts via Asha',
        via: 'Nithin → Asha → Araku Coffee (Head of Retail)',
        bio: '2nd-degree warm path through your Ref Circle.',
      },
    ],
  },
  {
    prompt: 'Incoming request: Uma wants an intro at Myntra',
    followUp: '← Back: Nithin searches “Swiggy” via Uma',
    sources: ['Requests tab (live)', 'Your private Myntra contacts'],
    results: [
      {
        initials: 'UM',
        tone: 'warm',
        name: 'Uma requested an intro at Myntra',
        via: '“Looking to connect with someone on Myntra’s growth team.”',
        bio: 'Only you see which Myntra contacts are in your vault.',
      },
      {
        initials: 'PN',
        tone: 'sage',
        name: 'Pick your contact: Priya Nair (Growth Lead)',
        via: 'Matched privately from your Google Contacts',
        bio: 'Click Vouch & send — Ref prefills a WhatsApp or email intro to Priya.',
        action: 'Vouch & send on WhatsApp',
      },
    ],
  },
];

export function mountLanding(container, { onOpenAuth, onGoogleSignIn, pendingInvite }) {
  let scenarioIndex = 0;

  container.innerHTML = `
    <div class="hp-root" id="top">
      <header class="hp-header">
        <div class="hp-wrap hp-nav">
          <a class="hp-brand" href="#top" aria-label="Ref Network">
            <img src="/ref-logo-primary.svg" alt="Ref Network" />
          </a>
          <nav class="hp-nav-links" aria-label="Primary">
            <a href="#how-it-works">How it works</a>
            <a href="#graph-preview">3D graph</a>
            <a href="#privacy">Privacy</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div class="hp-nav-actions">
            <button type="button" class="hp-link-btn" id="nav-signin">Log in</button>
            <button type="button" class="hp-btn hp-btn-primary hp-btn-sm" id="nav-start">Sign up</button>
          </div>
        </div>
      </header>

      <main>
        ${pendingInvite ? `
          <div class="hp-wrap" style="padding-top:20px;">
            <div class="hp-invite-banner">
              <span>A friend invited you to join their private Ref Circle. Sign in to connect your graphs.</span>
              <button type="button" class="hp-btn hp-btn-primary hp-btn-sm" id="btn-invite-signin">Accept invite</button>
            </div>
          </div>
        ` : ''}

        <!-- Hero: Happenstance-clean light split with Nithin <-> Uma warm-intro use cases -->
        <section class="hp-hero">
          <div class="hp-wrap hp-hero-grid">
            <div class="hp-hero-copy">
              <a class="hp-news-pill" href="#graph-preview">
                <span>Privacy-first 3D referral graph</span>
                <span aria-hidden="true">›</span>
              </a>
              <h1>Your next opportunity<br />is one intro away.</h1>
              <p class="hp-hero-sub">
                Search any company across your contacts and trusted friends. See who can introduce you in 3D — without ever exposing private phone numbers or contact lists.
              </p>
              <div class="hp-cta-row">
                <button type="button" class="hp-btn hp-btn-primary hp-btn-pill" id="hero-start">Search for free</button>
                <button type="button" class="hp-btn hp-btn-google hp-btn-pill" id="hero-google">
                  ${GOOGLE_G_SVG}
                  <span>Continue with Google</span>
                </button>
              </div>
              <p class="hp-hero-footnote">
                Syncs with <strong>Google Contacts</strong> · Works with private <strong>Friend Circles</strong>
              </p>
            </div>

            <div class="hp-hero-visual">
              <div class="hp-backdrop-plate" aria-hidden="true"></div>
              <div class="hp-search-card" id="hero-search-card"></div>
            </div>
          </div>
        </section>

        <!-- Section 2: 4-step communication + OUR signature live 3D Three.js Graph -->
        <section class="hp-network-section" id="how-it-works">
          <div class="hp-wrap">
            <div class="hp-center-head">
              <h2>Your network is bigger than you think</h2>
              <p>Connect your contacts and invite trusted friends. Search who knows someone at Swiggy, or vouch when a friend asks for an intro at Myntra.</p>
            </div>

            <div class="hp-network-grid" id="graph-preview">
              <ol class="hp-steps" role="tablist" aria-label="How Ref Network works">
                <li class="hp-step active" data-step="0">
                  <button type="button">
                    <strong>1. Sync your contacts privately</strong>
                    <span>Connect Google Contacts in one click. Companies are inferred automatically from work emails and locked in your private vault.</span>
                  </button>
                </li>
                <li class="hp-step" data-step="1">
                  <button type="button">
                    <strong>2. Invite trusted friends like Uma</strong>
                    <span>Share a private one-time link. Your circle sees only anonymized company &amp; role counts — never names, emails, or phone numbers.</span>
                  </button>
                </li>
                <li class="hp-step" data-step="2">
                  <button type="button">
                    <strong>3. Search Swiggy &amp; ask Uma for an intro</strong>
                    <span>See the 3D path (Nithin → Uma → Swiggy · VP Product) and send Uma a private referral request instead of reaching out cold.</span>
                  </button>
                </li>
                <li class="hp-step" data-step="3">
                  <button type="button">
                    <strong>4. Receive &amp; vouch Myntra requests live</strong>
                    <span>When Uma asks you for a Myntra intro, it arrives in your Requests tab with your private Myntra contacts ready to forward on WhatsApp.</span>
                  </button>
                </li>
              </ol>

              <div class="hp-3d-shell">
                <div class="hp-3d-topbar">
                  <div class="hp-source-chips">
                    <span class="hp-src-chip"><strong>Contacts</strong> 10</span>
                    <span class="hp-src-chip is-accent"><strong>Circle</strong> Uma, Asha</span>
                  </div>
                  <div class="hp-3d-fly-tabs" role="group" aria-label="Focus 3D path">
                    <button type="button" class="hp-fly-btn active" data-fly="second:circle-uma:swiggy">Swiggy (via Uma)</button>
                    <button type="button" class="hp-fly-btn" data-fly="company:myntra">Myntra</button>
                    <button type="button" class="hp-fly-btn" data-fly="second:circle-asha:araku coffee">Araku</button>
                  </div>
                </div>
                <div class="hp-3d-canvas" id="landing-graph-host" aria-label="Interactive 3D network graph"></div>
                <div class="hp-3d-footer">
                  <div>
                    <div class="hp-3d-route" id="landing-route">Nithin → Uma → Swiggy</div>
                    <div class="hp-3d-detail" id="landing-detail">2nd-degree warm path · 3 contacts (VP Product, Design Lead) · Private until Uma vouches</div>
                  </div>
                  <span class="hp-3d-hint">Drag to orbit · Scroll to zoom</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Section 3: Private and secure -->
        <section class="hp-privacy-section" id="privacy">
          <div class="hp-wrap hp-privacy-inner">
            <h2>Private by design — nobody sees your contacts</h2>
            <p>
              Nithin cannot read Uma’s contacts, and Uma cannot read Nithin’s. Every imported contact stays locked in your private Firestore vault (<code>users/{uid}/contacts</code>). Your friends only see anonymized company &amp; role counts so they can ask you to make a warm introduction.
            </p>
            <div class="hp-trust-row">
              <div class="hp-trust-item">
                <strong>Double-blind discovery</strong>
                <span>Friends see “3 contacts at Swiggy (VP Product)” via Uma — never third-party names, emails, or phone numbers.</span>
              </div>
              <div class="hp-trust-item">
                <strong>You approve every intro</strong>
                <span>When Uma requests a Myntra intro, only you see your Myntra contacts and choose who to connect on WhatsApp.</span>
              </div>
              <div class="hp-trust-item">
                <strong>Google verified &amp; deletable</strong>
                <span>Read-only Google Contacts under Limited Use rules. Export a JSON backup or wipe your account anytime.</span>
              </div>
            </div>
            <a class="hp-text-link" href="/privacy">Read our privacy policy →</a>
          </div>
        </section>

        <!-- Section 4: FAQ Accordion -->
        <section class="hp-faq-section" id="faq">
          <div class="hp-wrap hp-faq-wrap">
            <h2>Frequently asked questions</h2>
            <div class="hp-faq-list">
              <details open>
                <summary>Can my friends see the names or phone numbers of my contacts?</summary>
                <p>No. Your raw Google Contacts are strictly private to your account (<code>users/{uid}/contacts</code>). Friends in your Ref Circle only see anonymized organization and role summaries (for example, “3 contacts at Swiggy · VP Product”) so they know to ask you for a warm introduction.</p>
              </details>
              <details>
                <summary>How do I ask a friend for a referral?</summary>
                <p>Search any company (like “Swiggy”) in your workspace. The 3D graph highlights the path through your friend (You → Uma → Swiggy). Click “Ask Uma for an intro” and include a short note explaining why you want to connect.</p>
              </details>
              <details>
                <summary>How do I receive and handle incoming intro requests?</summary>
                <p>Incoming requests appear live in the <strong>Requests</strong> tab inside your workspace with an unread badge. Ref privately shows your matching contacts for that company (only visible to you) so you can pick the right person and forward a prefilled intro on WhatsApp or email in one click.</p>
              </details>
              <details>
                <summary>Does Ref message or email my contacts automatically?</summary>
                <p>Never. Ref prepares a draft intro message for you to review and send yourself through WhatsApp or email. You can also decline any request quietly.</p>
              </details>
              <details>
                <summary>Can I delete my contacts or account later?</summary>
                <p>Yes. Open Connect Contacts → Vault controls to clear a single source, export a JSON backup, or permanently delete all your data and account.</p>
              </details>
            </div>
          </div>
        </section>

        <!-- Section 5: Final CTA -->
        <section class="hp-final-section">
          <div class="hp-wrap hp-final-inner">
            <h2>Make your own warm intros</h2>
            <p>Connect your Google Contacts, invite your inner circle, and explore your 3D warm-intro graph.</p>
            <div class="hp-cta-row" style="justify-content:center;">
              <button type="button" class="hp-btn hp-btn-primary hp-btn-pill" id="final-start">Search for free</button>
              <button type="button" class="hp-btn hp-btn-google hp-btn-pill" id="final-google">
                ${GOOGLE_G_SVG}
                <span>Continue with Google</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer class="hp-footer">
        <div class="hp-wrap hp-footer-inner">
          <div class="hp-footer-brand">
            <a class="hp-brand" href="#top"><img src="/ref-logo-primary.svg" alt="Ref Network" /></a>
            <p>Private 3D relationship graph and warm introductions.</p>
          </div>
          <div class="hp-footer-cols">
            <div>
              <h4>Product</h4>
              <a href="#how-it-works">How it works</a>
              <a href="#graph-preview">3D graph</a>
              <a href="#faq">FAQ</a>
            </div>
            <div>
              <h4>Legal &amp; code</h4>
              <a href="/privacy">Privacy policy</a>
              <a href="/terms">Terms of service</a>
              <a href="https://github.com/nhancio/ref-network" target="_blank" rel="noopener">GitHub</a>
            </div>
          </div>
        </div>
        <div class="hp-wrap hp-footer-bottom">
          <span>© 2026 Ref Network · ref.nhancio.com</span>
          <span>Built by Nhancio</span>
        </div>
      </footer>
    </div>
  `;

  // Render interactive Hero Search Card (toggles between Use Case 1 & Use Case 2)
  const searchCardEl = container.querySelector('#hero-search-card');
  function renderHeroSearchCard() {
    const q = DEMO_SCENARIOS[scenarioIndex];
    searchCardEl.innerHTML = `
      <div class="hp-sc-query-row">
        <div class="hp-sc-bubble">${q.prompt}</div>
      </div>
      <div class="hp-sc-sources">
        <span class="hp-sc-searched">Scope</span>
        ${q.sources.map((s) => `<span class="hp-sc-pill">${s}</span>`).join('')}
      </div>
      <div class="hp-sc-results">
        ${q.results.map((r) => `
          <div class="hp-sc-row">
            <div class="hp-sc-avatar tone-${r.tone}">${r.initials}</div>
            <div class="hp-sc-info">
              <div class="hp-sc-name">${r.name}</div>
              <div class="hp-sc-via">${r.via}</div>
              <div class="hp-sc-bio">${r.bio}</div>
              ${r.action ? `<span class="hp-sc-action-chip">${r.action}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      <button type="button" class="hp-sc-input-bar" id="hero-cycle-query">
        <span>${q.followUp}</span>
        <span class="hp-sc-send" aria-hidden="true">↑</span>
      </button>
    `;
    searchCardEl.querySelector('#hero-cycle-query').addEventListener('click', () => {
      scenarioIndex = (scenarioIndex + 1) % DEMO_SCENARIOS.length;
      renderHeroSearchCard();
    });
  }
  renderHeroSearchCard();

  // Mount our signature interactive Three.js 3D graph
  let expandedCompanyKey = 'myntra';
  const routeEl = container.querySelector('#landing-route');
  const detailEl = container.querySelector('#landing-detail');
  const flyBtns = container.querySelectorAll('.hp-fly-btn');
  const stepItems = container.querySelectorAll('.hp-step');

  function updateReadout(node) {
    if (!node || node.kind === 'you') {
      routeEl.textContent = 'Nithin · Center of graph';
      detailEl.textContent = `${SAMPLE_CONTACTS.length} private contacts + Uma & Asha in Ref Circle`;
      return;
    }
    if (node.kind === 'company') {
      routeEl.textContent = `Nithin → ${node.label}`;
      detailEl.textContent = `${node.count} direct ${node.count === 1 ? 'contact' : 'contacts'} · ${node.data.people.map((p) => p.name).slice(0, 3).join(', ')}`;
    } else if (node.kind === 'second-company') {
      const roles = node.data.roles?.length ? ` (${node.data.roles.join(', ')})` : '';
      routeEl.textContent = `Nithin → ${node.viaFriend.name} → ${node.label}`;
      detailEl.textContent = `2nd-degree warm path · ${node.data.count} contacts${roles} · Private until ${node.viaFriend.name.split(' ')[0]} vouches`;
    } else if (node.kind === 'circle') {
      routeEl.textContent = `Nithin ↔ ${node.label} (Ref Circle)`;
      detailEl.textContent = `Can introduce you at ${node.data.sharedCompanies.map((c) => c.company).join(', ')}`;
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

  function flyToTarget(targetId) {
    if (targetId.startsWith('company:')) {
      expandedCompanyKey = targetId.slice('company:'.length);
      updateSampleGraph(true);
    }
    const targetNode = latestModel?.nodes.find((n) => n.id === targetId);
    if (targetNode) {
      graph.focusNode(targetId);
      updateReadout(targetNode);
    }
    flyBtns.forEach((b) => b.classList.toggle('active', b.dataset.fly === targetId));
  }

  flyBtns.forEach((btn) => {
    btn.addEventListener('click', () => flyToTarget(btn.dataset.fly));
  });

  const stepTargets = ['you', 'circle:circle-uma', 'second:circle-uma:swiggy', 'company:myntra'];
  stepItems.forEach((item) => {
    item.querySelector('button').addEventListener('click', () => {
      stepItems.forEach((s) => s.classList.toggle('active', s === item));
      const idx = Number(item.dataset.step || 0);
      flyToTarget(stepTargets[idx] || 'second:circle-uma:swiggy');
    });
  });

  container.querySelector('#nav-signin').addEventListener('click', () => onOpenAuth('signin'));
  container.querySelector('#nav-start').addEventListener('click', () => onOpenAuth('signup'));
  container.querySelector('#hero-start').addEventListener('click', () => onOpenAuth('signup'));
  container.querySelector('#final-start').addEventListener('click', () => onOpenAuth('signup'));
  container.querySelector('#btn-invite-signin')?.addEventListener('click', () => onOpenAuth('signin'));

  const handleGoogleBtn = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await onGoogleSignIn();
    } catch {
      btn.disabled = false;
    }
  };
  container.querySelector('#hero-google').addEventListener('click', handleGoogleBtn);
  container.querySelector('#final-google').addEventListener('click', handleGoogleBtn);

  return {
    destroy() {
      graph.destroy();
    },
  };
}
