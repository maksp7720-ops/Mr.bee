import { initHeader, toast, showConfirm, openAuthModal, escapeHtml, formatPrice, formatDate, starString } from "./ui.js";
import { whenAuthReady } from "./auth.js";
import { CATEGORIES, TAGS, queryProducts, countProducts, createProduct, updateProduct, deleteProduct } from "./products-service.js";
import { watchAllOrders, updateOrderStatus, getOrdersAggregate, STATUSES } from "./orders-service.js";
import { queryUsers, countUsers, setUserRole } from "./users-service.js";
import { getAllReviews, adminDeleteReview, recalcAllProductRatings } from "./reviews-service.js";

const authGate = document.getElementById("authGate");
const gateMessage = document.getElementById("gateMessage");
const gateLoginBtn = document.getElementById("gateLoginBtn");
const adminContent = document.getElementById("adminContent");

let productsCursor = null;
let usersCursor = null;
let moderationCursor = null;
let currentUid = null;
let unsubOrders = null;
let latestOrders = [];

const modalRoot = () => document.getElementById("modalRoot");
const closeModal = () => { modalRoot().innerHTML = ""; };

/* ------------------------------ products ------------------------------ */

function productRowHTML(p) {
  return `
    <tr data-id="${p.id}">
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>${escapeHtml(p.category || "")}</td>
      <td>${formatPrice(p.price)}</td>
      <td>${p.stock ?? 0}</td>
      <td>${starString(p.rating)} <span class="muted">(${p.reviewsCount || 0})</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" data-act="edit">Изменить</button>
        <button class="btn btn-ghost btn-sm" data-act="delete">Удалить</button>
      </td>
    </tr>`;
}

let productsOnPage = [];

async function loadProducts(reset) {
  const tbody = document.getElementById("productsBody");
  const moreBtn = document.getElementById("loadMoreProductsBtn");
  if (reset) { productsCursor = null; productsOnPage = []; tbody.innerHTML = `<tr><td colspan="6"><div class="skeleton" style="height:20px"></div></td></tr>`; }
  try {
    const { items, lastDoc, hasMore } = await queryProducts({ sortBy: "createdAt", sortDir: "desc", cursor: productsCursor });
    productsCursor = lastDoc;
    productsOnPage = reset ? items : [...productsOnPage, ...items];
    if (reset) tbody.innerHTML = "";
    tbody.insertAdjacentHTML("beforeend", items.map(productRowHTML).join("") ||
      (reset ? `<tr><td colspan="6" class="muted">Товаров пока нет — добавьте первый.</td></tr>` : ""));
    moreBtn.hidden = !hasMore;

    tbody.querySelectorAll("[data-act='edit']").forEach(btn => {
      btn.onclick = () => openProductModal(productsOnPage.find(p => p.id === btn.closest("tr").dataset.id));
    });
    tbody.querySelectorAll("[data-act='delete']").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.closest("tr").dataset.id;
        const ok = await showConfirm("Удалить этот товар из каталога?");
        if (!ok) return;
        await deleteProduct(id);
        toast("Товар удалён");
        loadProducts(true);
        refreshProductAndUserCounts();
      };
    });

    if (reset) {
      const count = await countProducts();
      document.getElementById("productsCount").textContent = `Всего: ${count}`;
    }
  } catch (err) {
    console.error(err);
    if (reset) tbody.innerHTML = `<tr><td colspan="6" class="muted">Не удалось загрузить товары.</td></tr>`;
  }
}

function openProductModal(product = null) {
  const isEdit = !!product;
  const selectedTags = new Set(product?.tags || []);
  modalRoot().innerHTML = `
    <div class="modal-overlay" id="productOverlay">
      <div class="modal modal-lg">
        <button class="modal-close" id="productModalClose" aria-label="Закрыть">×</button>
        <h3 class="mt-0">${isEdit ? "Редактировать товар" : "Новый товар"}</h3>
        <form id="productForm">
          <div class="form-row">
            <div class="field"><label for="pName">Название</label><input id="pName" required value="${escapeHtml(product?.name || "")}" /></div>
            <div class="field"><label for="pCategory">Категория</label>
              <select id="pCategory">${CATEGORIES.map(c => `<option ${product?.category === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}</select>
            </div>
          </div>
          <div class="field"><label for="pDescription">Описание</label><textarea id="pDescription">${escapeHtml(product?.description || "")}</textarea></div>
          <div class="form-row">
            <div class="field"><label for="pPrice">Цена, ₸</label><input id="pPrice" type="number" min="0" required value="${product?.price ?? ""}" /></div>
            <div class="field"><label for="pWeight">Вес, г</label><input id="pWeight" type="number" min="0" required value="${product?.weight ?? ""}" /></div>
            <div class="field"><label for="pStock">Остаток, шт</label><input id="pStock" type="number" min="0" required value="${product?.stock ?? 10}" /></div>
          </div>
          <div class="field"><label for="pImage">Ссылка на изображение (необязательно)</label><input id="pImage" value="${escapeHtml(product?.image || "")}" placeholder="https://…" /></div>
          <div class="field">
            <label>Особенности</label>
            <div class="chip-group" id="pTags">${TAGS.map(t => `<button type="button" class="chip ${selectedTags.has(t) ? "active" : ""}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("")}</div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
            <button type="button" class="btn btn-outline" id="productCancelBtn">Отмена</button>
            <button type="submit" class="btn btn-primary">${isEdit ? "Сохранить" : "Создать"}</button>
          </div>
        </form>
      </div>
    </div>`;

  modalRoot().querySelectorAll("#pTags .chip").forEach(chip => {
    chip.onclick = () => {
      chip.classList.toggle("active");
      const t = chip.dataset.tag;
      chip.classList.contains("active") ? selectedTags.add(t) : selectedTags.delete(t);
    };
  });
  document.getElementById("productModalClose").onclick = closeModal;
  document.getElementById("productCancelBtn").onclick = closeModal;
  document.getElementById("productOverlay").addEventListener("click", (e) => { if (e.target.id === "productOverlay") closeModal(); });

  document.getElementById("productForm").onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById("pName").value.trim(),
      category: document.getElementById("pCategory").value,
      description: document.getElementById("pDescription").value.trim(),
      price: Number(document.getElementById("pPrice").value),
      weight: Number(document.getElementById("pWeight").value),
      stock: Number(document.getElementById("pStock").value),
      image: document.getElementById("pImage").value.trim(),
      tags: [...selectedTags]
    };
    try {
      if (isEdit) { await updateProduct(product.id, data); toast("Товар обновлён"); }
      else { await createProduct(data); toast("Товар добавлен"); }
      closeModal();
      loadProducts(true);
      refreshProductAndUserCounts();
    } catch (err) {
      console.error(err);
      toast("Не удалось сохранить товар", "error");
    }
  };
}

async function recalcRatings() {
  const btn = document.getElementById("recalcRatingsBtn");
  btn.disabled = true;
  btn.textContent = "Пересчитываем…";
  try {
    const n = await recalcAllProductRatings();
    toast(`Рейтинги пересчитаны для ${n} товаров`);
    loadProducts(true);
  } catch (err) {
    console.error(err);
    toast("Не удалось пересчитать рейтинги", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Пересчитать рейтинги";
  }
}

/* ------------------------------- orders -------------------------------- */

function itemsSummary(items) {
  if (!items || !items.length) return "—";
  return items.map(i => `${i.name} ×${i.qty}`).join(", ");
}

function orderRowHTML(o) {
  const options = Object.entries(STATUSES).map(([key, label]) =>
    `<option value="${key}" ${o.status === key ? "selected" : ""}>${label}</option>`).join("");
  const summary = itemsSummary(o.items);
  const address = o.contact?.address || "—";
  return `
    <tr data-id="${o.id}">
      <td>${o.id.slice(0, 6).toUpperCase()}<div class="muted" style="font-size:1rem">${formatDate(o.createdAt)}</div></td>
      <td>${escapeHtml(o.contact?.name || "—")}<div class="muted" style="font-size:1rem">${escapeHtml(o.contact?.phone || "")}</div></td>
      <td><span title="${escapeHtml(address)}" style="display:block;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(address)}</span></td>
      <td><span title="${escapeHtml(summary)}" style="display:block;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(summary)}</span></td>
      <td>${formatPrice(o.total)}</td>
      <td><select data-act="status">${options}</select></td>
      <td><button class="btn btn-ghost btn-sm" data-act="details">Подробнее</button></td>
    </tr>`;
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById("ordersBody");
  tbody.innerHTML = orders.map(orderRowHTML).join("") ||
    `<tr><td colspan="7" class="muted">Заказов пока нет.</td></tr>`;

  tbody.querySelectorAll("[data-act='status']").forEach(sel => {
    sel.onchange = async () => {
      const id = sel.closest("tr").dataset.id;
      try {
        await updateOrderStatus(id, sel.value);
        toast("Статус заказа обновлён");
      } catch (err) {
        console.error(err);
        toast("Не удалось обновить статус", "error");
      }
    };
  });
  tbody.querySelectorAll("[data-act='details']").forEach(btn => {
    btn.onclick = () => {
      const order = latestOrders.find(o => o.id === btn.closest("tr").dataset.id);
      if (order) openOrderDetailsModal(order);
    };
  });
}

function openOrderDetailsModal(order) {
  const rows = (order.items || []).map(i => `
    <tr><td>${escapeHtml(i.name)}</td><td>${i.qty}</td><td>${formatPrice(i.price)}</td><td>${formatPrice(i.price * i.qty)}</td></tr>`).join("");
  const options = Object.entries(STATUSES).map(([key, label]) =>
    `<option value="${key}" ${order.status === key ? "selected" : ""}>${label}</option>`).join("");

  modalRoot().innerHTML = `
    <div class="modal-overlay" id="orderOverlay">
      <div class="modal modal-lg">
        <button class="modal-close" id="orderModalClose" aria-label="Закрыть">×</button>
        <h3 class="mt-0">Заказ №${order.id.slice(0, 6).toUpperCase()}</h3>
        <p class="muted" style="margin-top:-10px">${formatDate(order.createdAt)}</p>
        <div class="form-row">
          <div>
            <strong>Получатель</strong>
            <p class="mt-0">${escapeHtml(order.contact?.name || "—")}<br />${escapeHtml(order.contact?.phone || "—")}</p>
          </div>
          <div>
            <strong>Адрес доставки</strong>
            <p class="mt-0">${escapeHtml(order.contact?.address || "—")}</p>
          </div>
        </div>
        <hr class="divider" />
        <strong>Состав заказа</strong>
        <div class="table-wrap" style="margin-top:10px">
          <table>
            <thead><tr><th>Товар</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:14px;font-family:var(--font-display);font-weight:700;font-size:1.1rem">
          <span>Итого</span><span>${formatPrice(order.total)}</span>
        </div>
        <hr class="divider" />
        <div class="field" style="margin-bottom:0">
          <label for="orderModalStatus">Статус заказа</label>
          <select id="orderModalStatus">${options}</select>
        </div>
      </div>
    </div>`;

  document.getElementById("orderModalClose").onclick = closeModal;
  document.getElementById("orderOverlay").addEventListener("click", (e) => { if (e.target.id === "orderOverlay") closeModal(); });
  document.getElementById("orderModalStatus").onchange = async (e) => {
    try {
      await updateOrderStatus(order.id, e.target.value);
      toast("Статус заказа обновлён");
    } catch (err) {
      console.error(err);
      toast("Не удалось обновить статус", "error");
    }
  };
}

const indexHint = 'Проверьте, что в проект загружены свежие firestore.rules и firestore.indexes.json — см. README, §9.';

function watchOrders() {
  document.getElementById("ordersBody").innerHTML = `<tr><td colspan="7"><div class="skeleton" style="height:20px"></div></td></tr>`;
  if (unsubOrders) unsubOrders();
  unsubOrders = watchAllOrders((orders) => {
    latestOrders = orders;
    renderOrdersTable(orders);
  }, 100, (err) => {
    document.getElementById("ordersBody").innerHTML =
      `<tr><td colspan="7" class="muted">Не удалось загрузить заказы (${err.code || err.message}). ${indexHint}</td></tr>`;
  });
}

/* -------------------------------- users --------------------------------- */

let usersOnPage = [];

function userRowHTML(u) {
  const isAdmin = u.role === "admin";
  return `
    <tr data-id="${u.id}">
      <td>${escapeHtml(u.name || "—")}</td>
      <td>${escapeHtml(u.email || "—")}</td>
      <td><span class="status-pill ${isAdmin ? "status-completed" : "status-new"}">${isAdmin ? "admin" : "user"}</span></td>
      <td><button class="btn btn-outline btn-sm" data-act="toggle">${isAdmin ? "Забрать права" : "Сделать админом"}</button></td>
    </tr>`;
}

async function loadUsers(reset) {
  const tbody = document.getElementById("usersBody");
  const moreBtn = document.getElementById("loadMoreUsersBtn");
  if (reset) { usersCursor = null; usersOnPage = []; tbody.innerHTML = `<tr><td colspan="4"><div class="skeleton" style="height:20px"></div></td></tr>`; }
  try {
    const { items, lastDoc, hasMore } = await queryUsers({ cursor: usersCursor });
    usersCursor = lastDoc;
    usersOnPage = reset ? items : [...usersOnPage, ...items];
    if (reset) tbody.innerHTML = "";
    tbody.insertAdjacentHTML("beforeend", items.map(userRowHTML).join("") ||
      (reset ? `<tr><td colspan="4" class="muted">Пользователей пока нет.</td></tr>` : ""));
    moreBtn.hidden = !hasMore;

    tbody.querySelectorAll("[data-act='toggle']").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.closest("tr").dataset.id;
        const user = usersOnPage.find(u => u.id === id);
        const nextRole = user.role === "admin" ? "user" : "admin";
        if (id === currentUid && nextRole === "user") {
          const ok = await showConfirm("Вы лишитесь доступа к админ-панели после выхода. Продолжить?", "Забрать права");
          if (!ok) return;
        }
        await setUserRole(id, nextRole);
        toast(nextRole === "admin" ? "Права администратора выданы" : "Права администратора отозваны");
        loadUsers(true);
      };
    });
  } catch (err) {
    console.error(err);
    if (reset) tbody.innerHTML = `<tr><td colspan="4" class="muted">Не удалось загрузить пользователей.</td></tr>`;
  }
}

/* ----------------------------- moderation -------------------------------- */

function moderationRowHTML(r) {
  return `
    <div class="card" style="padding:16px;margin-bottom:12px;display:block" data-id="${r.id}" data-product="${r.productId}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
        <div>
          <a href="product.html?id=${r.productId}" target="_blank" style="font-family:var(--font-display);font-weight:600;text-decoration:none;color:var(--bark)">${escapeHtml(r.productName || "Товар")}</a>
          <div class="stars" style="margin-top:4px">${starString(r.rating)} <span class="muted" style="font-size:1rem">${escapeHtml(r.userName || "")} · ${formatDate(r.createdAt)}</span></div>
        </div>
        <button class="btn btn-danger btn-sm" data-act="delete">Удалить</button>
      </div>
      <p style="margin:10px 0 0">${escapeHtml(r.text)}</p>
    </div>`;
}

async function loadModeration(reset) {
  const list = document.getElementById("moderationList");
  const moreBtn = document.getElementById("loadMoreModerationBtn");
  if (reset) { moderationCursor = null; list.innerHTML = `<div class="skeleton" style="height:80px;margin-bottom:12px"></div>`; }
  try {
    const { items, lastDoc, hasMore } = await getAllReviews(moderationCursor);
    if (reset) list.innerHTML = "";
    list.insertAdjacentHTML("beforeend", items.map(moderationRowHTML).join("") ||
      (reset ? `<p class="muted">Отзывов пока нет.</p>` : ""));
    moderationCursor = lastDoc;
    moreBtn.hidden = !hasMore;
    list.querySelectorAll("[data-act='delete']").forEach(btn => {
      btn.onclick = async () => {
        const card = btn.closest("[data-id]");
        const ok = await showConfirm("Удалить этот отзыв? Действие нельзя отменить.");
        if (!ok) return;
        await adminDeleteReview(card.dataset.id, card.dataset.product);
        card.remove();
        toast("Отзыв удалён");
      };
    });
  } catch (err) {
    console.error(err);
    if (reset) list.innerHTML = `<p class="muted">Не удалось загрузить отзывы.</p>`;
  }
}

/* -------------------------------- stats ---------------------------------- */
async function safeStat(fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.warn("stat query failed, using fallback:", err);
    return fallback;
  }
}

async function loadStats() {
  const grid = document.getElementById("statGrid");
  grid.innerHTML = Array.from({ length: 6 }).map(() => `<div class="stat-card"><div class="skeleton" style="height:28px;width:70%"></div></div>`).join("");

  const fallbackRevenue = latestOrders.reduce((s, o) => s + (o.total || 0), 0);
  const fallbackCompleted = latestOrders.filter(o => o.status === "completed");
  const fallbackCompletedRevenue = fallbackCompleted.reduce((s, o) => s + (o.total || 0), 0);
  const fallbackAvg = latestOrders.length ? fallbackRevenue / latestOrders.length : 0;

  const [productCount, userCount, all, completed] = await Promise.all([
    safeStat(() => countProducts(), null),
    safeStat(() => countUsers(), null),
    safeStat(() => getOrdersAggregate(), { count: latestOrders.length, revenue: fallbackRevenue, avgCheck: fallbackAvg }),
    safeStat(() => getOrdersAggregate("completed"), { count: fallbackCompleted.length, revenue: fallbackCompletedRevenue })
  ]);

  const cards = [
    ["Товаров в каталоге", productCount === null ? "—" : productCount],
    ["Пользователей", userCount === null ? "—" : userCount],
    ["Всего заказов", all.count],
    ["Выручка (все заказы)", formatPrice(all.revenue)],
    ["Выручка (выполненные)", formatPrice(completed.revenue)],
    ["Средний чек", formatPrice(Math.round(all.avgCheck || 0))]
  ];
  grid.innerHTML = cards.map(([label, value]) => `<div class="stat-card"><strong>${value}</strong><span>${label}</span></div>`).join("");
}

function refreshProductAndUserCounts() {
  if (document.getElementById("tab-stats").classList.contains("active")) loadStats();
}

/* --------------------------------- tabs ----------------------------------- */

function wireTabs() {
  document.querySelectorAll(".tab-nav button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tab-nav button").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
      if (btn.dataset.tab === "stats") loadStats();
    };
  });
}

/* --------------------------------- boot ------------------------------------ */

async function boot() {
  const profile = await whenAuthReady();
  if (!profile || profile.role !== "admin") {
    authGate.hidden = false;
    adminContent.hidden = true;
    if (profile) {
      gateMessage.textContent = "У вашей учётной записи нет прав администратора.";
      gateLoginBtn.hidden = true;
    } else {
      gateMessage.textContent = "Войдите под учётной записью с ролью admin.";
      gateLoginBtn.hidden = false;
      gateLoginBtn.onclick = () => openAuthModal("login");
    }
    return;
  }
  currentUid = profile.uid;
  authGate.hidden = true;
  adminContent.hidden = false;
  wireTabs();
  document.getElementById("addProductBtn").onclick = () => openProductModal();
  document.getElementById("recalcRatingsBtn").onclick = recalcRatings;
  document.getElementById("loadMoreProductsBtn").onclick = () => loadProducts(false);
  document.getElementById("loadMoreUsersBtn").onclick = () => loadUsers(false);
  document.getElementById("loadMoreModerationBtn").onclick = () => loadModeration(false);

  loadProducts(true);
  watchOrders();
  loadUsers(true);
  loadModeration(true);
  loadStats();
}

document.addEventListener("DOMContentLoaded", () => {
  initHeader();
  boot();
});
