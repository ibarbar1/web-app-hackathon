require("dotenv").config();
const express = require("express");
const path = require("path");
const { MeiliSearch } = require("meilisearch");

const PORT = process.env.PORT || 3000;
const MEILI_HOST = process.env.MEILI_HOST || "http://localhost:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "anthropic/claude-haiku-4.5";

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

// ── AI Recommend endpoint ──────────────────────────

async function chatAI(messages) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({ model: AI_MODEL, messages, temperature: 0.7 }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

// Load genre map once at startup
let genreMap = {};
(async () => {
  try {
    const result = await client.index("genres").getDocuments({ limit: 100 });
    result.results.forEach((g) => (genreMap[g.id] = g.name));
  } catch {}
})();

app.post("/api/recommend", async (req, res) => {
  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });
  }

  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  try {
    // Step 1: Ask AI to generate search queries for Meilisearch
    const genreList = Object.entries(genreMap)
      .map(([id, name]) => `${name} (id: ${id})`)
      .join(", ");

    const searchSystemPrompt = `You are a movie recommendation assistant. The user will describe what kind of movie they want. Your job is to generate search queries to find matching movies in our database.

Available genres: ${genreList}

Respond with ONLY valid JSON (no markdown, no backticks) in this format:
{
  "queries": [
    { "q": "search text", "genre": genre_id_or_null, "sort": "sort_string_or_null" }
  ],
  "thinking": "brief note about what the user wants"
}

Generate 2-5 diverse queries to maximize coverage. For "q", use keywords that would match movie titles or descriptions. For "genre", use the numeric genre id or null. For "sort", use one of: "popularity:desc", "vote_average:desc", "release_year:desc", or null.

Examples:
- "scary movie" → queries with horror keywords, genre 27 (Horror)
- "something funny and lighthearted" → queries with comedy keywords, genre 35 (Comedy)
- "mind-bending like Inception" → queries about dreams, thriller, sci-fi keywords`;

    const searchMessages = [
      { role: "system", content: searchSystemPrompt },
      ...history.slice(-6),
      { role: "user", content: message },
    ];

    const searchResponse = await chatAI(searchMessages);
    let searchPlan;
    try {
      searchPlan = JSON.parse(searchResponse);
    } catch {
      // If AI didn't return valid JSON, fall back to a simple search
      searchPlan = { queries: [{ q: message, genre: null, sort: "popularity:desc" }], thinking: "fallback" };
    }

    // Step 2: Run all queries against Meilisearch and collect unique results
    const movieMap = new Map();
    for (const query of searchPlan.queries) {
      const options = { limit: 20 };
      const filter = [];
      if (query.genre) filter.push(`genre_ids = ${query.genre}`);
      if (filter.length) options.filter = filter;
      if (query.sort) options.sort = [query.sort];

      try {
        const results = await client.index("movies").search(query.q || "", options);
        for (const hit of results.hits) {
          if (!movieMap.has(hit.id)) movieMap.set(hit.id, hit);
        }
      } catch {}
    }

    const candidates = Array.from(movieMap.values()).slice(0, 30);

    if (candidates.length === 0) {
      return res.json({
        message: "I couldn't find any movies matching that description in our library. Could you try describing what you're looking for differently?",
        movies: [],
      });
    }

    // Step 3: Ask AI to pick the best matches and explain why
    const candidateSummaries = candidates.map((m) => ({
      id: m.id,
      title: m.title,
      year: m.release_date?.split("-")[0] || "",
      rating: m.vote_average,
      genres: (m.genre_ids || []).map((id) => genreMap[id]).filter(Boolean).join(", "),
      overview: (m.overview || "").slice(0, 200),
    }));

    const pickSystemPrompt = `You are a friendly, knowledgeable movie recommender. The user asked for movie recommendations. Below are candidate movies from our database. Pick the 3-6 BEST matches for what the user wants and explain why each is a great pick.

Respond with ONLY valid JSON (no markdown, no backticks):
{
  "message": "Your conversational response explaining your recommendations. Be enthusiastic but concise. Use the movie titles naturally in your response.",
  "picked_ids": [id1, id2, id3]
}

Keep your message under 300 words. Be specific about WHY each movie fits what they asked for.`;

    const pickMessages = [
      { role: "system", content: pickSystemPrompt },
      ...history.slice(-6),
      {
        role: "user",
        content: `User's request: "${message}"\n\nCandidate movies:\n${JSON.stringify(candidateSummaries, null, 2)}`,
      },
    ];

    const pickResponse = await chatAI(pickMessages);
    let picks;
    try {
      picks = JSON.parse(pickResponse);
    } catch {
      // Fallback: return top candidates with generic message
      picks = {
        message: "Here are some movies you might enjoy based on your request!",
        picked_ids: candidates.slice(0, 5).map((m) => m.id),
      };
    }

    // Build the final movie list in the order the AI picked
    const pickedMovies = picks.picked_ids
      .map((id) => movieMap.get(id))
      .filter(Boolean);

    res.json({ message: picks.message, movies: pickedMovies });
  } catch (err) {
    console.error("Recommend error:", err.message);
    res.status(500).json({ error: "Recommendation failed: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Movie Search running at http://localhost:${PORT}`);
});
