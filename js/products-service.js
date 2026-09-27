import { db, PAGE_SIZE } from "./firebase-config.js";
import {
  collection, doc, query, where, orderBy, limit, startAfter, onSnapshot,
  getDocs, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export const CATEGORIES = [
  "Цветочный", "Липовый", "Гречишный", "Акациевый", "Каштановый", "Донниковый", "Разнотравье"
];

export const TAGS = [
  "фермерский", "с сотами", "крем-мёд", "подарочный набор", "без добавок", "для детей"
];

const col = () => collection(db, "products");

export function buildKeywords(name, description, category, tags = []) {
  const text = `${name} ${description} ${category} ${tags.join(" ")}`.toLowerCase();
  const words = (text.match(/[a-zа-яё0-9]+/gi) || []).filter(w => w.length > 1);
  const prefixes = new Set();
  words.forEach(w => {
    for (let i = 2; i <= w.length; i++) prefixes.add(w.slice(0, i));
  });
  return [...prefixes];
}

export async function queryProducts(opts = {}) {
  const {
    searchWord = "", category = "", tag = "",
    sortBy = "createdAt", sortDir = "desc", cursor = null, pageSize = PAGE_SIZE
  } = opts;

  const tagClientSide = Boolean(searchWord && tag);
  const clauses = [];
  if (searchWord) clauses.push(where("keywords", "array-contains", searchWord.toLowerCase()));
  else if (tag) clauses.push(where("tags", "array-contains", tag));
  if (category) clauses.push(where("category", "==", category));

  const q = query(col(), ...clauses, orderBy(sortBy, sortDir), limit(pageSize), ...(cursor ? [startAfter(cursor)] : []));
  const snap = await getDocs(q);
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const lastDoc = snap.docs[snap.docs.length - 1] || null;
  const hasMore = snap.docs.length === pageSize;
  if (tagClientSide) items = items.filter(p => (p.tags || []).includes(tag));
  return { items, lastDoc, hasMore };
}

export async function countProducts({ searchWord = "", category = "", tag = "" } = {}) {
  const clauses = [];
  if (searchWord) clauses.push(where("keywords", "array-contains", searchWord.toLowerCase()));
  else if (tag) clauses.push(where("tags", "array-contains", tag));
  if (category) clauses.push(where("category", "==", category));
  const snap = await getCountFromServer(query(col(), ...clauses));
  return snap.data().count;
}

export async function getSearchSuggestions(prefixWord, limitN = 5) {
  if (!prefixWord) return [];
  const q = query(col(), where("keywords", "array-contains", prefixWord.toLowerCase()), limit(limitN));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getProduct(id) {
  const snap = await getDoc(doc(db, "products", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function watchProduct(id, callback, onError) {
  return onSnapshot(doc(db, "products", id), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (err) => { console.error("watchProduct:", err); if (onError) onError(err); });
}

export async function getRelatedProducts(product, limitN = 4) {
  const q = query(col(), where("category", "==", product.category), limit(limitN + 1));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.id !== product.id)
    .slice(0, limitN);
}

/* ---------------------------- admin CRUD ---------------------------- */

export async function createProduct(data) {
  const payload = {
    ...data,
    keywords: buildKeywords(data.name, data.description, data.category, data.tags),
    rating: 0,
    reviewsCount: 0,
    createdAt: serverTimestamp()
  };
  const ref = await addDoc(col(), payload);
  return ref.id;
}

export async function updateProduct(id, data) {
  const payload = { ...data };
  if (data.name || data.description || data.category || data.tags) {
    payload.keywords = buildKeywords(
      data.name ?? "", data.description ?? "", data.category ?? "", data.tags ?? []
    );
  }
  await updateDoc(doc(db, "products", id), payload);
}

export async function deleteProduct(id) {
  await deleteDoc(doc(db, "products", id));
}
