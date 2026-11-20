import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  friendlyAuthError,
  fetchGoogleContactsViaOAuth,
} from '../lib/firebase.js';
import {
  parseLinkedInCsv,
  parseLinkedInZip,
  parseGenericContactsCsv,
  parseVCard,
} from '../lib/parsers.js';
import {
  buildWarmIntroMessage,
  whatsappShareUrl,
  emailShareUrl,
  normalizeHandle,
} from '../lib/handoff.js';

export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function openModal(title, bodyHtml, { onMount } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-card">
        <div class="modal-head">
          <h2>${esc(title)}</h2>
          <button type="button" class="modal-close" aria-label="Close">×</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
      </div>
    </div>
  `;
  const backdrop = root.querySelector('.modal-backdrop');
  const close = () => { root.innerHTML = ''; };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  root.querySelector('.modal-close').addEventListener('click', close);
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      close();
      window.removeEventListener('keydown', escHandler);
    }
  };
  window.addEventListener('keydown', escHandler);
  onMount?.({ root, close });
  return { close };
}

export function openAuthModal({ mode = 'signin', inviteContext = null, onSuccess } = {}) {
  let isSignup = mode === 'signup';

  const render = (root, close, errorMsg = '') => {
    const body = root.querySelector('.modal-body');
    const headTitle = root.querySelector('.modal-head h2');
    headTitle.textContent = isSignup ? 'Create your Ref account' : 'Sign in to Ref Network';

    body.innerHTML = `
      ${inviteContext ? `<div class="info-box"><strong>${esc(inviteContext.inviterName)}</strong> invited you to connect on Ref Network. Sign in to accept.</div>` : ''}
      ${errorMsg ? `<div class="error-box">${esc(errorMsg)}</div>` : ''}
      <button type="button" class="btn btn-olive btn-full" id="btn-google-auth">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#FAF5EB" d="M21.35 11.1h-9.18v2.98h5.27c-.23 1.48-1.72 4.35-5.27 4.35-3.17 0-5.76-2.63-5.76-5.88s2.59-5.88 5.76-5.88c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.79 4.14 14.68 3.2 12.17 3.2 7.1 3.2 3 7.33 3 12.55S7.1 21.9 12.17 21.9c6.26 0 9.4-4.4 9.4-9.03 0-.61-.07-1.2-.22-1.77z"/></svg>
        Continue with Google
      </button>
      <div class="divider-text">or with email</div>
      <form class="form-stack" id="email-auth-form">
        ${isSignup ? `<label class="field">Your name<input name="name" type="text" required placeholder="e.g. Nithin Didigam" autocomplete="name" /></label>` : ''}
        <label class="field">Email<input name="email" type="email" required placeholder="you@nhancio.com" autocomplete="email" /></label>
        <label class="field">Password<input name="password" type="password" required minlength="6" placeholder="At least 6 characters" autocomplete="${isSignup ? 'new-password' : 'current-password'}" /></label>
        <button type="submit" class="btn btn-primary btn-full">${isSignup ? 'Create account' : 'Sign in'}</button>
      </form>
      <button type="button" class="btn btn-ghost btn-full" id="toggle-auth-mode">
        ${isSignup ? 'Already have an account? Sign in' : 'New to Ref Network? Create an account'}
      </button>
    `;

    body.querySelector('#btn-google-auth').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await signInWithGoogle();
        close();
        onSuccess?.();
      } catch (err) {
        render(root, close, friendlyAuthError(err));
      }
    });

    body.querySelector('#email-auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const submit = e.currentTarget.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        if (isSignup) {
          await signUpWithEmail(fd.get('name'), fd.get('email'), fd.get('password'));
        } else {
          await signInWithEmail(fd.get('email'), fd.get('password'));
        }
        close();
        onSuccess?.();
      } catch (err) {
        render(root, close, friendlyAuthError(err));
      }
    });

    body.querySelector('#toggle-auth-mode').addEventListener('click', () => {
      isSignup = !isSignup;
      render(root, close, '');
    });
  };

  openModal('Sign in to Ref Network', '', {
    onMount({ root, close }) { render(root, close, ''); },
  });
}

export function openConnectModal({
  contacts = [],
  onImportContacts,
  onClearSource,
  onExportBackup,
  onDeleteAccount,
  onToast,
}) {
  const supportsPicker = typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;
  const liCount = contacts.filter((c) => c.sources?.includes('linkedin')).length;
  const goCount = contacts.filter((c) => c.sources?.includes('google')).length;

  openModal('Connect & manage your network', `
    <div id="connect-status"></div>

    <section class="source-box">
      <div class="source-box-head">
        <h3>1. LinkedIn Connections</h3>
        <span class="badge linkedin">.zip or .csv</span>
      </div>
      <p>Drop LinkedIn’s full <strong>.zip export</strong> (no unzipping needed!) or <code>Connections.csv</code>. If your archive includes <code>messages.csv</code>, Ref reads only timestamps to rank who you actually know — never message contents.</p>
      <ol class="steps-inline">
        <li>Open <a href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noopener">LinkedIn Data Export ↗</a></li>
        <li>Choose <strong>Connections</strong> (and optionally <strong>Messages</strong> for relationship strength).</li>
        <li>Drop the downloaded <code>.zip</code> or <code>Connections.csv</code> below.</li>
      </ol>
      <label class="dropzone" id="li-dropzone">
        <strong>Drop LinkedIn .zip or Connections.csv here, or click to choose</strong>
        <small>Parsed locally in your browser · saved privately to your Firestore vault</small>
        <input type="file" id="li-file" accept=".zip,.csv,application/zip,text/csv" />
      </label>
    </section>

    <section class="source-box">
      <div class="source-box-head">
        <h3>2. Google &amp; Phone Contacts</h3>
        <span class="badge google">Live Sync + Auto Company</span>
      </div>
      <p>Sync Google Contacts or drop a <code>.vcf</code> / <code>.csv</code>. Contacts with work emails automatically cluster into their company orb in 3D, and duplicates merge cleanly.</p>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        <button type="button" class="btn btn-olive" id="btn-google-contacts">Sync Google Contacts</button>
        ${supportsPicker ? `<button type="button" class="btn btn-outline" id="btn-web-picker">Pick from Phone Contacts</button>` : ''}
      </div>
      <label class="dropzone" id="vcf-dropzone">
        <strong>Drop .vcf (Apple / iCloud / Android) or contacts .csv here</strong>
        <small>Instant offline-safe import</small>
        <input type="file" id="vcf-file" accept=".vcf,.vcard,.csv,text/vcard,text/csv" />
      </label>
    </section>

    <section class="source-box">
      <div class="source-box-head">
        <h3>3. Add a contact manually</h3>
        <span class="badge">Quick add</span>
      </div>
      <form class="form-stack" id="manual-contact-form">
        <div class="field-row">
          <label class="field">Name<input name="name" required placeholder="Ananya Rao" /></label>
          <label class="field">Company / Place<input name="company" placeholder="Mango Yard" /></label>
        </div>
        <div class="field-row">
          <label class="field">Role<input name="role" placeholder="Founder" /></label>
          <label class="field">Email or Phone<input name="reach" placeholder="ananya@mangoyard.in" /></label>
        </div>
        <label class="field">LinkedIn URL (optional)<input name="linkedinUrl" type="url" placeholder="https://linkedin.com/in/..." /></label>
        <button type="submit" class="btn btn-primary">Add to my graph</button>
      </form>
    </section>

    <section class="source-box">
      <div class="source-box-head">
        <h3>4. Vault controls &amp; data hygiene</h3>
        <span class="badge">${contacts.length} total</span>
      </div>
      <p>Export a portable backup anytime, clear a specific import source, or permanently delete your account and private vault.</p>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        <button type="button" class="btn btn-outline btn-sm" id="btn-export-json">Export JSON backup</button>
        ${liCount ? `<button type="button" class="btn btn-outline btn-sm" id="btn-clear-li">Clear LinkedIn (${liCount})</button>` : ''}
        ${goCount ? `<button type="button" class="btn btn-outline btn-sm" id="btn-clear-go">Clear Google (${goCount})</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" id="btn-delete-account" style="color:#8b261d;">Delete all data &amp; account</button>
      </div>
    </section>
  `, {
    onMount({ root, close }) {
      const statusEl = root.querySelector('#connect-status');
      const setStatus = (html) => { statusEl.innerHTML = html; };

      async function handleFile(file, kind) {
        if (!file) return;
        setStatus(`<div class="info-box">Reading <strong>${esc(file.name)}</strong>…</div>`);
        try {
          let parsed = [];
          let extraNote = '';
          if (kind === 'linkedin' && /\.zip$/i.test(file.name)) {
            const buf = new Uint8Array(await file.arrayBuffer());
            const result = parseLinkedInZip(buf);
            parsed = result.contacts;
            if (result.enrichedSignals > 0) {
              extraNote = ` · ${result.enrichedSignals} ranked with message strength`;
            }
          } else {
            const text = await file.text();
            if (kind === 'linkedin') {
              parsed = parseLinkedInCsv(text);
            } else if (/\.vcf|vcard/i.test(file.name) || /BEGIN:VCARD/i.test(text)) {
              parsed = parseVCard(text);
            } else {
              parsed = parseGenericContactsCsv(text, 'csv');
            }
          }
          if (!parsed.length) {
            setStatus(`<div class="error-box">No contacts found in ${esc(file.name)}. Make sure it’s a LinkedIn .zip / Connections.csv, Google Contacts CSV, or .vcf file.</div>`);
            return;
          }
          setStatus(`<div class="info-box">Saving <strong>${parsed.length}</strong> contacts to your private graph…</div>`);
          const summary = await onImportContacts(parsed);
          onToast(`Imported ${parsed.length} contacts (${summary.addedCount} new, ${summary.updatedCount} merged${extraNote}).`);
          close();
        } catch (err) {
          setStatus(`<div class="error-box">${esc(err.message || 'Could not import file.')}</div>`);
        }
      }

      function wireDropzone(zoneId, inputId, kind) {
        const zone = root.querySelector(zoneId);
        const input = root.querySelector(inputId);
        input.addEventListener('change', () => handleFile(input.files?.[0], kind));
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', (e) => {
          e.preventDefault();
          zone.classList.remove('dragover');
          handleFile(e.dataTransfer?.files?.[0], kind);
        });
      }
      wireDropzone('#li-dropzone', '#li-file', 'linkedin');
      wireDropzone('#vcf-dropzone', '#vcf-file', 'contacts');

      root.querySelector('#btn-google-contacts').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        setStatus(`<div class="info-box">Opening Google Contacts permission prompt…</div>`);
        try {
          const parsed = await fetchGoogleContactsViaOAuth();
          if (!parsed.length) {
            setStatus(`<div class="info-box">Google returned 0 contacts in this account. You can also upload a .vcf or .csv below.</div>`);
            btn.disabled = false;
            return;
          }
          setStatus(`<div class="info-box">Syncing <strong>${parsed.length}</strong> Google Contacts…</div>`);
          const summary = await onImportContacts(parsed);
          onToast(`Synced ${parsed.length} Google Contacts (${summary.addedCount} new, ${summary.updatedCount} merged).`);
          close();
        } catch (err) {
          setStatus(`<div class="error-box">${esc(err.message || 'Google Contacts sync failed.')} — You can also export a .csv from contacts.google.com and drop it right below.</div>`);
          btn.disabled = false;
        }
      });

      root.querySelector('#btn-web-picker')?.addEventListener('click', async () => {
        try {
          const picked = await navigator.contacts.select(['name', 'email', 'tel'], { multiple: true });
          const parsed = picked.map((p) => ({
            name: p.name?.[0] || p.email?.[0] || p.tel?.[0] || '',
            email: p.email?.[0] || '',
            phone: p.tel?.[0] || '',
            company: '',
            role: '',
            linkedinUrl: '',
            sources: ['picker'],
          })).filter((c) => c.name);
          if (parsed.length) {
            const summary = await onImportContacts(parsed);
            onToast(`Added ${summary.addedCount} contacts from your phone.`);
            close();
          }
        } catch (err) {
          setStatus(`<div class="error-box">${esc(err.message || 'Contact picker cancelled.')}</div>`);
        }
      });

      root.querySelector('#manual-contact-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const reach = String(fd.get('reach') || '').trim();
        const isEmail = reach.includes('@');
        const contact = {
          name: String(fd.get('name') || '').trim(),
          company: String(fd.get('company') || '').trim(),
          role: String(fd.get('role') || '').trim(),
          email: isEmail ? reach : '',
          phone: isEmail ? '' : reach,
          linkedinUrl: String(fd.get('linkedinUrl') || '').trim(),
          sources: ['manual'],
          canIntroduce: true,
        };
        const btn = e.currentTarget.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
          await onImportContacts([contact]);
          onToast(`Added ${contact.name} to your graph.`);
          close();
        } catch (err) {
          setStatus(`<div class="error-box">${esc(err.message || 'Failed to save contact.')}</div>`);
          btn.disabled = false;
        }
      });

      root.querySelector('#btn-export-json').addEventListener('click', () => {
        onExportBackup();
        onToast('Downloaded JSON backup.');
      });

      root.querySelector('#btn-clear-li')?.addEventListener('click', async (e) => {
        if (!confirm(`Remove all ${liCount} LinkedIn-only contacts from your vault?`)) return;
        e.currentTarget.disabled = true;
        await onClearSource('linkedin');
        close();
      });

      root.querySelector('#btn-clear-go')?.addEventListener('click', async (e) => {
        if (!confirm(`Remove all ${goCount} Google-only contacts from your vault?`)) return;
        e.currentTarget.disabled = true;
        await onClearSource('google');
        close();
      });

      root.querySelector('#btn-delete-account').addEventListener('click', async (e) => {
        if (!confirm('Permanently delete ALL your contacts, circle connections, public page, and Ref Network account? This cannot be undone.')) return;
        e.currentTarget.disabled = true;
        try {
          await onDeleteAccount();
          close();
        } catch (err) {
          setStatus(`<div class="error-box">${esc(friendlyAuthError(err))}</div>`);
          e.currentTarget.disabled = false;
        }
      });
    },
  });
}

export function openWarmIntroHandoffModal({ connectorName, requesterName, targetCompany, note, contactName = '', contactPhone = '', contactEmail = '', onToast }) {
  const initialMsg = buildWarmIntroMessage({ connectorName, requesterName, targetCompany, note, contactName });

  openModal('Send warm introduction', `
    <p style="font-size:0.88rem; color:var(--ref-muted); line-height:1.5;">
      Review or tweak the intro message below, then forward it on WhatsApp or Email in one click. Nothing is sent automatically without you.
    </p>
    <label class="field">Prefilled intro message
      <textarea id="handoff-msg" rows="5">${esc(initialMsg)}</textarea>
    </label>
    <div style="display:flex; flex-wrap:wrap; gap:8px;">
      <a class="btn btn-primary" id="handoff-wa" target="_blank" rel="noopener">Open in WhatsApp ↗</a>
      <a class="btn btn-olive" id="handoff-mail">Open in Email ↗</a>
      <button type="button" class="btn btn-outline" id="handoff-copy">Copy message</button>
    </div>
  `, {
    onMount({ root }) {
      const textarea = root.querySelector('#handoff-msg');
      const waLink = root.querySelector('#handoff-wa');
      const mailLink = root.querySelector('#handoff-mail');

      const syncLinks = () => {
        const msg = textarea.value;
        waLink.href = whatsappShareUrl(msg, contactPhone);
        mailLink.href = emailShareUrl({
          to: contactEmail,
          subject: `Warm intro: ${requesterName || 'Friend'} ↔ ${targetCompany || contactName}`,
          body: msg,
        });
      };
      syncLinks();
      textarea.addEventListener('input', syncLinks);

      root.querySelector('#handoff-copy').addEventListener('click', async () => {
        await navigator.clipboard.writeText(textarea.value);
        onToast('Warm intro message copied.');
      });
    },
  });
}

export function openCircleModal({
  profile,
  circleConnections,
  introRequests,
  onCreateInvite,
  onRemoveConnection,
  onRespondIntro,
  onSaveProfile,
  onPublishPublicProfile,
  onUnpublishPublicProfile,
  onToast,
}) {
  const incoming = introRequests.incoming || [];
  const outgoing = introRequests.outgoing || [];
  const defaultHandle = profile?.publicHandle || normalizeHandle(profile?.displayName || '');
  const publicUrl = profile?.publicProfileEnabled && profile?.publicHandle
    ? `${location.origin}/u/${profile.publicHandle}`
    : '';

  openModal('My Circle, Public Page & Intros', `
    <section class="source-box">
      <div class="source-box-head">
        <h3>Shareable “Where I can intro you” page</h3>
        <span class="badge ${publicUrl ? 'google' : ''}">${publicUrl ? 'Live' : 'Off'}</span>
      </div>
      <p>Publish a clean public link showing <strong>only company names &amp; counts</strong> you can introduce — zero contact names, emails, or phones. Put it in your LinkedIn / X / WhatsApp bio.</p>
      <div class="copy-row">
        <input id="pub-handle-input" value="${esc(defaultHandle)}" placeholder="your-handle (e.g. nithin)" aria-label="Public handle" />
        <button type="button" class="btn btn-primary btn-sm" id="btn-publish-pub">${publicUrl ? 'Update' : 'Publish'}</button>
        ${publicUrl ? `<button type="button" class="btn btn-ghost btn-sm" id="btn-unpublish-pub">Turn off</button>` : ''}
      </div>
      ${publicUrl ? `
        <div class="copy-row">
          <input type="url" readonly value="${esc(publicUrl)}" />
          <button type="button" class="btn btn-olive btn-sm" id="btn-copy-pub">Copy URL</button>
          <a class="btn btn-outline btn-sm" href="/u/${esc(profile.publicHandle)}" target="_blank" rel="noopener">Open ↗</a>
        </div>
      ` : ''}
    </section>

    <section class="source-box">
      <div class="source-box-head">
        <h3>Invite a trusted friend to your Circle</h3>
        <span class="badge circle">2nd-degree paths</span>
      </div>
      <p>Share a one-time link. Once they join, their companies appear as 2nd-degree bridges in your 3D graph.</p>
      <div id="invite-link-area">
        <button type="button" class="btn btn-olive btn-sm" id="btn-gen-invite">Generate private invite link</button>
      </div>
    </section>

    <section class="source-box">
      <div class="source-box-head">
        <h3>Connected circle (${circleConnections.length})</h3>
      </div>
      ${circleConnections.length ? `
        <div class="dir-list">
          ${circleConnections.map((c) => `
            <div class="dir-item" style="cursor:default;">
              <div class="avatar-circle">${esc((c.name || '?')[0].toUpperCase())}</div>
              <div class="dir-item-main">
                <strong>${esc(c.name)}</strong>
                <small>${c.sharedCompanies.length} shared organizations</small>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" data-disconnect="${esc(c.id)}">Remove</button>
            </div>
          `).join('')}
        </div>
      ` : `<p>No circle connections yet. Invite a friend to unlock 2nd-degree warm intro paths.</p>`}
    </section>

    ${(incoming.length || outgoing.length) ? `
      <section class="source-box">
        <h3>Warm intro requests (live)</h3>
        ${incoming.map((req) => `
          <div class="request-card">
            <div>
              <strong>${esc(req.requesterName)}</strong> asked for an intro to <strong>${esc(req.targetCompany)}</strong>
              <span class="badge ${req.status === 'vouched' ? 'google' : req.status === 'declined' ? '' : 'intro'}" style="margin-left:6px;">${esc(req.status)}</span>
            </div>
            ${req.note ? `<p>“${esc(req.note)}”</p>` : ''}
            <div class="request-card-actions">
              ${req.status === 'pending' ? `
                <button type="button" class="btn btn-primary btn-sm" data-vouch="${esc(req.id)}">Vouch &amp; share on WhatsApp</button>
                <button type="button" class="btn btn-outline btn-sm" data-decline="${esc(req.id)}">Decline</button>
              ` : req.status === 'vouched' ? `
                <button type="button" class="btn btn-outline btn-sm" data-handoff="${esc(req.id)}">Open WhatsApp / Email handoff</button>
              ` : ''}
            </div>
          </div>
        `).join('')}
        ${outgoing.map((req) => `
          <div class="request-card">
            <div>
              You asked <strong>${esc(req.connectorName)}</strong> for an intro to <strong>${esc(req.targetCompany)}</strong>
              <span class="badge ${req.status === 'vouched' ? 'google' : 'intro'}" style="margin-left:6px;">${esc(req.status)}</span>
            </div>
            ${req.note ? `<p>“${esc(req.note)}”</p>` : ''}
          </div>
        `).join('')}
      </section>
    ` : ''}

    <section class="source-box">
      <h3>Your profile</h3>
      <form class="form-stack" id="profile-edit-form">
        <div class="field-row">
          <label class="field">Display name<input name="displayName" value="${esc(profile?.displayName || '')}" required /></label>
          <label class="field">Headline<input name="headline" value="${esc(profile?.headline || '')}" placeholder="Founder · Nhancio" /></label>
        </div>
        <label class="field">Your LinkedIn URL<input name="linkedinUrl" type="url" value="${esc(profile?.linkedinUrl || '')}" placeholder="https://linkedin.com/in/your-handle" /></label>
        <button type="submit" class="btn btn-outline btn-sm" style="align-self:flex-start;">Save profile</button>
      </form>
    </section>
  `, {
    onMount({ root, close }) {
      root.querySelector('#btn-publish-pub').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const handle = normalizeHandle(root.querySelector('#pub-handle-input').value);
        btn.disabled = true;
        try {
          const published = await onPublishPublicProfile(handle);
          onToast(`Public intro page live at ref.nhancio.com/u/${published}`);
          close();
        } catch (err) {
          onToast(err.message || 'Could not publish public page.');
          btn.disabled = false;
        }
      });

      root.querySelector('#btn-unpublish-pub')?.addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        await onUnpublishPublicProfile();
        onToast('Public intro page turned off.');
        close();
      });

      root.querySelector('#btn-copy-pub')?.addEventListener('click', async () => {
        await navigator.clipboard.writeText(publicUrl);
        onToast('Public intro link copied.');
      });

      root.querySelector('#btn-gen-invite').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const url = await onCreateInvite();
          root.querySelector('#invite-link-area').innerHTML = `
            <div class="copy-row">
              <input type="url" readonly value="${esc(url)}" />
              <button type="button" class="btn btn-olive btn-sm" id="btn-copy-invite">Copy</button>
            </div>
          `;
          root.querySelector('#btn-copy-invite').addEventListener('click', async () => {
            await navigator.clipboard.writeText(url);
            onToast('Private invite link copied.');
          });
        } catch (err) {
          onToast(err.message || 'Could not generate invite.');
          btn.disabled = false;
        }
      });

      root.querySelectorAll('[data-disconnect]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          await onRemoveConnection(btn.dataset.disconnect);
          onToast('Connection removed.');
          close();
        });
      });

      root.querySelectorAll('[data-vouch]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const req = incoming.find((r) => r.id === btn.dataset.vouch);
          btn.disabled = true;
          await onRespondIntro(btn.dataset.vouch, 'vouched');
          onToast('Vouched! Ready to share on WhatsApp or Email.');
          if (req) {
            openWarmIntroHandoffModal({
              connectorName: profile?.displayName || '',
              requesterName: req.requesterName,
              targetCompany: req.targetCompany,
              note: req.note,
              onToast,
            });
          } else {
            close();
          }
        });
      });

      root.querySelectorAll('[data-handoff]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const req = incoming.find((r) => r.id === btn.dataset.handoff);
          if (req) {
            openWarmIntroHandoffModal({
              connectorName: profile?.displayName || '',
              requesterName: req.requesterName,
              targetCompany: req.targetCompany,
              note: req.note,
              onToast,
            });
          }
        });
      });

      root.querySelectorAll('[data-decline]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          await onRespondIntro(btn.dataset.decline, 'declined');
          onToast('Request declined.');
          close();
        });
      });

      root.querySelector('#profile-edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        await onSaveProfile({
          displayName: String(fd.get('displayName') || '').trim(),
          headline: String(fd.get('headline') || '').trim(),
          linkedinUrl: String(fd.get('linkedinUrl') || '').trim(),
        });
        onToast('Profile saved.');
        close();
      });
    },
  });
}

export function openIntroRequestModal({ connectorName, targetCompany, onSubmit, onToast }) {
  openModal(`Ask ${connectorName} for an intro`, `
    <p style="font-size:0.9rem; color:var(--ref-muted); line-height:1.5;">
      Send a short private note to <strong>${esc(connectorName)}</strong> asking for an introduction at <strong>${esc(targetCompany)}</strong>.
    </p>
    <form class="form-stack" id="intro-req-form">
      <label class="field">Context for ${esc(connectorName)}
        <textarea name="note" rows="3" required placeholder="e.g. Would love a warm intro to someone on their partnerships team — building Ref Network in Bengaluru."></textarea>
      </label>
      <button type="submit" class="btn btn-primary">Send intro request</button>
    </form>
  `, {
    onMount({ root, close }) {
      root.querySelector('#intro-req-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const btn = e.currentTarget.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
          await onSubmit(String(fd.get('note') || '').trim());
          onToast(`Intro request sent to ${connectorName}.`);
          close();
        } catch (err) {
          onToast(err.message || 'Could not send request.');
          btn.disabled = false;
        }
      });
    },
  });
}
