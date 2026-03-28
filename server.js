require("dotenv").config();
const express = require("express");
const path = require("path");
const { MeiliSearch } = require("meilisearch");

const PORT = process.env.PORT || 3000;
const MEILI_HOST = process.env.MEILI_HOST || "http://localhost:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";

const client = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.get("/api/search", async (req, res) => {
  try {
    const { q = "", page = 1, genre, year, sort } = req.query;

    const filter = [];
    if (genre) filter.push(`genre_ids = ${genre}`);
    if (year) filter.push(`release_year = ${year}`);

    const options = {
      limit: 20,
      offset: (parseInt(page, 10) - 1) * 20,
      attributesToHighlight: ["title", "overview"],
      highlightPreTag: "<mark>",
      highlightPostTag: "</mark>",
    };

    if (filter.length) options.filter = filter;
    if (sort) options.sort = [sort];

    const results = await client.index("movies").search(q, options);
    res.json(results);
  } catch (err) {
    console.error("Search error:", err.message);
    res.status(500).json({ error: "Search failed" });
  }
});

app.get("/api/genres", async (_req, res) => {
  try {
    const result = await client.index("genres").getDocuments({ limit: 100 });
    res.json(result.results);
  } catch {
    res.json([]);
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    const health = await client.health();
    res.json({ status: "ok", meilisearch: health });
  } catch {
    res.status(503).json({ status: "degraded", meilisearch: "unreachable" });
  }
});

app.listen(PORT, () => {
  console.log(`Movie Search running at http://localhost:${PORT}`);
});
