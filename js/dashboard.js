import { initHeader, initFooter, toast, showConfirm, openAuthModal, escapeHtml, formatPrice, formatDate, starString } from "./ui.js";
import { getProfile, whenAuthReady, updateOwnProfile, changeOwnPassword, authErrorMessage } from "./auth.js";
import { watchUserOrders, STATUSES } from "./orders-service.js";
import { watchUserReviews, deleteReview } from "./reviews-service.js";

const authGate = document.getElementById("authGate");
const dashboardContent = document.getElementById("dashboardContent");
const greeting = document.getElementById("greeting");
const ordersList = document.getElementById("ordersList");
const myReviewsList = document.getElementById("myReviewsList");

const indexHint = 'Проверьте, что в проект загружены свежие firestore.rules и firestore.indexes.json — см. README, §9.';

function orderCardHTML(order) {
  const items = (order.items || []).map(i => `
    <div style="display:flex;justify-content:space-between;font-size:1rem;margin-bottom:6px">
      <span>${escapeHtml(i.name)} × ${i.qty}</span><span>${formatPrice(i.price * i.qty)}</span>
    </div>`).join("");
  return `
    <div class="card" style="padding:20px;margin-bottom:14px;display:block">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div>
          <strong>Заказ №${order.id.slice(0, 6).toUpperCase()}</strong>
          <div class="muted" style="font-size:1rem">${formatDate(order.createdAt)}</div>
        </div>
        <span class="status-pill status-${order.status}">${STATUSES[order.status] || order.status}</span>
      </div>
      <hr class="divider" style="margin:14px 0" />
      ${items}
      <div style="display:flex;justify-content:space-between;font-weight:700;margin-top:10px;font-family:var(--font-display)">
        <span>Итого</span><span>${formatPrice(order.total)}</span>
      </div>
    </div>`;
}

let unsubOrders = null;
let unsubReviews = null;

function watchOrders(uid) {
  ordersList.innerHTML = `<div class="skeleton" style="height:120px;margin-bottom:14px"></div>`;
  if (unsubOrders) unsubOrders();
  unsubOrders = watchUserOrders(uid, (orders) => {
    ordersList.innerHTML = orders.length
      ? orders.map(orderCardHTML).join("")
      : `<div class="empty-state"><h3>Заказов пока нет</h3><p class="mt-0"><a href="index.html">Перейти в каталог</a></p></div>`;
  }, (err) => {
    ordersList.innerHTML = `<p class="muted">Не удалось загрузить заказы (${err.code || err.message}). ${indexHint}</p>`;
  });
}

function reviewRowHTML(r) {
  return `
    <div class="card" style="padding:16px;margin-bottom:12px;display:block" data-id="${r.id}" data-product="${r.productId}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
        <div>
          <a href="product.html?id=${r.productId}" style="font-family:var(--font-display);font-weight:600;text-decoration:none;color:var(--bark)">${escapeHtml(r.productName || "Товар")}</a>
          <div class="stars" style="margin-top:4px">${starString(r.rating)}</div>
        </div>
        <div style="display:flex;gap:6px">
          <a class="btn btn-ghost btn-sm" href="product.html?id=${r.productId}">Изменить</a>
          <button class="btn btn-ghost btn-sm" data-act="delete">Удалить</button>
        </div>
      </div>
      <p style="margin:10px 0 0">${escapeHtml(r.text)}</p>
    </div>`;
}

function watchReviews(uid) {
  myReviewsList.innerHTML = `<div class="skeleton" style="height:90px;margin-bottom:12px"></div>`;
  if (unsubReviews) unsubReviews();
  unsubReviews = watchUserReviews(uid, (reviews) => {
    myReviewsList.innerHTML = reviews.length
      ? reviews.map(reviewRowHTML).join("")
      : `<div class="empty-state"><h3>Отзывов пока нет</h3><p class="mt-0">Купите мёд и поделитесь впечатлением на странице товара.</p></div>`;

    myReviewsList.querySelectorAll("[data-act='delete']").forEach(btn => {
      btn.onclick = async () => {
        const card = btn.closest("[data-id]");
        const ok = await showConfirm("Удалить этот отзыв?");
        if (!ok) return;
        try {
          await deleteReview(card.dataset.id, card.dataset.product);
          toast("Отзыв удалён");
        } catch (err) {
          console.error(err);
          toast("Не удалось удалить отзыв", "error");
        }
      };
    });
  }, (err) => {
    myReviewsList.innerHTML = `<p class="muted">Не удалось загрузить отзывы (${err.code || err.message}). ${indexHint}</p>`;
  });
}

function wireTabs() {
  document.querySelectorAll(".tab-nav button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tab-nav button").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    };
  });
}

function wireProfileForms(profile) {
  document.getElementById("profileName").value = profile.name || "";
  document.getElementById("profileEmail").value = profile.email || "";
  document.getElementById("profilePhone").value = profile.phone || "";

  document.getElementById("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById("profileName").value.trim();
    const phone = document.getElementById("profilePhone").value.trim();
    try {
      await updateOwnProfile({ name, phone });
      greeting.textContent = `Здравствуйте, ${name}!`;
      toast("Профиль обновлён");
    } catch (err) {
      console.error(err);
      toast("Не удалось сохранить изменения", "error");
    }
  };

  document.getElementById("passwordForm").onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("passwordError");
    errEl.hidden = true;
    const oldPassword = document.getElementById("oldPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    try {
      await changeOwnPassword(oldPassword, newPassword);
      toast("Пароль изменён");
      e.target.reset();
    } catch (err) {
      errEl.textContent = authErrorMessage(err);
      errEl.hidden = false;
    }
  };
}

async function boot() {
  const profile = await whenAuthReady();
  if (!profile) {
    authGate.hidden = false;
    dashboardContent.hidden = true;
    document.getElementById("gateLoginBtn").onclick = () => openAuthModal("login");
    return;
  }
  authGate.hidden = true;
  dashboardContent.hidden = false;
  greeting.textContent = `Здравствуйте, ${profile.name || profile.email}!`;
  wireTabs();
  wireProfileForms(profile);
  watchOrders(profile.uid);
  watchReviews(profile.uid);
}

document.addEventListener("DOMContentLoaded", () => {
  initHeader();
  initFooter();
  boot();
});
