import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// In-memory cache of { uid, email, name, phone, role } for the signed-in user.
let currentProfile = null;
let authReadyResolvers = [];
let authReady = false;

async function loadProfile(user) {
  if (!user) { currentProfile = null; return null; }
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    currentProfile = { uid: user.uid, email: user.email, ...snap.data() };
  } else {
    currentProfile = {
      uid: user.uid, email: user.email,
      name: user.displayName || user.email.split("@")[0],
      phone: "", role: "user"
    };
  }
  return currentProfile;
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    await loadProfile(user);
    authReady = true;
    authReadyResolvers.forEach(r => r());
    authReadyResolvers = [];
    callback(currentProfile);
  });
}

export function whenAuthReady() {
  return new Promise((resolve) => {
    if (authReady) resolve(currentProfile);
    else authReadyResolvers.push(() => resolve(currentProfile));
  });
}

export function getProfile() {
  return currentProfile;
}

export async function signUp(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await setDoc(doc(db, "users", cred.user.uid), {
    name, email, phone: "", role: "user", createdAt: serverTimestamp()
  });
  await loadProfile(cred.user);
  return currentProfile;
}

export async function logIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await loadProfile(cred.user);
  return currentProfile;
}

export function logOut() {
  return signOut(auth);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

export async function updateOwnProfile({ name, phone }) {
  const ref = doc(db, "users", auth.currentUser.uid);
  await updateDoc(ref, { name, phone });
  if (currentProfile) { currentProfile.name = name; currentProfile.phone = phone; }
}

export async function changeOwnPassword(oldPassword, newPassword) {
  const cred = EmailAuthProvider.credential(auth.currentUser.email, oldPassword);
  await reauthenticateWithCredential(auth.currentUser, cred);
  await updatePassword(auth.currentUser, newPassword);
}

export function authErrorMessage(err) {
  const map = {
    "auth/email-already-in-use": "Такой email уже зарегистрирован.",
    "auth/invalid-email": "Некорректный email.",
    "auth/weak-password": "Пароль должен быть не короче 6 символов.",
    "auth/user-not-found": "Пользователь с таким email не найден.",
    "auth/wrong-password": "Неверный пароль.",
    "auth/invalid-credential": "Неверный email или пароль.",
    "auth/too-many-requests": "Слишком много попыток. Попробуйте позже."
  };
  return map[err.code] || "Что-то пошло не так. Попробуйте ещё раз.";
}
