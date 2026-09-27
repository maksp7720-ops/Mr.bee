import { db } from "./firebase-config.js";
import {
  collection, doc, query, where, orderBy, limit, onSnapshot,
  runTransaction, updateDoc, serverTimestamp,
  getAggregateFromServer, sum, average, count as countAgg
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const col = () => collection(db, "orders");

export const STATUSES = {
  new: "Новый",
  processing: "В обработке",
  completed: "Выполнен",
  cancelled: "Отменён"
};

export class InsufficientStockError extends Error {
  constructor(productName) {
    super(`Недостаточно товара на складе: ${productName}`);
    this.code = "insufficient-stock";
    this.productName = productName;
  }
}

export async function createOrder(userId, contact, items, total) {
  const orderRef = doc(col());
  const productRefs = items.map(i => doc(db, "products", i.productId));

  await runTransaction(db, async (tx) => {
    const snaps = await Promise.all(productRefs.map(ref => tx.get(ref)));

    snaps.forEach((snap, i) => {
      const currentStock = snap.exists() ? (snap.data().stock ?? 0) : 0;
      if (currentStock < items[i].qty) {
        throw new InsufficientStockError(items[i].name);
      }
    });

    tx.set(orderRef, { userId, contact, items, total, status: "new", createdAt: serverTimestamp() });

    snaps.forEach((snap, i) => {
      const currentStock = snap.data().stock ?? 0;
      tx.update(productRefs[i], { stock: currentStock - items[i].qty });
    });
  });

  return orderRef.id;
}

export function watchUserOrders(uid, callback, onError) {
  const q = query(col(), where("userId", "==", uid), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => { console.error("watchUserOrders:", err); if (onError) onError(err); });
}

export function watchAllOrders(callback, limitN = 100, onError) {
  const q = query(col(), orderBy("createdAt", "desc"), limit(limitN));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => { console.error("watchAllOrders:", err); if (onError) onError(err); });
}

export async function updateOrderStatus(orderId, status) {
  await updateDoc(doc(db, "orders", orderId), { status });
}

export async function getOrdersAggregate(status = null) {
  const q = status ? query(col(), where("status", "==", status)) : query(col());
  const snap = await getAggregateFromServer(q, {
    orderCount: countAgg(),
    revenue: sum("total"),
    avgCheck: average("total")
  });
  const d = snap.data();
  return { count: d.orderCount, revenue: d.revenue || 0, avgCheck: d.avgCheck || 0 };
}
