import { initHeader, initFooter, escapeHtml, starString, productCardHTML, wirePhotoFrames } from "./ui.js";
import { CATEGORIES, TAGS, queryProducts, countProducts } from "./products-service.js";
import { getLatestReviews } from "./reviews-service.js";

const grid = document.getElementById("productGrid");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const emptyState = document.getElementById("emptyState");
const resultCount = document.getElementById("resultCount");
const categoryChips = document.getElementById("categoryChips");
const tagSelect = document.getElementById("tagSelect");
const sortSelect = document.getElementById("sortSelect");

const params = new URLSearchParams(window.location.search);

const state = {
  searchWord: (params.get("q") || "").trim().toLowerCase().split(/\s+/)[0] || "",
  category: "",
  tag: "",
  sortBy: "createdAt",
  sortDir: "desc",
  cursor: null
};

function buildFilters() {
  const allChip = document.createElement("button");
  allChip.className = "chip active";
  allChip.textContent = "Все сорта";
  allChip.onclick = () => selectCategory("", allChip);
  categoryChips.appendChild(allChip);

  CATEGORIES.forEach(cat => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = cat;
    chip.onclick = () => selectCategory(cat, chip);
    categoryChips.appendChild(chip);
  });

  tagSelect.innerHTML = `<option value="">Все особенности</option>` +
    TAGS.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
  tagSelect.onchange = () => { state.tag = tagSelect.value; loadPage(true); };

  sortSelect.onchange = () => {
    const [field, dir] = sortSelect.value.split(":");
    state.sortBy = field; state.sortDir = dir;
    loadPage(true);
  };
}

function selectCategory(cat, chipEl) {
  state.category = cat;
  categoryChips.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
  chipEl.classList.add("active");
  loadPage(true);
}

function skeletonCards(n) {
  return Array.from({ length: n }).map(() => `
    <div class="card">
      <div class="card-img skeleton" style="aspect-ratio:4/3"></div>
      <div class="card-body">
        <div class="skeleton" style="height:12px;width:40%"></div>
        <div class="skeleton" style="height:18px;width:80%"></div>
        <div class="skeleton" style="height:14px;width:60%"></div>
      </div>
    </div>`).join("");
}

async function loadPage(reset) {
  if (reset) {
    state.cursor = null;
    grid.innerHTML = skeletonCards(6);
    emptyState.hidden = true;
  }
  try {
    const result = await queryProducts({
      searchWord: state.searchWord, category: state.category, tag: state.tag,
      sortBy: state.sortBy, sortDir: state.sortDir, cursor: state.cursor
    });
    if (reset) grid.innerHTML = "";
    grid.insertAdjacentHTML("beforeend", result.items.map(productCardHTML).join(""));
    state.cursor = result.lastDoc;
    loadMoreBtn.hidden = !result.hasMore;
    emptyState.hidden = grid.children.length > 0;

    if (reset) {
      const n = await countProducts({ searchWord: state.searchWord, category: state.category, tag: state.tag });
      resultCount.textContent = `Найдено: ${n}`;
    }
  } catch (err) {
    console.error(err);
    if (reset) grid.innerHTML = "";
    emptyState.hidden = false;
    emptyState.querySelector("h3").textContent = "Не удалось загрузить каталог";
    emptyState.querySelector("p").textContent = "Проверьте, что в firebase-config.js указаны данные вашего проекта и созданы нужные индексы Firestore (см. README).";
  }
}

async function loadReviewsStrip() {
  const strip = document.getElementById("reviewsStrip");
  try {
    const reviews = await getLatestReviews(6);
    if (!reviews.length) {
      strip.innerHTML = `<p class="muted">Отзывов пока нет — станьте первым на странице товара.</p>`;
      return;
    }
    strip.innerHTML = reviews.map(r => `
      <div style="min-width:260px;max-width:260px;background:var(--white);border:1px solid var(--line);border-radius:var(--radius-m);padding:20px;flex-shrink:0">
        <div class="stars">${starString(r.rating)}</div>
        <p style="font-size:1rem;margin:10px 0">${escapeHtml((r.text || "").slice(0, 140))}${(r.text || "").length > 140 ? "…" : ""}</p>
        <strong style="font-size:1rem">${escapeHtml(r.userName || "Покупатель")}</strong>
      </div>`).join("");
  } catch {
    strip.innerHTML = "";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initHeader({ onSearch: (q) => { state.searchWord = q.trim().toLowerCase().split(/\s+/)[0] || ""; loadPage(true); } });
  initFooter();
  wirePhotoFrames();
  buildFilters();
  loadPage(true);
  loadReviewsStrip();
});
