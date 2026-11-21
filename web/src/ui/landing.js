import { buildGraphModel } from '../lib/graph-model.js';
import { SAMPLE_USER, SAMPLE_CONTACTS, SAMPLE_CIRCLE } from '../lib/sample-data.js';
import { create3DGraph } from './graph-3d.js';

const GOOGLE_G_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
</svg>`;

const DEMO_QUERIES = [
  {
    prompt: 'Who do I know at Swiggy or Razorpay?',
    followUp: 'Who can intro me to Araku Coffee?',
    sources: ['LinkedIn', 'Google Contacts', 'Your circle'],
    results: [
      {
        initials: 'RD',
        tone: 'warm',
        name: 'Rohan Deshmukh',
        via: 'Connected on LinkedIn · Strong tie',
        bio: 'VP Product at Swiggy. Marked ready to introduce.',
      },
      {
        initials: 'MK',
        tone: 'sage',
        name: 'Meera Krishnan',
        via: 'In your LinkedIn & Google Contacts',
        bio: 'Head of Partnerships at Razorpay. Direct warm intro.',
      },
      {
        initials: 'AM',
        tone: 'stone',
        name: 'Araku Coffee (4 contacts)',
        via: 'Knows your friend Asha Murthy well',
        bio: '2nd-degree warm path via your Ref Circle.',
      },
    ],
  },
  {
    prompt: 'Who can intro me to Araku Coffee or Bengaluru founders?',
    followUp: 'Who do I know at Swiggy or Razorpay?',
    sources: ['Google Contacts', 'Your circle'],
    results: [
      {
        initials: 'AM',
        tone: 'warm',
        name: 'Asha Murthy',
        via: 'In your Ref Circle · 2nd-degree bridge',
        bio: 'Owner at Field Supply. Can introduce you at Araku Coffee & Naru Noodle Bar.',
      },
      {
        initials: 'AR',
        tone: 'sage',
        name: 'Ananya Rao',
        via: 'LinkedIn + Google Contacts',
        bio: 'Founder & Host at Mango Yard, Indiranagar.',
      },
      {
        initials: 'VS',
        tone: 'stone',
        name: 'Vikramaditya Shetty',
        via: 'Connected on LinkedIn · Direct',
        bio: 'Principal at Peak XV Partners. Ready to introduce.',
      },
    ],
  },
];

export function mountLanding(container, { onOpenAuth, onGoogleSignIn, pendingInvite }) {
  let queryIndex = 0;

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

        <!-- Hero: Happenstance-clean light split with floating interactive search card -->
        <section class="hp-hero">
          <div class="hp-wrap hp-hero-grid">
            <div class="hp-hero-copy">
              <a class="hp-news-pill" href="#graph-preview">
                <span>Interactive 3D relationship graph</span>
                <span aria-hidden="true">›</span>
              </a>
              <h1>Your next opportunity<br />is one intro away.</h1>
              <p class="hp-hero-sub">
                Find who you’re looking for among everyone you, your friends, and your circle know — mapped in 3D.
              </p>
              <div class="hp-cta-row">
                <button type="button" class="hp-btn hp-btn-primary hp-btn-pill" id="hero-start">Search for free</button>
                <button type="button" class="hp-btn hp-btn-google hp-btn-pill" id="hero-google">
                  ${GOOGLE_G_SVG}
                  <span>Continue with Google</span>
                </button>
              </div>
              <p class="hp-hero-footnote">
                Works with <strong>LinkedIn exports</strong>, <strong>Google Contacts</strong>, and <strong>Apple .vcf</strong>
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
              <p>Add your connections, invite friends, and turn every signal of who knows who into one interactive 3D map.</p>
            </div>

            <div class="hp-network-grid" id="graph-preview">
              <ol class="hp-steps" role="tablist" aria-label="How Ref Network works">
                <li class="hp-step active" data-step="0">
                  <button type="button">
                    <strong>1. Add your connections</strong>
                    <span>Drop your LinkedIn .zip or Connections.csv, sync Google Contacts, or upload a .vcf file.</span>
                  </button>
                </li>
                <li class="hp-step" data-step="1">
                  <button type="button">
                    <strong>2. Ref maps your network in 3D</strong>
                    <span>Companies are inferred from work emails, duplicates merge automatically, and message metadata ranks strong ties.</span>
                  </button>
                </li>
                <li class="hp-step" data-step="2">
                  <button type="button">
                    <strong>3. Add friends to your circle</strong>
                    <span>Share a private invite link so your friends’ company reach appears as second-degree bridges.</span>
                  </button>
                </li>
                <li class="hp-step" data-step="3">
                  <button type="button">
                    <strong>4. Ask for a warm intro</strong>
                    <span>Request an introduction in one tap and forward a prefilled warm message on WhatsApp or email.</span>
                  </button>
                </li>
              </ol>

              <div class="hp-3d-shell">
                <div class="hp-3d-topbar">
                  <div class="hp-source-chips">
                    <span class="hp-src-chip"><strong>LinkedIn</strong> 12</span>
                    <span class="hp-src-chip"><strong>Contacts</strong> 9</span>
                    <span class="hp-src-chip is-accent"><strong>Ref Circle</strong> 2</span>
                  </div>
                  <div class="hp-3d-fly-tabs" role="group" aria-label="Focus 3D node">
                    <button type="button" class="hp-fly-btn active" data-fly="company:swiggy">Swiggy</button>
                    <button type="button" class="hp-fly-btn" data-fly="company:razorpay">Razorpay</button>
                    <button type="button" class="hp-fly-btn" data-fly="second:circle-asha:araku coffee">Araku Coffee</button>
                  </div>
                </div>
                <div class="hp-3d-canvas" id="landing-graph-host" aria-label="Interactive 3D network graph"></div>
                <div class="hp-3d-footer">
                  <div>
                    <div class="hp-3d-route" id="landing-route">Nithin → Swiggy</div>
                    <div class="hp-3d-detail" id="landing-detail">3 direct contacts · Rohan Deshmukh, Kavya Nair, Siddharth Menon</div>
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
            <h2>Private and secure</h2>
            <p>
              You control what you share. Every contact you import stays locked inside your private Firestore vault (<code>users/{uid}/contacts</code>). Your Ref Circle and optional <code>/u/handle</code> page show only organization names and counts — never personal emails, phone numbers, or message content.
            </p>
            <div class="hp-trust-row">
              <div class="hp-trust-item">
                <strong>Private per-user vault</strong>
                <span>Firestore security rules block every other user from reading your contacts.</span>
              </div>
              <div class="hp-trust-item">
                <strong>Google verified branding</strong>
                <span>Read-only Google Contacts access adhering to Google API Limited Use rules.</span>
              </div>
              <div class="hp-trust-item">
                <strong>Export or delete anytime</strong>
                <span>Download a JSON backup or wipe your account and vault in one click.</span>
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
                <summary>What is Ref Network?</summary>
                <p>Ref Network combines your LinkedIn connections, Google or phone contacts, and trusted friend circles into one searchable 3D map so you can instantly see who you know at any company and ask for warm introductions.</p>
              </details>
              <details>
                <summary>How do I import my LinkedIn connections?</summary>
                <p>Request your data archive from LinkedIn Data Export (Connections, and optionally Messages) and drop the downloaded <code>.zip</code> or <code>Connections.csv</code> directly into Ref. We parse it locally in your browser before saving to your private vault.</p>
              </details>
              <details>
                <summary>Will anyone know I uploaded my contacts, or does Ref message them?</summary>
                <p>No. Importing your contacts is completely private and Ref never emails, texts, or messages anyone automatically. Every warm introduction is drafted for you to review and send yourself on WhatsApp or email.</p>
              </details>
              <details>
                <summary>How do second-degree paths and Ref Circles work?</summary>
                <p>Generate a one-time private invite link and send it to a friend you trust. Once they accept, their high-level company reach appears as warm second-degree branches in your 3D graph without exposing individual contact details.</p>
              </details>
              <details>
                <summary>What shows up if I turn on my public /u/handle page?</summary>
                <p>Only your display name, optional headline/LinkedIn link, and the list of companies (with counts) you can introduce people to — zero contact names, emails, or phone numbers. You can turn it off anytime.</p>
              </details>
              <details>
                <summary>Is Ref Network free and can I delete my data?</summary>
                <p>Yes. You can export a full JSON backup, clear individual import sources, or permanently delete your account and every stored contact directly inside the app.</p>
              </details>
            </div>
          </div>
        </section>

        <!-- Section 5: Final CTA -->
        <section class="hp-final-section">
          <div class="hp-wrap hp-final-inner">
            <h2>Make your own warm intros</h2>
            <p>Connect your LinkedIn and contacts in under a minute and explore your entire network in 3D.</p>
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
            <p>Map your network in 3D. Reach anyone through trust.</p>
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

  // Render interactive Happenstance-style Hero Search Card
  const searchCardEl = container.querySelector('#hero-search-card');
  function renderHeroSearchCard() {
    const q = DEMO_QUERIES[queryIndex];
    searchCardEl.innerHTML = `
      <div class="hp-sc-query-row">
        <div class="hp-sc-bubble">${q.prompt}</div>
      </div>
      <div class="hp-sc-sources">
        <span class="hp-sc-searched">Searched</span>
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
      queryIndex = (queryIndex + 1) % DEMO_QUERIES.length;
      renderHeroSearchCard();
    });
  }
  renderHeroSearchCard();

  // Mount our signature interactive Three.js 3D graph in Section 2
  let expandedCompanyKey = 'swiggy';
  const routeEl = container.querySelector('#landing-route');
  const detailEl = container.querySelector('#landing-detail');
  const flyBtns = container.querySelectorAll('.hp-fly-btn');
  const stepItems = container.querySelectorAll('.hp-step');

  function updateReadout(node) {
    if (!node || node.kind === 'you') {
      routeEl.textContent = 'Nithin · Center of graph';
      detailEl.textContent = `${SAMPLE_CONTACTS.length} direct contacts across ${new Set(SAMPLE_CONTACTS.map((c) => c.companyKey)).size} organizations`;
      return;
    }
    if (node.kind === 'company') {
      routeEl.textContent = `Nithin → ${node.label}`;
      detailEl.textContent = `${node.count} direct ${node.count === 1 ? 'contact' : 'contacts'} · ${node.data.people.map((p) => p.name).slice(0, 3).join(', ')}`;
    } else if (node.kind === 'second-company') {
      routeEl.textContent = `Nithin → ${node.viaFriend.name} → ${node.label}`;
      detailEl.textContent = `2nd-degree warm path via ${node.viaFriend.name.split(' ')[0]} · ${node.data.count} contacts`;
    } else if (node.kind === 'circle') {
      routeEl.textContent = `Nithin — ${node.label}`;
      detailEl.textContent = `Ref Circle bridge · ${node.data.sharedCompanies.map((c) => c.company).join(', ')}`;
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

  const stepTargets = ['you', 'company:swiggy', 'circle:circle-asha', 'second:circle-asha:araku coffee'];
  stepItems.forEach((item) => {
    item.querySelector('button').addEventListener('click', () => {
      stepItems.forEach((s) => s.classList.toggle('active', s === item));
      const idx = Number(item.dataset.step || 0);
      flyToTarget(stepTargets[idx] || 'company:swiggy');
    });
  });

  // Auth actions (direct 1-click Google Sign-In or Auth Modal)
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
