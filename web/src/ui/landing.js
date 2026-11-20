import { buildGraphModel } from '../lib/graph-model.js';
import { SAMPLE_USER, SAMPLE_CONTACTS, SAMPLE_CIRCLE } from '../lib/sample-data.js';
import { create3DGraph } from './graph-3d.js';

export function mountLanding(container, { onOpenAuth, pendingInvite }) {
  container.innerHTML = `
    <div class="lp-root" id="top">
      <header class="lp-nav-wrap">
        <div class="lp-wrap lp-nav">
          <a class="lp-brand" href="#top" aria-label="Ref Network home">
            <img src="/ref-logo-reverse.svg" alt="Ref Network" />
          </a>
          <nav class="lp-links" aria-label="Primary">
            <a href="#explore-bento">Capabilities</a>
            <a href="#workflow">How it works</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <div class="lp-nav-cta">
            <button type="button" class="lp-btn lp-btn-glass" id="nav-signin">Sign in</button>
            <button type="button" class="lp-btn lp-btn-accent" id="nav-start">Launch my graph</button>
          </div>
        </div>
      </header>

      <section class="lp-hero">
        <div class="lp-hero-3d" id="landing-graph-host" aria-label="Interactive 3D network constellation"></div>
        <div class="lp-hero-scrim" aria-hidden="true"></div>

        <div class="lp-wrap lp-hero-grid">
          <div class="lp-hero-copy">
            ${pendingInvite ? `
              <div class="lp-invite-pill">
                <span>Private circle invitation waiting</span>
                <button type="button" id="btn-invite-signin">Accept & sign in →</button>
              </div>
            ` : `
              <div class="lp-eyebrow-pill">
                <span class="lp-dot"></span>
                Live on ref.nhancio.com · Interactive 3D Graph
              </div>
            `}

            <h1>
              Map everyone you know.<br />
              Reach anyone through <em>trust.</em>
            </h1>
            <p class="lp-hero-sub">
              Connect your LinkedIn and Google Contacts into a living 3D relationship graph. Uncover who you know at any company, spot warm 2nd-degree paths through friends, and ask for introductions without cold outreach.
            </p>

            <div class="lp-cta-row">
              <button type="button" class="lp-btn lp-btn-accent lp-btn-lg" id="hero-start">
                Continue with Google / Email
                <span aria-hidden="true">→</span>
              </button>
              <a class="lp-btn lp-btn-glass lp-btn-lg" href="#explore-bento">See how it works</a>
            </div>

            <div class="lp-try-bar">
              <span class="lp-try-label">Try flying the 3D graph:</span>
              <div class="lp-try-chips" role="group" aria-label="Focus sample organizations">
                <button type="button" class="lp-chip active" data-fly="company:swiggy">Swiggy</button>
                <button type="button" class="lp-chip" data-fly="company:razorpay">Razorpay</button>
                <button type="button" class="lp-chip" data-fly="second:circle-asha:araku coffee">Araku Coffee · 2nd°</button>
                <button type="button" class="lp-chip" data-fly="company:mango yard">Mango Yard</button>
                <button type="button" class="lp-chip" data-fly="second:circle-rohan:zepto">Zepto · 2nd°</button>
              </div>
            </div>
          </div>

          <div class="lp-hero-hud">
            <div class="lp-hud-card">
              <div class="lp-hud-head">
                <span class="lp-hud-tag" id="landing-tag">1ST-DEGREE CLUSTER</span>
                <span class="lp-hud-hint">Drag to orbit · Scroll to zoom</span>
              </div>
              <div class="lp-hud-route" id="landing-route">Nithin → Swiggy (3 direct contacts)</div>
              <div class="lp-hud-detail" id="landing-detail">Rohan Deshmukh (VP Product) · Kavya Nair (Design Lead) · Siddharth Menon (Staff Engineer)</div>
            </div>
          </div>
        </div>
      </section>

      <div class="lp-marquee-strip">
        <div class="lp-wrap lp-strip-inner">
          <span><strong>LinkedIn</strong> Connections.csv import</span>
          <span class="lp-sep">·</span>
          <span><strong>Google Contacts</strong> OAuth sync</span>
          <span class="lp-sep">·</span>
          <span><strong>Apple & Android</strong> .vcf support</span>
          <span class="lp-sep">·</span>
          <span><strong>Ref Circle</strong> 2nd-degree bridges</span>
          <span class="lp-sep">·</span>
          <span><strong>Private Vault</strong> per-user Firestore rules</span>
        </div>
      </div>

      <section class="lp-bento-section" id="explore-bento">
        <div class="lp-wrap">
          <div class="lp-section-head">
            <p class="kicker">Designed for real networks</p>
            <h2>Every relationship you’ve built,<br />finally searchable in one place.</h2>
            <p>Stop scrolling through scattered WhatsApp chats, forgotten LinkedIn connections, and phone address books whenever you need a warm introduction.</p>
          </div>

          <div class="lp-bento-grid">
            <article class="bento-card bento-wide">
              <div class="bento-copy">
                <span class="bento-kicker">01 · Cross-source fusion</span>
                <h3>LinkedIn + Contacts, deduplicated automatically</h3>
                <p>Drop your LinkedIn export and sync Google Contacts or an iCloud <code>.vcf</code>. Ref normalizes company names (“Swiggy Pvt Ltd” → “Swiggy”) and merges overlapping people into one rich profile.</p>
              </div>
              <div class="bento-ui-merge" aria-hidden="true">
                <div class="mini-sources">
                  <span class="mini-pill li">in · LinkedIn CSV</span>
                  <span class="mini-pill go">G · Google Contacts</span>
                  <span class="mini-pill vc">vcf · iPhone</span>
                </div>
                <div class="mini-arrow">↓</div>
                <div class="mini-profile-card">
                  <div class="mini-av">MK</div>
                  <div>
                    <strong>Meera Krishnan</strong>
                    <small>Head of Partnerships · Razorpay</small>
                  </div>
                  <span class="mini-tag">Can intro</span>
                </div>
              </div>
            </article>

            <article class="bento-card bento-tall">
              <div class="bento-copy">
                <span class="bento-kicker">02 · Human-in-the-loop</span>
                <h3>Ask for a warm intro in two taps</h3>
                <p>See which friend in your Ref Circle knows someone at your target company or restaurant — and send a private vouch request they control.</p>
              </div>
              <div class="bento-intro-mock" aria-hidden="true">
                <div class="mock-header">Requests</div>
                <div class="mock-title">Ananya asked for an intro</div>
                <div class="mock-sub">Partnerships · Mango Yard & Araku</div>
                <div class="mock-chain">
                  <span class="mc-node">AR</span>
                  <span class="mc-line"></span>
                  <span class="mc-node mid">ND</span>
                  <span class="mc-line"></span>
                  <span class="mc-node end">MY</span>
                </div>
                <div class="mock-cta">Vouch & share</div>
                <div class="mock-decline">Decline</div>
              </div>
            </article>

            <article class="bento-card">
              <div class="bento-copy">
                <span class="bento-kicker">03 · Instant radar</span>
                <h3>Organization clustering at scale</h3>
                <p>Whether you have 40 or 4,000 connections, your 3D graph stays legible by clustering people into sized company orbs that expand on click.</p>
              </div>
              <div class="bento-bars" aria-hidden="true">
                <div><span>Swiggy</span><i style="width:92%"></i><b>14</b></div>
                <div><span>Razorpay</span><i style="width:68%"></i><b>9</b></div>
                <div><span>Google</span><i style="width:52%"></i><b>7</b></div>
                <div><span>Peak XV</span><i style="width:34%"></i><b>4</b></div>
              </div>
            </article>

            <article class="bento-card">
              <div class="bento-copy">
                <span class="bento-kicker">04 · Strict isolation</span>
                <h3>Your raw contacts never leave your vault</h3>
                <p>Friends in your circle only see high-level company counts you choose to share — never phone numbers, emails, or personal notes.</p>
              </div>
              <div class="bento-lock" aria-hidden="true">
                <code>users/{uid}/contacts</code>
                <span>allow read, write: if auth.uid == uid</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section class="lp-story-band" id="workflow">
        <div class="lp-wrap lp-story-grid">
          <div class="lp-story-photo">
            <img src="/landing-hero.jpg" alt="Warm neighbourhood referral at an independent Bengaluru shop counter" loading="lazy" />
            <div class="lp-story-badge">
              <span>WARM INTRO APPLIED</span>
              <strong>You → Asha → Field Supply</strong>
              <small>Verified mutual Ref Circle · Indiranagar</small>
            </div>
          </div>

          <div class="lp-story-copy" id="privacy">
            <p class="kicker" style="color:var(--ref-apricot);">Built for how India actually refers</p>
            <h2>Warm trust beats cold DMs every single time.</h2>
            <p>From hiring a founding engineer to landing a partner call or getting a Friday table in Indiranagar, the fastest route is always a friend who can vouch for you.</p>
            <ol class="lp-numbered">
              <li>
                <span>01</span>
                <div>
                  <strong>Sign in & import in 60 seconds</strong>
                  <p>Log in with Google or email, sync Google Contacts or drop your LinkedIn CSV, and watch your 3D constellation come alive.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Search any company, role, or city</strong>
                  <p>Instantly highlight 1st-degree contacts and 2nd-degree bridges across your entire graph.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Invite your inner circle</strong>
                  <p>Share a one-time private invite link with founders and friends to multiply each other’s warm reach.</p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section class="lp-final-cta">
        <div class="lp-wrap lp-final-inner">
          <p class="kicker" style="color:var(--ref-apricot);">Ready in under a minute</p>
          <h2>See your own network in <em>3D.</em></h2>
          <p>Free, private, and built to turn your real relationships into clear introduction paths.</p>
          <button type="button" class="lp-btn lp-btn-accent lp-btn-lg" id="final-start">
            Sign in & build your graph →
          </button>
        </div>
      </section>

      <footer class="lp-footer">
        <div class="lp-wrap lp-footer-inner">
          <a class="lp-brand" href="#top"><img src="/ref-logo-reverse.svg" alt="Ref Network" style="height:20px;" /></a>
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:18px;">
            <a href="/privacy" style="color:#cfd5c3;">Privacy Policy</a>
            <a href="/terms" style="color:#cfd5c3;">Terms of Service</a>
            <span>ref.nhancio.com</span>
          </div>
        </div>
      </footer>
    </div>
  `;

  // Mount living 3D constellation in the hero
  let expandedCompanyKey = 'swiggy';
  const routeEl = container.querySelector('#landing-route');
  const detailEl = container.querySelector('#landing-detail');
  const tagEl = container.querySelector('#landing-tag');
  const chips = container.querySelectorAll('.lp-chip');

  function updateHudForNode(node) {
    if (!node || node.kind === 'you') {
      tagEl.textContent = 'CENTER OF GRAPH';
      routeEl.textContent = 'Nithin · Personal Constellation';
      detailEl.textContent = `${SAMPLE_CONTACTS.length} direct connections across ${new Set(SAMPLE_CONTACTS.map((c) => c.companyKey)).size} organizations + 2 Ref Circle bridges.`;
      return;
    }
    if (node.kind === 'company') {
      tagEl.textContent = '1ST-DEGREE CLUSTER';
      routeEl.textContent = `Nithin → ${node.label} (${node.count} direct ${node.count === 1 ? 'contact' : 'contacts'})`;
      detailEl.textContent = node.data.people.map((p) => `${p.name} (${p.role})`).slice(0, 3).join(' · ');
    } else if (node.kind === 'second-company') {
      tagEl.textContent = '2ND-DEGREE WARM PATH';
      routeEl.textContent = `Nithin → ${node.viaFriend.name} → ${node.label}`;
      detailEl.textContent = `Reachable via your Ref Circle (${node.data.count} contacts at ${node.label}). Click to ask for an intro.`;
    } else if (node.kind === 'circle') {
      tagEl.textContent = 'REF CIRCLE BRIDGE';
      routeEl.textContent = `Nithin ↔ ${node.label}`;
      detailEl.textContent = `Mutual friend sharing warm paths to ${node.data.sharedCompanies.map((c) => c.company).join(', ')}.`;
    } else if (node.kind === 'person') {
      tagEl.textContent = node.data.canIntroduce ? 'READY TO INTRO' : 'DIRECT CONTACT';
      routeEl.textContent = `Nithin → ${node.label}${node.data.company ? ` · ${node.data.company}` : ''}`;
      detailEl.textContent = `${node.data.role || 'Connection'} · Sources: ${node.data.sources.join(' + ')}`;
    }
  }

  let latestModel = null;
  const graph = create3DGraph(container.querySelector('#landing-graph-host'), {
    autoRotate: true,
    initialDistance: 14.6,
    onSelect(node) {
      if (node.kind === 'company') {
        expandedCompanyKey = expandedCompanyKey === node.data.key ? null : node.data.key;
        updateSampleGraph(true);
      }
      updateHudForNode(node);
    },
    onHover(node) {
      if (node) updateHudForNode(node);
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

  // Interactive "Try flying the 3D graph" query chips
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.toggle('active', c === chip));
      const targetId = chip.dataset.fly;
      if (targetId.startsWith('company:')) {
        expandedCompanyKey = targetId.slice('company:'.length);
        updateSampleGraph(true);
      }
      const targetNode = latestModel?.nodes.find((n) => n.id === targetId);
      if (targetNode) {
        graph.focusNode(targetId);
        updateHudForNode(targetNode);
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
