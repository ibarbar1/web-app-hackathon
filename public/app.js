const searchInput = document.getElementById("search-input");
const genreFilter = document.getElementById("genre-filter");
const sortFilter = document.getElementById("sort-filter");
const resultsGrid = document.getElementById("results");
const resultsMeta = document.getElementById("results-meta");
const loading = document.getElementById("loading");
const emptyState = document.getElementById("empty-state");
const modalOverlay = document.getElementById("modal-overlay");
const modalBody = document.getElementById("modal-body");
const modalClose = document.getElementById("modal-close");

let genres = {};
let debounceTimer = null;

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
    </div>
  `;

  card.addEventListener("click", () => openModal(movie));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter") openModal(movie);
  });

  return card;
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

  loading.hidden = false;
  emptyState.hidden = true;

  try {
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();

    resultsGrid.innerHTML = "";

    if (data.hits && data.hits.length > 0) {
      const timeMs = data.processingTimeMs;
      const total = data.estimatedTotalHits || data.hits.length;
      resultsMeta.textContent = `${total.toLocaleString()} results in ${timeMs}ms`;

      data.hits.forEach((hit) => {
        resultsGrid.appendChild(renderCard(hit, hit._formatted));
      });
      emptyState.hidden = true;
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

function debouncedSearch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(search, 200);
}

searchInput.addEventListener("input", debouncedSearch);
genreFilter.addEventListener("change", search);
sortFilter.addEventListener("change", search);

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

loadGenres();
search();
