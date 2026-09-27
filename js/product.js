import { initHeader, initFooter, toast, showConfirm, openAuthModal, escapeHtml, formatPrice, formatDate, starString, productCardHTML } from "./ui.js";
import { getProduct, watchProduct, getRelatedProducts } from "./products-service.js";
import { watchProductReviews, addReview, updateReview, deleteReview } from "./reviews-service.js";
import { addItem } from "./cart-store.js";
import { getProfile, whenAuthReady } from "./auth.js";

const productId = new URLSearchParams(window.location.search).get("id");
const productWrap = document.getElementById("productWrap");
const reviewsHead = document.getElementById("reviewsHead");
const reviewFormWrap = document.getElementById("reviewForm");
const reviewsList = document.getElementById("reviewsList");
const relatedGrid = document.getElementById("relatedGrid");

let product = null;
let currentReviews = [];
let editingOwnReview = false;
let qty = 1;

function renderNotFound() {
  productWrap.innerHTML = `
    <div class="empty-state">
      <h3>Товар не найден</h3>
      <p class="mt-0">Возможно, он был удалён. <a href="index.html">Вернуться в каталог</a></p>
    </div>`;
}

function stockText(stock) {
  if (stock <= 0) return "Нет в наличии";
  if (stock <= 5) return `Осталось ${stock} шт.`;
  return "Есть в наличии";
}

function ratingBlockHTML() {
  return `<span class="stars">${starString(product.rating)}</span>
    ${product.reviewsCount ? `${(product.rating || 0).toFixed(1)} · ${product.reviewsCount} отзывов` : "пока нет отзывов"}`;
}

function renderProduct() {
  const img = product.image
    ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" style="width:100%;height:100%;object-fit:cover" />`
    : `<svg width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="var(--honey-dark)" stroke-width="1.3"><path d="M9 3h6M10 3v6l-6 10a1 1 0 0 0 1 1.5h14a1 1 0 0 0 1-1.5L14 9V3"/></svg>`;
  const tags = (product.tags || []).map(t => `<span class="chip" style="cursor:default">${escapeHtml(t)}</span>`).join("");
  const stock = product.stock ?? 0;
  const inStock = stock > 0;

  productWrap.innerHTML = `
    <div class="grid product-detail-grid">
      <div class="card-img" style="border-radius:var(--radius-m);aspect-ratio:1/1;display:flex;align-items:center;justify-content:center">${img}</div>
      <div>
        <span class="card-cat">${escapeHtml(product.category || "")}</span>
        <h1 style="margin-top:6px">${escapeHtml(product.name)}</h1>
        <div class="card-rating" id="ratingBlock" style="font-size:1rem;margin-bottom:14px">${ratingBlockHTML()}</div>
        <p>${escapeHtml(product.description || "")}</p>
        ${tags ? `<div class="chip-group" style="margin:16px 0">${tags}</div>` : ""}
        <div style="font-family:var(--font-display);font-size:1.9rem;font-weight:700;margin:18px 0 4px">
          ${formatPrice(product.price)} <span style="font-size:1rem;font-weight:400;color:var(--bark-soft);font-family:var(--font-body)">/ ${product.weight} г</span>
        </div>
        <p class="muted" id="stockText" style="font-size:1rem">${stockText(stock)}</p>
        <div style="display:flex;align-items:center;gap:16px;margin-top:18px;flex-wrap:wrap">
          <div class="qty-control">
            <button type="button" id="qtyMinus" aria-label="Меньше">−</button>
            <input id="qtyInput" value="1" inputmode="numeric" aria-label="Количество" />
            <button type="button" id="qtyPlus" aria-label="Больше">+</button>
          </div>
          <button class="btn btn-primary" id="addToCartBtn" ${inStock ? "" : "disabled"}>Добавить в корзину</button>
        </div>
      </div>
    </div>`;

  const maxQty = () => Math.max(1, product.stock ?? 1);
  document.getElementById("qtyMinus").onclick = () => { qty = Math.max(1, qty - 1); document.getElementById("qtyInput").value = qty; };
  document.getElementById("qtyPlus").onclick = () => { qty = Math.min(maxQty(), qty + 1); document.getElementById("qtyInput").value = qty; };
  document.getElementById("qtyInput").onchange = (e) => {
    qty = Math.min(maxQty(), Math.max(1, parseInt(e.target.value, 10) || 1));
    e.target.value = qty;
  };
  document.getElementById("addToCartBtn").onclick = () => {
    addItem(product, qty);
    toast(`«${product.name}» добавлен в корзину`);
  };

  document.title = `${product.name} — Mr.Bee`;
}

function updateProductHead() {
  const ratingBlock = document.getElementById("ratingBlock");
  if (ratingBlock) ratingBlock.innerHTML = ratingBlockHTML();
  const stockEl = document.getElementById("stockText");
  if (stockEl) stockEl.textContent = stockText(product.stock ?? 0);
  const addBtn = document.getElementById("addToCartBtn");
  if (addBtn) addBtn.disabled = (product.stock ?? 0) <= 0;
  reviewsHead.innerHTML = reviewsHeadHTML();
}

function reviewsHeadHTML() {
  return `<h2>Отзывы ${product.reviewsCount ? `(${product.reviewsCount})` : ""}</h2>`;
}

/* ------------------------------- reviews list ------------------------------- */

function reviewCardHTML(r, ownerUid) {
  const mine = ownerUid && r.userId === ownerUid;
  return `
    <div class="card" style="padding:18px;flex-direction:row;gap:0" data-review-id="${r.id}">
      <div style="width:100%">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
          <div>
            <div class="stars">${starString(r.rating)}</div>
            <strong style="font-size:1rem">${escapeHtml(r.userName || "Покупатель")}</strong>
            <span class="muted" style="font-size:1rem;margin-left:8px">${formatDate(r.createdAt)}</span>
          </div>
          ${mine ? `
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm" data-act="edit">Изменить</button>
              <button class="btn btn-ghost btn-sm" data-act="delete">Удалить</button>
            </div>` : ""}
        </div>
        <p style="margin:10px 0 0">${escapeHtml(r.text)}</p>
      </div>
    </div>`;
}

function renderReviewsList() {
  const profile = getProfile();
  reviewsList.innerHTML = currentReviews.length
    ? currentReviews.map(r => reviewCardHTML(r, profile?.uid)).join("")
    : `<p class="muted">Отзывов пока нет — станьте первым.</p>`;

  reviewsList.querySelectorAll("[data-act='delete']").forEach(btn => {
    btn.onclick = async () => {
      const card = btn.closest("[data-review-id]");
      const ok = await showConfirm("Удалить ваш отзыв?");
      if (!ok) return;
      try {
        await deleteReview(card.dataset.reviewId, productId);
        editingOwnReview = false;
        toast("Отзыв удалён");
      } catch (err) {
        console.error("delete review:", err);
        toast("Не удалось удалить отзыв", "error");
      }
    };
  });
  reviewsList.querySelectorAll("[data-act='edit']").forEach(btn => {
    btn.onclick = () => {
      editingOwnReview = true;
      renderReviewFormArea();
      window.scrollTo({ top: reviewFormWrap.offsetTop - 100, behavior: "smooth" });
    };
  });
}

/* ------------------------------- review form ------------------------------- */

function starPicker(name, initial = 5) {
  return `<div class="stars" id="${name}" data-value="${initial}" style="font-size:1.6rem;cursor:pointer">
    ${[1,2,3,4,5].map(n => `<span data-star="${n}">${n <= initial ? "★" : "☆"}</span>`).join("")}
  </div>`;
}

function wireStarPicker(el) {
  el.querySelectorAll("[data-star]").forEach(star => {
    star.onclick = () => {
      const val = parseInt(star.dataset.star, 10);
      el.dataset.value = val;
      el.querySelectorAll("[data-star]").forEach(s => {
        s.textContent = parseInt(s.dataset.star, 10) <= val ? "★" : "☆";
      });
    };
  });
}

async function renderReviewFormArea() {
  await whenAuthReady();
  const profile = getProfile();

  if (!profile) {
    reviewFormWrap.innerHTML = `
      <div class="empty-state" style="padding:28px;border:1px solid var(--line);border-radius:var(--radius-m);background:var(--white)">
        <p class="mt-0">Войдите, чтобы оставить отзыв.</p>
        <button class="btn btn-outline" id="reviewLoginBtn">Войти</button>
      </div>`;
    document.getElementById("reviewLoginBtn").onclick = () => openAuthModal("login");
    return;
  }

  const existing = currentReviews.find(r => r.userId === profile.uid) || null;

  if (existing && !editingOwnReview) {
    reviewFormWrap.innerHTML = "";
    return;
  }

  reviewFormWrap.innerHTML = `
    <div style="padding:22px;border:1px solid var(--line);border-radius:var(--radius-m);background:var(--white)">
      <h3 style="margin-top:0">${existing ? "Изменить отзыв" : "Оставить отзыв"}</h3>
      ${starPicker("ratingPicker", existing ? existing.rating : 5)}
      <div class="field" style="margin-top:12px">
        <textarea id="reviewText" placeholder="Расскажите про вкус, аромат, густоту…">${existing ? escapeHtml(existing.text) : ""}</textarea>
      </div>
      <div class="field-error" id="reviewFormError" hidden></div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" id="submitReviewBtn">${existing ? "Сохранить изменения" : "Опубликовать отзыв"}</button>
        ${existing ? `<button class="btn btn-outline" id="cancelReviewEditBtn" type="button">Отмена</button>` : ""}
      </div>
    </div>`;

  const picker = document.getElementById("ratingPicker");
  wireStarPicker(picker);

  if (existing) {
    document.getElementById("cancelReviewEditBtn").onclick = () => {
      editingOwnReview = false;
      renderReviewFormArea();
    };
  }

  document.getElementById("submitReviewBtn").onclick = async () => {
    const errEl = document.getElementById("reviewFormError");
    errEl.hidden = true;
    const rating = parseInt(picker.dataset.value, 10);
    const text = document.getElementById("reviewText").value.trim();
    if (!text) { toast("Добавьте текст отзыва", "error"); return; }

    const btn = document.getElementById("submitReviewBtn");
    btn.disabled = true;
    try {
      if (existing) {
        await updateReview(existing.id, productId, { rating, text });
        toast("Отзыв обновлён");
      } else {
        await addReview(productId, product.name, profile.uid, profile.name || profile.email, rating, text);
        toast("Спасибо за отзыв!");
      }
      editingOwnReview = false;
      renderReviewFormArea();
    } catch (err) {
      console.error("submit review:", err);
      btn.disabled = false;
      errEl.textContent = `Не удалось сохранить отзыв (${err.code || err.message || "неизвестная ошибка"}). Проверьте, что вы вошли в аккаунт и что в проект загружены firestore.rules и firestore.indexes.json.`;
      errEl.hidden = false;
    }
  };
}

/* ------------------------------- boot ------------------------------- */

document.addEventListener("DOMContentLoaded", async () => {
  initHeader();
  initFooter();

  if (!productId) { renderNotFound(); return; }
  try {
    product = await getProduct(productId);
  } catch (err) {
    console.error("getProduct:", err);
  }
  if (!product) { renderNotFound(); return; }

  renderProduct();
  reviewsHead.innerHTML = reviewsHeadHTML();

  watchProduct(productId, (fresh) => {
    if (!fresh) return; 
    product = fresh;
    updateProductHead();
  }, (err) => {
    const stockEl = document.getElementById("stockText");
    if (stockEl) stockEl.textContent = `Не удалось обновить данные (${err.code || err.message})`;
  });

  await whenAuthReady();
  watchProductReviews(productId, (reviews) => {
    currentReviews = reviews;
    renderReviewsList();
    renderReviewFormArea();
  }, 200, (err) => {
    reviewsList.innerHTML = `<p class="muted">Не удалось загрузить отзывы (${err.code || err.message}). Проверьте, что в проект загружены firestore.rules и firestore.indexes.json — см. README, §9.</p>`;
  });

  try {
    const related = await getRelatedProducts(product, 4);
    relatedGrid.innerHTML = related.map(productCardHTML).join("") || `<p class="muted">Похожих товаров пока нет.</p>`;
  } catch (err) {
    console.error("getRelatedProducts:", err);
    relatedGrid.innerHTML = `<p class="muted">Не удалось загрузить похожие товары.</p>`;
  }
});
