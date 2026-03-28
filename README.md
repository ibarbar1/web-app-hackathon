# Movie Search

Instant movie search powered by [Meilisearch](https://www.meilisearch.com/) and [TMDB](https://www.themoviedb.org/).

## Features

- **Instant search** with typo-tolerance and highlighting
- **Filter** by genre and **sort** by popularity, rating, or release year
- **Movie detail modal** with backdrop, overview, and genre tags
- **Keyboard shortcuts** — press `/` to focus search, `Esc` to close modal
- Dark theme, responsive grid, smooth animations

## Prerequisites

- **Node.js** 18+
- **Meilisearch** running locally (easiest via Docker)
- **TMDB API key** — free at https://www.themoviedb.org/settings/api

## Quick Start

### 1. Start Meilisearch

```bash
docker run -d -p 7700:7700 getmeili/meilisearch:latest
```

Or install via Homebrew:

```bash
brew install meilisearch
meilisearch
```

### 2. Install dependencies

```bash
cd movie-search
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env and add your TMDB_API_KEY
```

### 4. Sync movies from TMDB

```bash
npm run sync
```

This fetches popular movies from TMDB and indexes them into Meilisearch. By default it syncs 50 pages (1000 movies). Adjust `SYNC_PAGES` in `.env` to sync more.

### 5. Start the server

```bash
npm start
```

Open http://localhost:3000 and start searching.

## Architecture

```
movie-search/
├── server.js         # Express server — serves frontend + proxies search
├── sync.js           # Fetches movies from TMDB → indexes into Meilisearch
├── public/
│   ├── index.html    # Single-page frontend
│   ├── style.css     # Dark theme styles
│   └── app.js        # Search UI logic
├── .env.example
└── package.json
```

- The **sync script** pulls popular movies from TMDB's API and pushes them into a Meilisearch `movies` index with configured searchable/filterable/sortable attributes.
- The **Express server** serves the static frontend and provides a `/api/search` endpoint that proxies search requests to Meilisearch.
- The **frontend** provides instant-as-you-type search with debouncing, genre filtering, sorting, and a detail modal.
