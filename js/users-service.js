import { db, PAGE_SIZE } from "./firebase-config.js";
import {
  collection, doc, query, orderBy, limit, startAfter,
  getDocs, updateDoc, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const col = () => collection(db, "users");

export async function queryUsers({ cursor = null, pageSize = PAGE_SIZE } = {}) {
  const q = query(col(), orderBy("createdAt", "desc"), limit(pageSize), ...(cursor ? [startAfter(cursor)] : []));
  const snap = await getDocs(q);
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const lastDoc = snap.docs[snap.docs.length - 1] || null;
  return { items, lastDoc, hasMore: snap.docs.length === pageSize };
}

export async function countUsers() {
  const snap = await getCountFromServer(col());
  return snap.data().count;
}

export async function setUserRole(uid, role) {
  await updateDoc(doc(db, "users", uid), { role });
}
