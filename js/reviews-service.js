import { db, PAGE_SIZE } from "./firebase-config.js";
import {
  collection, doc, query, where, orderBy, limit, startAfter, onSnapshot,
  getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const col = () => collection(db, "reviews");
const productsCol = () => collection(db, "products");

export function watchProductReviews(productId, callback, limitN = 200, onError) {
  const q = query(col(), where("productId", "==", productId), orderBy("createdAt", "desc"), limit(limitN));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => { console.error("watchProductReviews:", err); if (onError) onError(err); });
}

export function watchUserReviews(uid, callback, onError) {
  const q = query(col(), where("userId", "==", uid), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => { console.error("watchUserReviews:", err); if (onError) onError(err); });
}

export async function getAllReviews(cursor = null) {
  const q = query(col(), orderBy("createdAt", "desc"), limit(PAGE_SIZE), ...(cursor ? [startAfter(cursor)] : []));
  const snap = await getDocs(q);
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const lastDoc = snap.docs[snap.docs.length - 1] || null;
  return { items, lastDoc, hasMore: snap.docs.length === PAGE_SIZE };
}

export async function getLatestReviews(limitN = 6) {
  const q = query(col(), orderBy("createdAt", "desc"), limit(limitN));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addReview(productId, productName, userId, userName, rating, text) {
  await addDoc(col(), { productId, productName, userId, userName, rating, text, createdAt: serverTimestamp() });
  await safeRecalc(productId);
}

export async function updateReview(reviewId, productId, { rating, text }) {
  await updateDoc(doc(db, "reviews", reviewId), { rating, text, editedAt: serverTimestamp() });
  await safeRecalc(productId);
}

export async function deleteReview(reviewId, productId) {
  await deleteDoc(doc(db, "reviews", reviewId));
  await safeRecalc(productId);
}

export async function adminDeleteReview(reviewId, productId) {
  return deleteReview(reviewId, productId);
}

async function safeRecalc(productId) {
  try {
    await recalcProductRating(productId);
  } catch (err) {
    console.warn(`Rating recalculation failed for product ${productId} (the review itself was saved fine):`, err);
  }
}

export async function recalcProductRating(productId) {
  const snap = await getDocs(query(col(), where("productId", "==", productId)));
  const all = snap.docs.map(d => d.data());
  const count = all.length;
  const avg = count ? all.reduce((s, r) => s + r.rating, 0) / count : 0;
  await updateDoc(doc(db, "products", productId), {
    rating: Math.round(avg * 10) / 10,
    reviewsCount: count
  });
}

export async function recalcAllProductRatings() {
  const productsSnap = await getDocs(productsCol());
  let updated = 0;
  for (const productDoc of productsSnap.docs) {
    try {
      await recalcProductRating(productDoc.id);
      updated++;
    } catch (err) {
      console.warn(`Could not recalc rating for ${productDoc.id}:`, err);
    }
  }
  return updated;
}
