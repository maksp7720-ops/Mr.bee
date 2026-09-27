const KEY = "honeyShopCart";

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function write(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("cart:changed", { detail: items }));
}

export function getCart() {
  return read();
}

export function addItem(product, qty = 1) {
  const items = read();
  const existing = items.find(i => i.productId === product.id);
  if (existing) {
    existing.qty += qty;
  } else {
    items.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.image || "",
      weight: product.weight || null,
      qty
    });
  }
  write(items);
}

export function removeItem(productId) {
  write(read().filter(i => i.productId !== productId));
}

export function setQty(productId, qty) {
  const items = read();
  const item = items.find(i => i.productId === productId);
  if (!item) return;
  if (qty <= 0) {
    write(items.filter(i => i.productId !== productId));
  } else {
    item.qty = qty;
    write(items);
  }
}

export function clearCart() {
  write([]);
}

export function cartCount() {
  return read().reduce((sum, i) => sum + i.qty, 0);
}

export function cartTotal() {
  return read().reduce((sum, i) => sum + i.qty * i.price, 0);
}
