import './styles/tokens.css';
import './styles/app.css';
import {
  watchAuth,
  signInWithGoogle,
  friendlyAuthError,
  logOut,
  ensureUserProfile,
  updateUserProfile,
  loadUserContacts,
  saveContactsBatch,
  updateSingleContact,
  bulkSetCanIntroduce,
  deleteSingleContact,
  deleteContactsBatch,
  deleteAllUserDataAndAccount,
  getPublicProfile,
  publishPublicProfile,
  unpublishPublicProfile,
  createCircleInvite,
  getCircleInvite,
  acceptCircleInvite,
  loadCircleConnections,
  subscribeCircleConnections,
  publishSharedCompaniesToCircle,
  removeCircleConnection,
  createIntroRequest,
  loadIntroRequests,
  subscribeIntroRequests,
  respondToIntroRequest,
} from './lib/firebase.js';
import {
  mergeContactLists,
  enrichMissingCompanies,
  summarizeCompanyReach,
} from './lib/dedupe.js';
import { mountLanding } from './ui/landing.js';
import { mountWorkspace } from './ui/workspace.js';
import { mountPublicProfile } from './ui/public-profile.js';
import {
  openAuthModal,
  openConnectModal,
  openCircleModal,
  openIntroRequestModal,
  openWarmIntroHandoffModal,
} from './ui/modals.js';

const appEl = document.getElementById('app');
const toastEl = document.getElementById('toast');

let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.hidden = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4200);
}

const params = new URLSearchParams(location.search);
let pendingInviteToken = /^[a-f0-9]{16,64}$/.test(params.get('invite') || '') ? params.get('invite') : null;
const publicHandleRoute = () => location.pathname.match(/^\/u\/([a-z0-9-]+)\/?$/i)?.[1]?.toLowerCase() || null;

let currentView = null;
let liveUnsubs = [];
let state = {
  user: null,
  profile: null,
  contacts: [],
  circle: [],
  introRequests: { incoming: [], outgoing: [] },
};

function clearView() {
  currentView?.destroy?.();
  currentView = null;
}

function clearLiveListeners() {
  for (const fn of liveUnsubs) fn?.();
  liveUnsubs = [];
}

async function syncDerivedReach(uid) {
  const reach = summarizeCompanyReach(state.contacts);
  if (state.circle.length) {
    await publishSharedCompaniesToCircle(uid, state.circle, reach).catch(() => {});
  }
  if (state.profile?.publicProfileEnabled && state.profile?.publicHandle) {
    await publishPublicProfile(uid, state.profile, state.profile.publicHandle, reach).catch(() => {});
  }
}

async function hydrateUserData(user) {
  const [profile, rawContacts, circle, introRequests] = await Promise.all([
    ensureUserProfile(user),
    loadUserContacts(user.uid),
    loadCircleConnections(user.uid),
    loadIntroRequests(user.uid),
  ]);

  // Auto-upgrade any previously synced contacts that have a work email but no company yet
  const { enriched, changed } = enrichMissingCompanies(rawContacts);
  if (changed.length) {
    saveContactsBatch(user.uid, changed).catch(() => {});
  }

  state = { user, profile, contacts: enriched, circle, introRequests };

  if (pendingInviteToken) {
    const token = pendingInviteToken;
    pendingInviteToken = null;
    history.replaceState({}, '', '/');
    try {
      const reach = summarizeCompanyReach(enriched);
      await acceptCircleInvite(token, user, profile, reach);
      state.circle = await loadCircleConnections(user.uid);
      showToast('Connected! You can now see each other’s warm intro paths.');
    } catch (err) {
      showToast(err.message || 'Could not accept invitation.');
    }
  }

  // Real-time Firestore subscriptions for circle & warm intro requests
  clearLiveListeners();
  liveUnsubs.push(
    subscribeCircleConnections(user.uid, (nextCircle) => {
      state.circle = nextCircle;
      currentView?.refresh?.(true, { background: true });
    }),
    subscribeIntroRequests(user.uid, (nextReqs) => {
      const prevPending = (state.introRequests.incoming || []).filter((r) => r.status === 'pending').length;
      const nextPending = (nextReqs.incoming || []).filter((r) => r.status === 'pending').length;
      state.introRequests = nextReqs;
      if (nextPending > prevPending) {
        showToast('New warm introduction request received.');
      }
      currentView?.refresh?.(true, { background: true });
    }),
  );
}

async function renderPublicHandlePage(handle) {
  clearView();
  appEl.innerHTML = `<div class="boot-screen"><img src="/ref-mark.svg" alt="" width="40" height="34" /><p>Opening /u/${handle}…</p></div>`;
  const pub = await getPublicProfile(handle).catch(() => null);
  currentView = mountPublicProfile(appEl, {
    publicProfile: pub,
    currentUser: state.user,
    onOpenAuth(mode) {
      openAuthModal({ mode });
    },
    onRequestIntro({ connectorUid, connectorName, targetCompany }) {
      openIntroRequestModal({
        connectorName,
        targetCompany,
        onToast: showToast,
        async onSubmit(note) {
          await createIntroRequest({
            requesterUid: state.user.uid,
            requesterName: state.profile?.displayName || state.user.displayName || 'Ref Member',
            connectorUid,
            connectorName,
            targetCompany,
            note,
          });
        },
      });
    },
    onGoHome() {
      history.pushState({}, '', '/');
      if (state.user) renderSignedIn();
      else renderSignedOut();
    },
  });
}

function renderSignedOut() {
  clearView();
  currentView = mountLanding(appEl, {
    pendingInvite: Boolean(pendingInviteToken),
    onOpenAuth(mode) {
      openAuthModal({ mode });
    },
    async onGoogleSignIn() {
      try {
        await signInWithGoogle();
      } catch (err) {
        showToast(friendlyAuthError(err));
        throw err;
      }
    },
  });
}

function renderSignedIn() {
  clearView();
  currentView = mountWorkspace(appEl, {
    user: state.user,
    profile: state.profile,
    getContacts: () => state.contacts,
    getCircle: () => state.circle,
    getIntroRequests: () => state.introRequests,

    onOpenConnect() {
      openConnectModal({
        contacts: state.contacts,
        onToast: showToast,
        async onImportContacts(incoming) {
          const { merged, changed, addedCount, updatedCount } = mergeContactLists(state.contacts, incoming);
          await saveContactsBatch(state.user.uid, changed);
          state.contacts = merged;
          await syncDerivedReach(state.user.uid);
          currentView?.refresh?.(false);
          return { addedCount, updatedCount };
        },
        async onClearSource(sourceName) {
          const toDelete = state.contacts.filter((c) => {
            const srcs = c.sources || [];
            return srcs.includes(sourceName) && srcs.every((s) => s === sourceName);
          });
          if (!toDelete.length) {
            showToast(`No ${sourceName}-only contacts to remove.`);
            return;
          }
          await deleteContactsBatch(state.user.uid, toDelete.map((c) => c.id));
          const delIds = new Set(toDelete.map((c) => c.id));
          state.contacts = state.contacts.filter((c) => !delIds.has(c.id));
          await syncDerivedReach(state.user.uid);
          currentView?.refresh?.(false);
          showToast(`Removed ${toDelete.length} ${sourceName} contacts.`);
        },
        onExportBackup() {
          const blob = new Blob([JSON.stringify({
            exportedAt: new Date().toISOString(),
            profile: state.profile,
            contacts: state.contacts,
          }, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `ref-network-backup-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
        },
        async onDeleteAccount() {
          clearLiveListeners();
          await deleteAllUserDataAndAccount(
            state.user,
            state.contacts,
            state.circle,
            state.profile?.publicHandle || '',
          );
          showToast('Account and all private data permanently deleted.');
        },
      });
    },

    onOpenCircle() {
      openCircleModal({
        profile: state.profile,
        circleConnections: state.circle,
        introRequests: state.introRequests,
        onToast: showToast,
        async onCreateInvite() {
          const reach = summarizeCompanyReach(state.contacts);
          const token = await createCircleInvite(state.user, state.profile, reach);
          return `${location.origin}/?invite=${token}`;
        },
        async onRemoveConnection(pairId) {
          await removeCircleConnection(pairId);
          state.circle = state.circle.filter((c) => c.id !== pairId);
          currentView?.refresh?.(false);
        },
        async onRespondIntro(reqId, status) {
          await respondToIntroRequest(reqId, status);
          state.introRequests = await loadIntroRequests(state.user.uid);
          currentView?.refresh?.(true);
        },
        async onSaveProfile(patch) {
          await updateUserProfile(state.user.uid, patch);
          state.profile = { ...state.profile, ...patch };
          await syncDerivedReach(state.user.uid);
          renderSignedIn();
        },
        async onPublishPublicProfile(handle) {
          const reach = summarizeCompanyReach(state.contacts);
          const published = await publishPublicProfile(state.user.uid, state.profile, handle, reach);
          state.profile = { ...state.profile, publicHandle: published, publicProfileEnabled: true };
          currentView?.refresh?.(true);
          return published;
        },
        async onUnpublishPublicProfile() {
          await unpublishPublicProfile(state.user.uid, state.profile?.publicHandle);
          state.profile = { ...state.profile, publicProfileEnabled: false };
          currentView?.refresh?.(true);
        },
      });
    },

    async onToggleIntro(contactId, value) {
      await updateSingleContact(state.user.uid, contactId, { canIntroduce: value });
      state.contacts = state.contacts.map((c) => (c.id === contactId ? { ...c, canIntroduce: value } : c));
      await syncDerivedReach(state.user.uid);
      showToast(value ? 'Marked as ready to introduce.' : 'Removed intro marker.');
    },

    async onBulkToggleCompanyIntro(contactIds, value, companyName) {
      await bulkSetCanIntroduce(state.user.uid, contactIds, value);
      const idSet = new Set(contactIds);
      state.contacts = state.contacts.map((c) => (idSet.has(c.id) ? { ...c, canIntroduce: value } : c));
      await syncDerivedReach(state.user.uid);
      showToast(value ? `Marked all ${contactIds.length} at ${companyName} as Can Intro.` : `Unmarked ${companyName}.`);
    },

    onOpenQuickHandoff(person) {
      openWarmIntroHandoffModal({
        connectorName: state.profile?.displayName || state.user.displayName || '',
        requesterName: 'a friend from my circle',
        targetCompany: person.company || '',
        contactName: person.name,
        contactPhone: person.phone || '',
        contactEmail: person.email || '',
        onToast: showToast,
      });
    },

    async onSaveNotes(contactId, notes) {
      await updateSingleContact(state.user.uid, contactId, { notes });
      state.contacts = state.contacts.map((c) => (c.id === contactId ? { ...c, notes } : c));
      showToast('Note saved.');
    },

    async onDeleteContact(contactId) {
      await deleteSingleContact(state.user.uid, contactId);
      state.contacts = state.contacts.filter((c) => c.id !== contactId);
      await syncDerivedReach(state.user.uid);
      showToast('Contact removed.');
    },

    onRequestIntro({ connectorUid, connectorName, targetCompany }) {
      openIntroRequestModal({
        connectorName,
        targetCompany,
        onToast: showToast,
        async onSubmit(note) {
          await createIntroRequest({
            requesterUid: state.user.uid,
            requesterName: state.profile?.displayName || state.user.displayName || 'Ref Member',
            connectorUid,
            connectorName,
            targetCompany,
            note,
          });
          state.introRequests = await loadIntroRequests(state.user.uid);
          currentView?.refresh?.(true);
        },
      });
    },

    async onSignOut() {
      clearLiveListeners();
      await logOut();
      showToast('Signed out.');
    },
  });
}

async function maybeInspectInvite() {
  if (!pendingInviteToken) return null;
  try {
    return await getCircleInvite(pendingInviteToken);
  } catch {
    return null;
  }
}

window.addEventListener('popstate', async () => {
  const pubHandle = publicHandleRoute();
  if (pubHandle) {
    await renderPublicHandlePage(pubHandle);
  } else if (state.user) {
    renderSignedIn();
  } else {
    renderSignedOut();
  }
});

watchAuth(async (user) => {
  const pubHandle = publicHandleRoute();

  if (!user) {
    clearLiveListeners();
    state = { user: null, profile: null, contacts: [], circle: [], introRequests: { incoming: [], outgoing: [] } };
    if (pubHandle) {
      await renderPublicHandlePage(pubHandle);
      return;
    }
    renderSignedOut();
    if (pendingInviteToken) {
      const invite = await maybeInspectInvite();
      openAuthModal({ mode: 'signin', inviteContext: invite });
    }
    return;
  }

  appEl.innerHTML = `<div class="boot-screen"><img src="/ref-mark.svg" alt="" width="40" height="34" /><p>Loading your relationship graph…</p></div>`;
  try {
    await hydrateUserData(user);
    if (pubHandle) {
      await renderPublicHandlePage(pubHandle);
    } else {
      renderSignedIn();
    }
  } catch (err) {
    showToast(err.message || 'Could not load your profile. Check Firestore permissions.');
    renderSignedIn();
  }
});
