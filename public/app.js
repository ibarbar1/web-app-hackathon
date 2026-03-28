const searchInput = document.getElementById("search-input");
const genreFilter = document.getElementById("genre-filter");
const sortFilter = document.getElementById("sort-filter");
const resultsGrid = document.getElementById("results");
const resultsMeta = document.getElementById("results-meta");
const loading = document.getElementById("loading");
const emptyState = document.getElementById("empty-state");
const pagination = document.getElementById("pagination");
const modalOverlay = document.getElementById("modal-overlay");
const modalBody = document.getElementById("modal-body");
const modalClose = document.getElementById("modal-close");

let genres = {};
let debounceTimer = null;
let currentPage = 1;
const PER_PAGE = 20;

async function loadGenres() {
  try {
    const res = await fetch("/api/genres");
    const data = await res.json();
    data.forEach((g) => {
      genres[g.id] = g.name;
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.textContent = g.name;
      genreFilter.appendChild(opt);
    });
  } catch {
    // genres are optional
  }
}

function renderCard(movie, highlighted) {
  const title = highlighted?.title?.value || movie.title;
  const year = movie.release_date?.split("-")[0] || "";
  const rating = movie.vote_average?.toFixed(1);

  const card = document.createElement("article");
  card.className = "card";
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");

  card.innerHTML = `
    <div class="card-poster">
      ${
        movie.poster
          ? `<img src="${movie.poster}" alt="${movie.title}" loading="lazy" />`
          : `<div class="no-poster">No Poster</div>`
      }
      ${rating > 0 ? `<span class="card-rating">★ ${rating}</span>` : ""}
    </div>
    <div class="card-info">
      <div class="card-title">${title}</div>
      ${year ? `<div class="card-year">${year}</div>` : ""}
      ${movie.overview ? `<div class="card-overview">${movie.overview}</div>` : ""}
    </div>
  `;

  card.addEventListener("mouseenter", (e) => showTooltip(movie, card));
  card.addEventListener("mouseleave", hideTooltip);

  return card;
}

const tooltip = document.createElement("div");
tooltip.className = "card-tooltip";
tooltip.hidden = true;
document.body.appendChild(tooltip);

let tooltipCard = null;

function showTooltip(movie, card) {
  tooltipCard = card;
  const year = movie.release_date?.split("-")[0] || "";
  const rating = movie.vote_average?.toFixed(1);
  const genreTags = (movie.genre_ids || [])
    .map((id) => genres[id])
    .filter(Boolean)
    .map((name) => `<span class="genre-tag">${name}</span>`)
    .join("");

  tooltip.innerHTML = `
    <div class="tooltip-title">${movie.title}</div>
    <div class="tooltip-meta">
      ${year ? `<span>${year}</span>` : ""}
      ${rating > 0 ? `<span class="rating">★ ${rating}</span>` : ""}
      ${movie.original_language ? `<span>${movie.original_language.toUpperCase()}</span>` : ""}
    </div>
    ${movie.overview ? `<p class="tooltip-overview">${movie.overview}</p>` : ""}
    ${genreTags ? `<div class="tooltip-genres">${genreTags}</div>` : ""}
  `;
  tooltip.hidden = false;
  positionTooltip(card);
}

function positionTooltip(card) {
  const rect = card.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const gap = 12;

  let left = rect.right + gap;
  if (left + tooltipRect.width > window.innerWidth - 16) {
    left = rect.left - tooltipRect.width - gap;
  }
  if (left < 16) {
    left = rect.left + (rect.width - tooltipRect.width) / 2;
  }

  let top = rect.top;
  if (top + tooltipRect.height > window.innerHeight - 16) {
    top = window.innerHeight - tooltipRect.height - 16;
  }
  if (top < 16) top = 16;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTooltip() {
  tooltip.hidden = true;
  tooltipCard = null;
}

function openModal(movie) {
  const year = movie.release_date?.split("-")[0] || "N/A";
  const rating = movie.vote_average?.toFixed(1);
  const genreTags = (movie.genre_ids || [])
    .map((id) => genres[id])
    .filter(Boolean)
    .map((name) => `<span class="genre-tag">${name}</span>`)
    .join("");

  modalBody.innerHTML = `
    ${
      movie.backdrop
        ? `<img class="modal-backdrop" src="${movie.backdrop}" alt="" />`
        : ""
    }
    <div class="modal-content">
      <h2 class="modal-title">${movie.title}</h2>
      <div class="modal-meta">
        <span>${year}</span>
        ${rating > 0 ? `<span class="rating">★ ${rating}</span>` : ""}
        <span>${movie.original_language?.toUpperCase()}</span>
      </div>
      ${movie.overview ? `<p class="modal-overview">${movie.overview}</p>` : ""}
      ${genreTags ? `<div class="modal-genres">${genreTags}</div>` : ""}
    </div>
  `;

  modalOverlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modalOverlay.hidden = true;
  document.body.style.overflow = "";
}

async function search() {
  const q = searchInput.value.trim();
  const genre = genreFilter.value;
  const sort = sortFilter.value;

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (genre) params.set("genre", genre);
  if (sort) params.set("sort", sort);
  params.set("page", currentPage);

  loading.hidden = false;
  emptyState.hidden = true;
  pagination.hidden = true;

  try {
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();

    resultsGrid.innerHTML = "";

    if (data.hits && data.hits.length > 0) {
      const timeMs = data.processingTimeMs;
      const total = data.estimatedTotalHits || data.hits.length;
      const totalPages = Math.ceil(total / PER_PAGE);
      resultsMeta.textContent = `${total.toLocaleString()} results in ${timeMs}ms — Page ${currentPage} of ${totalPages}`;

      data.hits.forEach((hit) => {
        resultsGrid.appendChild(renderCard(hit, hit._formatted));
      });
      emptyState.hidden = true;
      renderPagination(totalPages);
    } else {
      resultsMeta.textContent = "";
      emptyState.hidden = false;
    }
  } catch (err) {
    console.error("Search error:", err);
    resultsMeta.textContent = "Something went wrong.";
  } finally {
    loading.hidden = true;
  }
}

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    pagination.hidden = true;
    return;
  }

  pagination.innerHTML = "";
  pagination.hidden = false;

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "Previous";
  prevBtn.className = "page-btn";
  prevBtn.disabled = currentPage === 1;
  prevBtn.addEventListener("click", () => goToPage(currentPage - 1));
  pagination.appendChild(prevBtn);

  const pages = getPageNumbers(currentPage, totalPages);
  pages.forEach((p) => {
    if (p === "...") {
      const ellipsis = document.createElement("span");
      ellipsis.className = "page-ellipsis";
      ellipsis.textContent = "...";
      pagination.appendChild(ellipsis);
    } else {
      const btn = document.createElement("button");
      btn.textContent = p;
      btn.className = "page-btn" + (p === currentPage ? " active" : "");
      btn.addEventListener("click", () => goToPage(p));
      pagination.appendChild(btn);
    }
  });

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Next";
  nextBtn.className = "page-btn";
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.addEventListener("click", () => goToPage(currentPage + 1));
  pagination.appendChild(nextBtn);
}

function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

function goToPage(page) {
  currentPage = page;
  search();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetAndSearch() {
  currentPage = 1;
  search();
}

function debouncedSearch() {
  clearTimeout(debounceTimer);
  currentPage = 1;
  debounceTimer = setTimeout(search, 200);
}

searchInput.addEventListener("input", debouncedSearch);
genreFilter.addEventListener("change", resetAndSearch);
sortFilter.addEventListener("change", resetAndSearch);

modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
  if (e.key === "/" && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  }
});

// ── AI Chat Panel ──────────────────────────────────

const chatPanel = document.getElementById("chat-panel");
const chatToggle = document.getElementById("chat-toggle");
const chatFab = document.getElementById("chat-fab");
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

let chatHistory = [];
let chatOpen = false;

function toggleChat() {
  chatOpen = !chatOpen;
  chatPanel.classList.toggle("open", chatOpen);
  chatFab.classList.toggle("hidden", chatOpen);
  if (chatOpen) chatInput.focus();
}

chatToggle.addEventListener("click", toggleChat);
chatFab.addEventListener("click", toggleChat);

function addChatBubble(content, type, movies) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${type}`;
  bubble.textContent = content;
  chatMessages.appendChild(bubble);

  if (movies && movies.length > 0) {
    const movieStrip = document.createElement("div");
    movieStrip.className = "chat-movies";
    movies.forEach((movie) => {
      const card = document.createElement("div");
      card.className = "chat-movie-card";
      card.innerHTML = `
        ${movie.poster ? `<img src="${movie.poster}" alt="${movie.title}" />` : `<div class="no-poster-sm">No Poster</div>`}
        <div class="chat-movie-info">
          <div class="chat-movie-title">${movie.title}</div>
          <div class="chat-movie-meta">${movie.release_date?.split("-")[0] || ""} ${movie.vote_average ? `· ★ ${movie.vote_average.toFixed(1)}` : ""}</div>
        </div>
      `;
      card.addEventListener("mouseenter", () => showTooltip(movie, card));
      card.addEventListener("mouseleave", hideTooltip);
      movieStrip.appendChild(card);
    });
    chatMessages.appendChild(movieStrip);
  }

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (!msg) return;

  chatInput.value = "";
  addChatBubble(msg, "user");
  chatHistory.push({ role: "user", content: msg });

  // Show thinking indicator
  const thinking = document.createElement("div");
  thinking.className = "chat-bubble ai thinking";
  thinking.innerHTML = '<span class="dot-pulse"></span>';
  chatMessages.appendChild(thinking);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, history: chatHistory }),
    });
    const data = await res.json();

    thinking.remove();

    if (data.error) {
      addChatBubble("Sorry, something went wrong: " + data.error, "ai");
    } else {
      addChatBubble(data.message, "ai", data.movies);
      chatHistory.push({ role: "assistant", content: data.message });
    }
  } catch (err) {
    thinking.remove();
    addChatBubble("Sorry, I couldn't reach the server. Please try again.", "ai");
  }
});

loadGenres();
search();
