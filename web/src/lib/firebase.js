import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  deleteUser,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  addDoc,
  query,
  where,
  writeBatch,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { normalizeGooglePeople } from './parsers.js';

const customAuthDomain =
  typeof location !== 'undefined' && location.hostname === 'ref.nhancio.com'
    ? 'ref.nhancio.com'
    : 'ref-nhancio.firebaseapp.com';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCyy8hntzve8fvwja6e9QmkxgTYsNsvE_o',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || customAuthDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ref-nhancio',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'ref-nhancio.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '996478177206',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:996478177206:web:cc4ac7dc2ab63134317b17',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function friendlyAuthError(err) {
  const code = err?.code || '';
  if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed') {
    return 'Enable this sign-in provider in Firebase Console (ref-nhancio → Authentication → Sign-in method).';
  }
  if (code === 'auth/unauthorized-domain') {
    return `Add ${location.hostname} to Firebase Auth Authorized Domains (ref-nhancio → Authentication → Settings).`;
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Sign-in popup was closed before completing.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Invalid email or password.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (code === 'auth/weak-password') {
    return 'Choose a password with at least 6 characters.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'Please sign out and sign back in once before deleting your account.';
  }
  return err?.message || 'Authentication failed. Please try again.';
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signInWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
}

export async function signUpWithEmail(name, email, password) {
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const cleanName = name.trim();
  if (cleanName) {
    await updateProfile(result.user, { displayName: cleanName });
    await setDoc(doc(db, 'users', result.user.uid), {
      displayName: cleanName,
      email: result.user.email || '',
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  return result.user;
}

export async function logOut() {
  await signOut(auth);
}

export async function fetchGoogleContactsViaOAuth() {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/contacts.readonly');
  provider.setCustomParameters({ prompt: 'consent', include_granted_scopes: 'true' });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;
  if (!accessToken) {
    throw new Error('Google did not return a Contacts access token. Try again or upload a .vcf / .csv file.');
  }

  const allConnections = [];
  let pageToken = '';
  let pages = 0;

  while (pages < 6) {
    pages++;
    const params = new URLSearchParams({
      personFields: 'names,emailAddresses,phoneNumbers,organizations,photos,urls',
      pageSize: '500',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await fetch(`https://people.googleapis.com/v1/people/me/connections?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const msg = payload?.error?.message || `Google People API returned HTTP ${response.status}.`;
      throw new Error(msg);
    }

    const data = await response.json();
    if (Array.isArray(data.connections)) {
      allConnections.push(...data.connections);
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return normalizeGooglePeople(allConnections);
}

export async function ensureUserProfile(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return { id: user.uid, ...snap.data() };
  }
  const initial = {
    displayName: user.displayName || user.email?.split('@')[0] || 'Ref Member',
    email: user.email || '',
    photoUrl: user.photoURL || '',
    headline: '',
    linkedinUrl: '',
    publicHandle: '',
    publicProfileEnabled: false,
    shareCompaniesWithCircle: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, initial, { merge: true });
  return { id: user.uid, ...initial };
}

export async function updateUserProfile(uid, patch) {
  const ref = doc(db, 'users', uid);
  await setDoc(ref, { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

export async function loadUserContacts(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'contacts'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveContactsBatch(uid, contacts) {
  const CHUNK = 400;
  for (let i = 0; i < contacts.length; i += CHUNK) {
    const slice = contacts.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const c of slice) {
      const ref = doc(db, 'users', uid, 'contacts', c.id);
      batch.set(ref, {
        name: c.name,
        email: c.email || '',
        phone: c.phone || '',
        company: c.company || '',
        companyKey: c.companyKey || '',
        companyInferred: Boolean(c.companyInferred),
        role: c.role || '',
        linkedinUrl: c.linkedinUrl || '',
        photoUrl: c.photoUrl || '',
        connectedOn: c.connectedOn || '',
        messageCount: Number(c.messageCount || 0),
        lastMessagedAt: c.lastMessagedAt || '',
        strength: c.strength || '',
        canIntroduce: Boolean(c.canIntroduce),
        notes: c.notes || '',
        sources: Array.isArray(c.sources) ? c.sources : ['manual'],
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  }
}

export async function updateSingleContact(uid, contactId, patch) {
  const ref = doc(db, 'users', uid, 'contacts', contactId);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
}

export async function bulkSetCanIntroduce(uid, contactIds, value) {
  const CHUNK = 400;
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const id of contactIds.slice(i, i + CHUNK)) {
      batch.update(doc(db, 'users', uid, 'contacts', id), {
        canIntroduce: Boolean(value),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

export async function deleteSingleContact(uid, contactId) {
  await deleteDoc(doc(db, 'users', uid, 'contacts', contactId));
}

export async function deleteContactsBatch(uid, contactIds) {
  const CHUNK = 400;
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const id of contactIds.slice(i, i + CHUNK)) {
      batch.delete(doc(db, 'users', uid, 'contacts', id));
    }
    await batch.commit();
  }
}

export async function deleteAllUserDataAndAccount(user, contacts = [], connections = [], publicHandle = '') {
  const uid = user.uid;
  if (contacts.length) {
    await deleteContactsBatch(uid, contacts.map((c) => c.id));
  }
  for (const conn of connections) {
    await deleteDoc(doc(db, 'connections', conn.id)).catch(() => {});
  }
  if (publicHandle) {
    await deleteDoc(doc(db, 'publicProfiles', publicHandle)).catch(() => {});
  }
  await deleteDoc(doc(db, 'users', uid)).catch(() => {});
  await deleteUser(user);
}

// Opt-in public "Where I can intro you" profile (ZERO raw contact PII!)
export async function getPublicProfile(handle) {
  const clean = String(handle || '').toLowerCase().trim();
  if (!clean) return null;
  const snap = await getDoc(doc(db, 'publicProfiles', clean));
  if (!snap.exists()) return null;
  return { handle: clean, ...snap.data() };
}

export async function publishPublicProfile(uid, profile, handle, companyReach = []) {
  const clean = String(handle || '').toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(clean)) {
    throw new Error('Choose a handle with 3–32 lowercase letters, numbers, or hyphens.');
  }
  // Prefer companies explicitly marked "Can intro", fallback to top reachable orgs
  const introMarked = companyReach.filter((c) => c.introCount > 0);
  const listed = (introMarked.length ? introMarked : companyReach).slice(0, 40).map((c) => ({
    companyKey: c.companyKey,
    company: c.company,
    count: c.count,
    introCount: c.introCount,
  }));

  // If handle changed, remove old handle doc
  if (profile?.publicHandle && profile.publicHandle !== clean) {
    await deleteDoc(doc(db, 'publicProfiles', profile.publicHandle)).catch(() => {});
  }

  await setDoc(doc(db, 'publicProfiles', clean), {
    uid,
    handle: clean,
    displayName: profile?.displayName || 'Ref Member',
    headline: profile?.headline || '',
    photoUrl: profile?.photoUrl || '',
    linkedinUrl: profile?.linkedinUrl || '',
    introCompanies: listed,
    updatedAt: serverTimestamp(),
  });

  await updateUserProfile(uid, { publicHandle: clean, publicProfileEnabled: true });
  return clean;
}

export async function unpublishPublicProfile(uid, handle) {
  if (handle) {
    await deleteDoc(doc(db, 'publicProfiles', handle)).catch(() => {});
  }
  await updateUserProfile(uid, { publicProfileEnabled: false });
}

function randomToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createCircleInvite(user, profile) {
  const token = randomToken();
  await setDoc(doc(db, 'invites', token), {
    inviterUid: user.uid,
    inviterName: profile?.displayName || user.displayName || 'Ref Member',
    inviterPhoto: profile?.photoUrl || user.photoURL || '',
    inviterHeadline: profile?.headline || '',
    usedBy: null,
    createdAt: serverTimestamp(),
  });
  return token;
}

export async function getCircleInvite(token) {
  const snap = await getDoc(doc(db, 'invites', token));
  if (!snap.exists()) return null;
  return { token, ...snap.data() };
}

export async function acceptCircleInvite(token, user, profile, sharedCompanies = []) {
  const invite = await getCircleInvite(token);
  if (!invite) throw new Error('This invitation link is invalid or expired.');
  if (invite.inviterUid === user.uid) throw new Error('You cannot accept your own invitation link.');
  if (invite.usedBy && invite.usedBy !== user.uid) throw new Error('This invitation link has already been used.');

  const members = [invite.inviterUid, user.uid].sort();
  const pairId = members.join('_');
  const myName = profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Ref Member';

  await setDoc(doc(db, 'connections', pairId), {
    members,
    status: 'connected',
    inviterUid: invite.inviterUid,
    profiles: {
      [invite.inviterUid]: {
        uid: invite.inviterUid,
        name: invite.inviterName,
        photoUrl: invite.inviterPhoto || '',
        headline: invite.inviterHeadline || '',
      },
      [user.uid]: {
        uid: user.uid,
        name: myName,
        photoUrl: profile?.photoUrl || user.photoURL || '',
        headline: profile?.headline || '',
      },
    },
    sharedCompanies: {
      [user.uid]: sharedCompanies.slice(0, 40),
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await updateDoc(doc(db, 'invites', token), { usedBy: user.uid });
  return pairId;
}

function mapConnectionDoc(d, uid) {
  const data = d.data();
  const otherUid = (data.members || []).find((m) => m !== uid);
  const otherProfile = data.profiles?.[otherUid] || { uid: otherUid, name: 'Connected Member' };
  return {
    id: d.id,
    uid: otherUid,
    name: otherProfile.name || 'Connected Member',
    photoUrl: otherProfile.photoUrl || '',
    headline: otherProfile.headline || '',
    status: data.status || 'connected',
    sharedCompanies: data.sharedCompanies?.[otherUid] || [],
  };
}

export async function loadCircleConnections(uid) {
  const q = query(collection(db, 'connections'), where('members', 'array-contains', uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapConnectionDoc(d, uid));
}

export function subscribeCircleConnections(uid, callback) {
  const q = query(collection(db, 'connections'), where('members', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => mapConnectionDoc(d, uid)));
  }, () => {});
}

export async function publishSharedCompaniesToCircle(uid, connections, sharedCompanies) {
  if (!connections.length) return;
  const top = sharedCompanies.slice(0, 40).map((c) => ({
    companyKey: c.companyKey,
    company: c.company,
    count: c.count,
    introCount: c.introCount,
  }));
  const batch = writeBatch(db);
  for (const conn of connections) {
    batch.set(doc(db, 'connections', conn.id), {
      sharedCompanies: { [uid]: top },
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
}

export async function removeCircleConnection(pairId) {
  await deleteDoc(doc(db, 'connections', pairId));
}

export async function createIntroRequest({ requesterUid, requesterName, connectorUid, connectorName, targetCompany, note }) {
  const ref = await addDoc(collection(db, 'introRequests'), {
    requesterUid,
    requesterName,
    connectorUid,
    connectorName,
    targetCompany,
    note: String(note || '').trim().slice(0, 500),
    status: 'pending',
    replyNote: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function loadIntroRequests(uid) {
  const [inSnap, outSnap] = await Promise.all([
    getDocs(query(collection(db, 'introRequests'), where('connectorUid', '==', uid))),
    getDocs(query(collection(db, 'introRequests'), where('requesterUid', '==', uid))),
  ]);
  return {
    incoming: inSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    outgoing: outSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

export function subscribeIntroRequests(uid, callback) {
  let incoming = [];
  let outgoing = [];
  const emit = () => callback({ incoming: [...incoming], outgoing: [...outgoing] });

  const unsubIn = onSnapshot(
    query(collection(db, 'introRequests'), where('connectorUid', '==', uid)),
    (snap) => {
      incoming = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      emit();
    },
    () => {},
  );
  const unsubOut = onSnapshot(
    query(collection(db, 'introRequests'), where('requesterUid', '==', uid)),
    (snap) => {
      outgoing = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      emit();
    },
    () => {},
  );

  return () => {
    unsubIn();
    unsubOut();
  };
}

export async function respondToIntroRequest(reqId, status, replyNote = '') {
  await updateDoc(doc(db, 'introRequests', reqId), {
    status,
    replyNote: String(replyNote || '').trim().slice(0, 500),
    updatedAt: serverTimestamp(),
  });
}
