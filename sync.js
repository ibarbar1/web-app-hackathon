require("dotenv").config();
const { MeiliSearch } = require("meilisearch");

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const MEILI_HOST = process.env.MEILI_HOST || "http://localhost:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";
const TOTAL_PAGES = parseInt(process.env.SYNC_PAGES || "50", 10);

if (!TMDB_API_KEY) {
  console.error("Missing TMDB_API_KEY in .env");
  process.exit(1);
}

const client = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

async function fetchPage(page) {
  const url = `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=en-US&page=${page}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB API error: ${res.status}`);
  return res.json();
}

function transformMovie(m) {
  return {
    id: m.id,
    title: m.title,
    overview: m.overview || "",
    release_date: m.release_date || "",
    release_year: m.release_date ? parseInt(m.release_date.split("-")[0], 10) : null,
    vote_average: m.vote_average || 0,
    vote_count: m.vote_count || 0,
    popularity: m.popularity || 0,
    poster: m.poster_path ? `${TMDB_IMAGE_BASE}/w500${m.poster_path}` : null,
    backdrop: m.backdrop_path ? `${TMDB_IMAGE_BASE}/w1280${m.backdrop_path}` : null,
    genre_ids: m.genre_ids || [],
    original_language: m.original_language || "",
  };
}

async function configureIndex(index) {
  await index.updateSearchableAttributes(["title", "overview"]);
  await index.updateFilterableAttributes([
    "release_year",
    "vote_average",
    "genre_ids",
    "original_language",
  ]);
  await index.updateSortableAttributes([
    "release_year",
    "vote_average",
    "popularity",
  ]);
  await index.updateRankingRules([
    "words",
    "typo",
    "proximity",
    "attribute",
    "sort",
    "exactness",
    "release_year:desc",
    "vote_average:desc",
  ]);
  console.log("Index settings configured.");
}

async function syncGenres() {
  const url = `https://api.themoviedb.org/3/genre/movie/list?api_key=${TMDB_API_KEY}&language=en-US`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB genre API error: ${res.status}`);
  const data = await res.json();

  const index = client.index("genres");
  await index.addDocuments(data.genres);
  console.log(`Synced ${data.genres.length} genres.`);
}

async function main() {
  console.log(`Syncing ${TOTAL_PAGES} pages of popular movies from TMDB...\n`);

  const index = client.index("movies");
  await configureIndex(index);
  await syncGenres();

  let totalMovies = 0;

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    try {
      const data = await fetchPage(page);
      const movies = data.results.map(transformMovie);
      await index.addDocuments(movies);
      totalMovies += movies.length;
      process.stdout.write(`\r  Page ${page}/${TOTAL_PAGES} — ${totalMovies} movies indexed`);
    } catch (err) {
      console.error(`\n  Error on page ${page}: ${err.message}`);
    }
  }

  console.log(`\n\nDone! ${totalMovies} movies synced to Meilisearch.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
