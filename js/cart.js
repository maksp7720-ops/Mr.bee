import { initHeader, initFooter, toast, openAuthModal, escapeHtml, formatPrice } from "./ui.js";
import { getCart, removeItem, setQty, clearCart } from "./cart-store.js";
import { getProfile, whenAuthReady } from "./auth.js";
import { createOrder, InsufficientStockError } from "./orders-service.js";

const FREE_SHIPPING_FROM = 3000;
const SHIPPING_FEE = 300;

const cartItemsEl = document.getElementById("cartItems");
const cartContent = document.getElementById("cartContent");
const cartEmpty = document.getElementById("cartEmpty");
const checkoutBtn = document.getElementById("checkoutBtn");
const checkoutHint = document.getElementById("checkoutHint");

function itemRowHTML(item) {
  const img = item.image
    ? `<img src="${escapeHtml(item.image)}" alt="" style="width:100%;height:100%;object-fit:cover" />`
    : `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--honey-dark)" stroke-width="1.5"><path d="M9 3h6M10 3v6l-6 10a1 1 0 0 0 1 1.5h14a1 1 0 0 0 1-1.5L14 9V3"/></svg>`;
  return `
    <div class="card" style="flex-direction:row;align-items:center;padding:14px;margin-bottom:12px;gap:16px" data-id="${item.productId}">
      <div class="card-img" style="width:76px;height:76px;flex-shrink:0;border-radius:var(--radius-s)">${img}</div>
      <div style="flex:1;min-width:0">
        <strong style="font-family:var(--font-display);font-size:1rem">${escapeHtml(item.name)}</strong>
        <div class="muted" style="font-size:1rem">${item.weight ? item.weight + " г · " : ""}${formatPrice(item.price)}</div>
      </div>
      <div class="qty-control">
        <button type="button" data-act="minus">−</button>
        <input value="${item.qty}" data-act="qty" inputmode="numeric" />
        <button type="button" data-act="plus">+</button>
      </div>
      <strong style="width:90px;text-align:right;font-family:var(--font-display)">${formatPrice(item.price * item.qty)}</strong>
      <button class="btn btn-ghost btn-sm" data-act="remove" aria-label="Удалить">✕</button>
    </div>`;
}

function render() {
  const items = getCart();
  if (!items.length) {
    cartContent.hidden = true;
    cartEmpty.hidden = false;
    return;
  }
  cartContent.hidden = false;
  cartEmpty.hidden = true;
  cartItemsEl.innerHTML = items.map(itemRowHTML).join("");

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = subtotal >= FREE_SHIPPING_FROM || subtotal === 0 ? 0 : SHIPPING_FEE;
  document.getElementById("cartSubtotal").textContent = formatPrice(subtotal);
  document.getElementById("cartShipping").textContent = shipping === 0 ? "Бесплатно" : formatPrice(shipping);
  document.getElementById("cartTotal").textContent = formatPrice(subtotal + shipping);
  document.getElementById("shippingHint").textContent = shipping > 0
    ? `Бесплатная доставка от ${formatPrice(FREE_SHIPPING_FROM)}`
    : "";

  cartItemsEl.querySelectorAll("[data-act='minus']").forEach(btn => btn.onclick = () => bump(btn, -1));
  cartItemsEl.querySelectorAll("[data-act='plus']").forEach(btn => btn.onclick = () => bump(btn, 1));
  cartItemsEl.querySelectorAll("[data-act='qty']").forEach(input => {
    input.onchange = () => {
      const id = input.closest("[data-id]").dataset.id;
      const val = Math.max(1, parseInt(input.value, 10) || 1);
      setQty(id, val);
      render();
    };
  });
  cartItemsEl.querySelectorAll("[data-act='remove']").forEach(btn => {
    btn.onclick = () => { removeItem(btn.closest("[data-id]").dataset.id); render(); };
  });
}

function bump(btn, delta) {
  const row = btn.closest("[data-id]");
  const id = row.dataset.id;
  const input = row.querySelector("[data-act='qty']");
  const val = Math.max(1, (parseInt(input.value, 10) || 1) + delta);
  setQty(id, val);
  render();
}

async function checkout() {
  await whenAuthReady();
  const profile = getProfile();
  if (!profile) {
    toast("Войдите, чтобы оформить заказ", "error");
    openAuthModal("login");
    return;
  }
  const name = document.getElementById("contactName").value.trim();
  const phone = document.getElementById("contactPhone").value.trim();
  const address = document.getElementById("contactAddress").value.trim();
  if (!name || !phone || !address) {
    checkoutHint.textContent = "Заполните имя, телефон и адрес.";
    checkoutHint.style.color = "var(--danger)";
    return;
  }

  const items = getCart();
  if (!items.length) return;
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;

  checkoutBtn.disabled = true;
  checkoutBtn.textContent = "Оформляем…";
  try {
    await createOrder(
      profile.uid,
      { name, phone, address },
      items.map(i => ({ productId: i.productId, name: i.name, price: i.price, qty: i.qty, image: i.image || "" })),
      subtotal + shipping
    );
    clearCart();
    toast("Заказ оформлен! Смотрите статус в личном кабинете.");
    window.location.href = "dashboard.html";
  } catch (err) {
    console.error(err);
    checkoutHint.textContent = err instanceof InsufficientStockError
      ? `${err.message}. Уменьшите количество в корзине и попробуйте снова.`
      : "Не удалось оформить заказ. Попробуйте ещё раз.";
    checkoutHint.style.color = "var(--danger)";
  } finally {
    checkoutBtn.disabled = false;
    checkoutBtn.textContent = "Оформить заказ";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initHeader();
  initFooter();
  render();
  checkoutBtn.onclick = checkout;
  window.addEventListener("cart:changed", render);
});
