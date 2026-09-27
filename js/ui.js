import { watchAuth, logIn, signUp, resetPassword, logOut, authErrorMessage, getProfile } from "./auth.js";
import { cartCount } from "./cart-store.js";
import { getSearchSuggestions } from "./products-service.js";
import { CONTACTS, phoneHref, whatsappUrl, telegramUrl, instagramUrl, tiktokUrl } from "./site-config.js";

/* ---------------------------- toast ---------------------------- */

export function toast(message, type = "success") {
  let wrap = document.getElementById("toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "toast-wrap";
    document.body.appendChild(wrap);
  }
  const el = document.createElement("div");
  el.className = `toast${type === "error" ? " error" : ""}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* --------------------------- confirm ---------------------------- */

export function showConfirm(message, confirmLabel = "Удалить") {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="alertdialog" aria-modal="true">
        <p style="margin-top:0">${message}</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px">
          <button class="btn btn-outline" data-act="cancel">Отмена</button>
          <button class="btn btn-danger" data-act="ok">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.dataset.act === "cancel") { overlay.remove(); resolve(false); }
      if (e.target.dataset.act === "ok") { overlay.remove(); resolve(true); }
    });
  });
}

/* ------------------------- auth modal ---------------------------- */

let modalRoot = null;
function ensureModalRoot() {
  if (!modalRoot) {
    modalRoot = document.getElementById("modalRoot");
    if (!modalRoot) {
      modalRoot = document.createElement("div");
      modalRoot.id = "modalRoot";
      document.body.appendChild(modalRoot);
    }
  }
  return modalRoot;
}

export function closeAuthModal() {
  const root = ensureModalRoot();
  root.innerHTML = "";
}

export function openAuthModal(initialTab = "login") {
  const root = ensureModalRoot();
  let tab = initialTab;

  function render() {
    root.innerHTML = `
      <div class="modal-overlay" id="authOverlay">
        <div class="modal">
          <button class="modal-close" id="authClose" aria-label="Закрыть">×</button>
          <div class="modal-tabs">
            <button data-tab="login" class="${tab === "login" ? "active" : ""}">Вход</button>
            <button data-tab="register" class="${tab === "register" ? "active" : ""}">Регистрация</button>
          </div>
          ${tab === "login" ? loginForm() : registerForm()}
        </div>
      </div>`;
    wire();
  }

  function loginForm() {
    return `
      <form id="loginForm">
        <div class="field">
          <label for="loginEmail">Email</label>
          <input id="loginEmail" type="email" required autocomplete="email" />
        </div>
        <div class="field">
          <label for="loginPassword">Пароль</label>
          <input id="loginPassword" type="password" required autocomplete="current-password" minlength="6" />
        </div>
        <div class="field-error" id="loginError" hidden></div>
        <button class="btn btn-primary btn-block" type="submit">Войти</button>
        <button class="btn btn-ghost btn-block" type="button" id="forgotBtn">Забыли пароль?</button>
      </form>`;
  }

  function registerForm() {
    return `
      <form id="registerForm">
        <div class="field">
          <label for="regName">Имя</label>
          <input id="regName" type="text" required autocomplete="name" />
        </div>
        <div class="field">
          <label for="regEmail">Email</label>
          <input id="regEmail" type="email" required autocomplete="email" />
        </div>
        <div class="field">
          <label for="regPassword">Пароль</label>
          <input id="regPassword" type="password" required autocomplete="new-password" minlength="6" />
          <div class="field-hint">Минимум 6 символов</div>
        </div>
        <div class="field-error" id="registerError" hidden></div>
        <button class="btn btn-primary btn-block" type="submit">Создать аккаунт</button>
      </form>`;
  }

  function showError(id, err) {
    const el = document.getElementById(id);
    el.textContent = typeof err === "string" ? err : authErrorMessage(err);
    el.hidden = false;
  }

  function wire() {
    document.getElementById("authClose").onclick = closeAuthModal;
    document.getElementById("authOverlay").addEventListener("click", (e) => {
      if (e.target.id === "authOverlay") closeAuthModal();
    });
    root.querySelectorAll(".modal-tabs button").forEach(btn => {
      btn.onclick = () => { tab = btn.dataset.tab; render(); };
    });

    const loginFormEl = document.getElementById("loginForm");
    if (loginFormEl) {
      loginFormEl.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;
        try {
          await logIn(email, password);
          closeAuthModal();
          toast("Добро пожаловать!");
        } catch (err) { showError("loginError", err); }
      };
      document.getElementById("forgotBtn").onclick = async () => {
        const email = document.getElementById("loginEmail").value.trim();
        if (!email) { showError("loginError", "Введите email, затем нажмите «Забыли пароль?» ещё раз."); return; }
        try {
          await resetPassword(email);
          toast("Письмо для сброса пароля отправлено");
        } catch (err) { showError("loginError", err); }
      };
    }

    const regFormEl = document.getElementById("registerForm");
    if (regFormEl) {
      regFormEl.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById("regName").value.trim();
        const email = document.getElementById("regEmail").value.trim();
        const password = document.getElementById("regPassword").value;
        try {
          await signUp(name, email, password);
          closeAuthModal();
          toast("Аккаунт создан. Добро пожаловать!");
        } catch (err) { showError("registerError", err); }
      };
    }
  }

  render();
}

/* ---------------------- header search dropdown --------------------- */

let searchDebounce = null;

function wireSearchDropdown(searchInput, onPickHref) {
  const dropdown = document.getElementById("searchDropdown");
  if (!dropdown || !searchInput) return;

  function hide() { dropdown.hidden = true; dropdown.innerHTML = ""; }

  function renderResults(items, q) {
    if (!items.length) {
      dropdown.innerHTML = `<div class="search-dropdown-empty">Ничего не нашлось по «${escapeHtml(q)}»</div>`;
    } else {
      dropdown.innerHTML = items.map(p => `
        <a class="search-dropdown-item" href="product.html?id=${p.id}">
          <span class="search-dropdown-thumb">${p.image ? `<img src="${escapeHtml(p.image)}" alt="" />` : "🍯"}</span>
          <span class="search-dropdown-text">
            <strong>${escapeHtml(p.name)}</strong>
            <span class="muted">${formatPrice(p.price)}${(p.stock ?? 1) <= 0 ? " · нет в наличии" : ""}</span>
          </span>
        </a>`).join("");
    }
    dropdown.hidden = false;
  }

  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    const raw = searchInput.value.trim();
    if (!raw) { hide(); return; }
    searchDebounce = setTimeout(async () => {
      const word = raw.toLowerCase().split(/\s+/)[0];
      try {
        const items = await getSearchSuggestions(word, 5);
        // The input may have changed while this request was in flight.
        if (searchInput.value.trim() === raw) renderResults(items, raw);
      } catch (err) {
        console.error("search suggestions:", err);
      }
    }, 250);
  });

  searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim()) searchInput.dispatchEvent(new Event("input"));
  });
  searchInput.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== searchInput) hide();
  });
  // Selecting a suggestion navigates via the anchor's own href — just
  // close the dropdown so it doesn't linger during the page transition.
  dropdown.addEventListener("click", (e) => { if (e.target.closest("a")) hide(); });
}

/* --------------------------- header ------------------------------ */

// Call once per page after DOMContentLoaded. `opts.onSearch(query)` is
// optional — only index.html needs to react to search live; other pages
// just navigate to index.html?q=...
export function initHeader(opts = {}) {
  const badge = document.getElementById("cartBadge");
  function refreshBadge() {
    if (!badge) return;
    const n = cartCount();
    badge.textContent = n;
    badge.hidden = n === 0;
  }
  refreshBadge();
  window.addEventListener("cart:changed", refreshBadge);

  const authArea = document.getElementById("authArea");
  watchAuth((profile) => {
    if (!authArea) return;
    if (!profile) {
      authArea.innerHTML = `<button class="btn btn-outline btn-sm" id="loginBtn">Войти</button>`;
      document.getElementById("loginBtn").onclick = () => openAuthModal("login");
    } else {
      authArea.innerHTML = `
        <a href="dashboard.html" class="icon-btn" title="${escapeHtml(profile.name || profile.email)}">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>
        </a>
        ${profile.role === "admin" ? `<a href="admin.html" class="btn btn-outline btn-sm header-desktop-only">Админ</a>` : ""}
        <button class="btn btn-ghost btn-sm header-desktop-only" id="logoutBtn">Выйти</button>`;
      document.getElementById("logoutBtn").onclick = async () => {
        await logOut();
        toast("Вы вышли из аккаунта");
        if (document.body.dataset.protected === "true") window.location.href = "index.html";
      };
    }
    if (opts.onAuthChange) opts.onAuthChange(profile);
  });

  const searchForm = document.getElementById("headerSearchForm");
  const searchInput = document.getElementById("headerSearchInput");
  const params = new URLSearchParams(window.location.search);
  if (searchInput && params.get("q")) searchInput.value = params.get("q");
  if (searchForm) {
    searchForm.onsubmit = (e) => {
      e.preventDefault();
      const q = searchInput.value.trim();
      const dropdown = document.getElementById("searchDropdown");
      if (dropdown) { dropdown.hidden = true; }
      if (opts.onSearch) opts.onSearch(q);
      else window.location.href = `index.html${q ? "?q=" + encodeURIComponent(q) : ""}`;
    };
  }
  wireSearchDropdown(searchInput);

  const mobileToggle = document.getElementById("mobileNavToggle");
  if (mobileToggle) {
    mobileToggle.onclick = () => {
      const root = ensureModalRoot();
      const profile = getProfile();
      const accountHTML = profile
        ? `
          <a href="dashboard.html" class="btn btn-outline">Личный кабинет</a>
          ${profile.role === "admin" ? `<a href="admin.html" class="btn btn-outline">Админ-панель</a>` : ""}
          <button class="btn btn-ghost" id="mobileLogoutBtn" type="button">Выйти</button>`
        : `<button class="btn btn-primary" id="mobileLoginBtn" type="button">Войти</button>`;

      root.innerHTML = `
        <div class="modal-overlay" id="mobileNavOverlay">
          <div class="modal" style="max-width:340px">
            <button class="modal-close" id="mobileNavClose" aria-label="Закрыть">×</button>
            <form class="header-search" id="mobileSearchForm" style="margin-bottom:18px">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
              <input id="mobileSearchInput" placeholder="Найти мёд…" autocomplete="off" />
              <div class="search-dropdown" id="mobileSearchDropdown" hidden></div>
            </form>
            <nav style="display:flex;flex-direction:column;gap:14px">
              <a href="index.html" class="btn btn-outline">Каталог</a>
              <a href="index.html#about" class="btn btn-outline">О пасеке</a>
              <a href="index.html#gallery" class="btn btn-outline">Галерея</a>
              <a href="index.html#reviews" class="btn btn-outline">Отзывы</a>
              <a href="index.html#contacts" class="btn btn-outline">Контакты</a>
              <a href="cart.html" class="btn btn-outline">Корзина</a>
              <hr class="divider" style="margin:6px 0" />
              ${accountHTML}
            </nav>
          </div>
        </div>`;
      document.getElementById("mobileNavClose").onclick = closeAuthModal;
      document.getElementById("mobileNavOverlay").addEventListener("click", (e) => {
        if (e.target.id === "mobileNavOverlay") closeAuthModal();
      });
      const mobileLoginBtn = document.getElementById("mobileLoginBtn");
      if (mobileLoginBtn) mobileLoginBtn.onclick = () => openAuthModal("login");
      const mobileLogoutBtn = document.getElementById("mobileLogoutBtn");
      if (mobileLogoutBtn) mobileLogoutBtn.onclick = async () => {
        await logOut();
        closeAuthModal();
        toast("Вы вышли из аккаунта");
        if (document.body.dataset.protected === "true") window.location.href = "index.html";
      };
      const mobileInput = document.getElementById("mobileSearchInput");
      document.getElementById("mobileSearchForm").onsubmit = (e) => {
        e.preventDefault();
        const q = mobileInput.value.trim();
        window.location.href = `index.html${q ? "?q=" + encodeURIComponent(q) : ""}`;
      };
      wireSearchDropdownFor(mobileInput, "mobileSearchDropdown");
    };
  }
}

// Same live-suggestions behaviour as the desktop header, targeting a
// different input/dropdown pair (used inside the mobile nav overlay).
function wireSearchDropdownFor(inputEl, dropdownId) {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown || !inputEl) return;
  let timer = null;
  inputEl.addEventListener("input", () => {
    clearTimeout(timer);
    const raw = inputEl.value.trim();
    if (!raw) { dropdown.hidden = true; dropdown.innerHTML = ""; return; }
    timer = setTimeout(async () => {
      const word = raw.toLowerCase().split(/\s+/)[0];
      try {
        const items = await getSearchSuggestions(word, 5);
        if (inputEl.value.trim() !== raw) return;
        dropdown.innerHTML = items.length
          ? items.map(p => `
              <a class="search-dropdown-item" href="product.html?id=${p.id}">
                <span class="search-dropdown-thumb">${p.image ? `<img src="${escapeHtml(p.image)}" alt="" />` : "🍯"}</span>
                <span class="search-dropdown-text"><strong>${escapeHtml(p.name)}</strong><span class="muted">${formatPrice(p.price)}</span></span>
              </a>`).join("")
          : `<div class="search-dropdown-empty">Ничего не нашлось по «${escapeHtml(raw)}»</div>`;
        dropdown.hidden = false;
      } catch (err) { console.error("search suggestions:", err); }
    }, 250);
  });
}

/* ---------------------------- footer ------------------------------ */

const ICONS = {
  instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3v11.5a3.5 3.5 0 1 1-3-3.46"/><path d="M14 3a5 5 0 0 0 5 5"/></svg>`,
  telegram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21l1.6-4.8A8.5 8.5 0 1 1 8 19.4Z"/><path d="M8.5 9.3c.2 2.6 2.6 5 5.2 5.2.9 0 .9-1.7.4-2.1-.4-.4-1.4-.6-1.7-.3l-.4.4c-1-.4-2-1.4-2.4-2.4l.4-.4c.3-.3.1-1.3-.3-1.7-.4-.5-2.1-.5-2.1.4a2 2 0 0 0 .9 1.3Z"/></svg>`
};

export function renderFooterContacts() {
  const el = document.getElementById("footerContacts");
  if (!el) return;

  const cityHTML = CONTACTS.city ? `
    <div class="footer-city">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s7-7.4 7-12.5A7 7 0 1 0 5 9.5C5 14.6 12 22 12 22Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>
      ${escapeHtml(CONTACTS.city)}
    </div>` : "";

  const phone = phoneHref();
  const callbackHTML = phone ? `<a href="#" class="footer-callback" id="footerCallbackLink">Заказать звонок</a>` : "";
  const phoneBlockHTML = phone ? `
    <div>
      ${CONTACTS.hours ? `<div class="footer-hours">${escapeHtml(CONTACTS.hours)}</div>` : ""}
      <a class="footer-phone" href="${phone}">${escapeHtml(CONTACTS.phone)}</a>
    </div>` : "";

  const socialItems = [
    { url: whatsappUrl(), name: "WhatsApp", icon: ICONS.whatsapp },
    { url: telegramUrl(), name: "Telegram", icon: ICONS.telegram },
    { url: instagramUrl(), name: "Instagram", icon: ICONS.instagram },
    { url: tiktokUrl(), name: "TikTok", icon: ICONS.tiktok }
  ].filter(i => i.url);
  const socialHTML = socialItems.length ? `
    <div>
      <div class="footer-social-heading">Мы в соцсетях</div>
      <div class="footer-icon-row">
        ${socialItems.map(i => `<a class="footer-icon-btn" href="${i.url}" target="_blank" rel="noopener noreferrer" aria-label="${i.name}">${i.icon}</a>`).join("")}
      </div>
    </div>` : "";

  if (!cityHTML && !phoneBlockHTML && !socialHTML) {
    el.innerHTML = `<p class="muted" style="font-size:1rem;color:var(--ivory-deep);opacity:.6;margin:0">Контакты появятся здесь — впишите их в js/site-config.js</p>`;
    return;
  }

  el.innerHTML = `${cityHTML}${callbackHTML}${phoneBlockHTML}${socialHTML}`;

  const callbackLink = document.getElementById("footerCallbackLink");
  if (callbackLink) {
    callbackLink.onclick = (e) => {
      e.preventDefault();
      toast("Заявка принята! Мы вам перезвоним.");
    };
  }
}

export function initFooter() {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  const subscribeForm = document.getElementById("subscribeForm");
  if (subscribeForm) {
    subscribeForm.onsubmit = (e) => {
      e.preventDefault();
      subscribeForm.reset();
      toast("Спасибо! Вы подписаны на новости пасеки");
    };
  }
  renderFooterContacts();
}

/* ------------------------ photo placeholders ----------------------- */

// Wires every `.photo-frame` on the page: if its <img> fails to load (the
// person hasn't dropped a real file into img/ yet), show a friendly
// placeholder naming the exact path expected — turning a broken-image icon
// into self-documenting setup instructions.
export function wirePhotoFrames() {
  document.querySelectorAll(".photo-frame").forEach(frame => {
    const img = frame.querySelector("img");
    if (!img) return;
    const showFallback = () => {
      frame.classList.add("is-empty");
      if (frame.querySelector(".frame-fallback")) return;
      const path = img.getAttribute("src");
      const label = frame.dataset.label || "Фото";
      frame.insertAdjacentHTML("beforeend", `
        <div class="frame-fallback">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></svg>
          <span>${escapeHtml(label)}<br /><code>${escapeHtml(path)}</code></span>
        </div>`);
    };
    if (img.complete && img.naturalWidth === 0) showFallback();
    else img.addEventListener("error", showFallback, { once: true });
  });

  // Hero background photo: no placeholder text needed (the CSS honeycomb
  // pattern behind it is already a good-looking default) — just hide the
  // <img> on error so the pattern shows through cleanly.
  const heroPhoto = document.querySelector(".hero-bg-photo");
  if (heroPhoto) {
    const hide = () => heroPhoto.style.display = "none";
    if (heroPhoto.complete && heroPhoto.naturalWidth === 0) hide();
    else heroPhoto.addEventListener("error", hide, { once: true });
  }
}

/* ---------------------------- helpers ------------------------------ */

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

export function formatPrice(n) {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₸";
}

export function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function starString(rating) {
  const r = Math.round(rating || 0);
  return "★".repeat(r) + "☆".repeat(5 - r);
}

// Shared product card markup — used by the catalog grid and the "related
// products" strip on the detail page, so both stay visually identical.
export function productCardHTML(p) {
  const img = p.image
    ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" />`
    : `<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--honey-dark)" stroke-width="1.5"><path d="M9 3h6M10 3v6l-6 10a1 1 0 0 0 1 1.5h14a1 1 0 0 0 1-1.5L14 9V3"/></svg>`;
  const outOfStock = (p.stock ?? 1) <= 0;
  return `
    <a class="card" href="product.html?id=${p.id}">
      <div class="card-img">
        ${img}
        ${outOfStock ? `<span class="stock-badge">Нет в наличии</span>` : ""}
      </div>
      <div class="card-body">
        <span class="card-cat">${escapeHtml(p.category || "")}</span>
        <span class="card-title">${escapeHtml(p.name)}</span>
        <span class="card-rating"><span class="stars">${starString(p.rating)}</span> ${p.reviewsCount ? `(${p.reviewsCount})` : "нет отзывов"}</span>
        <div class="card-foot">
          <span class="card-price">${formatPrice(p.price)} <span>/ ${p.weight} г</span></span>
        </div>
      </div>
    </a>`;
}
