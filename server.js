import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { promises as fs } from "fs";
import path from "path";

const app  = express();
const PORT = process.env.PORT || 3000;

/* ===================== File Paths ===================== */
const MOVIES_FILE      = path.resolve("./movies.json");
const COLLECTIONS_FILE = path.resolve("./collections.json");
const SERIES_FILE      = path.resolve("./series.json");

/* ===================== TMDB CONFIG ===================== */
// 🔑 Store your key in a .env file as TMDB_KEY — never hardcode it
const TMDB_KEY  = process.env.TMDB_KEY || "";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG  = "https://image.tmdb.org/t/p/w500";

if (!TMDB_KEY) {
  console.warn("⚠️  TMDB_KEY env var is not set — TMDB proxy will fail");
}

/* ===================== CORS ===================== */
// 🔒 Set ALLOWED_ORIGINS env var to your frontend URL(s), comma-separated
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["*"]; // fallback: open (dev only)

app.use(cors({
  origin: (origin, callback) => {
    if (ALLOWED_ORIGINS.includes("*") || !origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
}));
app.use(express.json({ limit: "10mb" }));

/* ===================== Cache (with TTL) ===================== */
const _memCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for TMDB responses

function cacheGet(key) {
  const entry = _memCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _memCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  _memCache.set(key, { value, ts: Date.now() });
}

/* ===================== Write Lock ===================== */
// Prevents race conditions when two requests write to the same file simultaneously
const _locks = new Map();

async function withFileLock(file, fn) {
  while (_locks.get(file)) {
    await _locks.get(file);
  }
  let resolve;
  const lock = new Promise(r => { resolve = r; });
  _locks.set(file, lock);
  try {
    return await fn();
  } finally {
    _locks.delete(file);
    resolve();
  }
}

/* ===================== JSON Helpers ===================== */
async function readJSON(file, fallback) {
  const cached = cacheGet(file);
  if (cached) return cached;

  try {
    const raw    = await fs.readFile(file, "utf-8");
    const parsed = raw.trim() ? JSON.parse(raw) : fallback;
    cacheSet(file, parsed);
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    console.error("JSON Read Error:", err);
    return fallback;
  }
}

async function writeJSON(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
  cacheSet(file, data);
}

/* ===================== TMDB IMAGE FIX ===================== */
function attachImages(obj) {
  if (Array.isArray(obj)) return obj.map(attachImages);

  if (obj && typeof obj === "object") {
    const result = {};
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (
        (key === "poster_path" || key === "backdrop_path" || key === "profile_path") &&
        value
      ) {
        result[key] = TMDB_IMG + value;
      } else {
        result[key] = attachImages(value);
      }
    }
    return result;
  }

  return obj;
}

/* ===================== Helpers ===================== */
function badRequest(msg) {
  const e = new Error(msg);
  e.status = 400;
  throw e;
}

function requireId(val) {
  if (typeof val !== "string" || !val.trim())
    badRequest("id must be a non-empty string");
}

function requireStr(val, name) {
  if (typeof val !== "string" || !val.trim())
    badRequest(`${name} must be a non-empty string`);
}

/* ===================== Root ===================== */
app.get("/", (req, res) => {
  res.send("SC Files Backend is Active 🚀");
});

/* ===================== TMDB PROXY ===================== */
app.get("/api/tmdb", async (req, res) => {
  try {
    if (!TMDB_KEY) {
      return res.status(503).json({ error: "TMDB is not configured on this server" });
    }

    const reqPath = req.query.path;
    if (!reqPath) {
      return res.status(400).json({ error: "Missing 'path' query param" });
    }

    // Cache key uses path only (keeps API key out of the map key)
    const cacheKey = `tmdb:${reqPath}`;
    const cached   = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const url = `${TMDB_BASE}${reqPath}${reqPath.includes("?") ? "&" : "?"}api_key=${TMDB_KEY}`;

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ error: `TMDB returned ${response.status}` });
    }

    const data      = await response.json();
    const finalData = attachImages(data);

    cacheSet(cacheKey, finalData);
    res.json(finalData);

  } catch (err) {
    console.error("TMDB Proxy Error:", err);
    res.status(500).json({ error: "TMDB fetch failed" });
  }
});

/* ===================== Movies ===================== */
app.get("/api/movies", async (req, res, next) => {
  try {
    const movies = await readJSON(MOVIES_FILE, []);
    const limit  = parseInt(req.query.limit)  || movies.length;
    const offset = parseInt(req.query.offset) || 0;
    res.json(movies.slice(offset, offset + limit));
  } catch (err) { next(err); }
});

app.get("/api/movies/:id", async (req, res, next) => {
  try {
    const movies = await readJSON(MOVIES_FILE, []);
    const item   = movies.find(m => m.id === req.params.id);
    if (!item) return res.status(404).json({ error: "Movie not found" });
    res.json(item);
  } catch (err) { next(err); }
});

app.post("/api/movies", async (req, res, next) => {
  try {
    await withFileLock(MOVIES_FILE, async () => {
      const movies = await readJSON(MOVIES_FILE, []);
      const { position = "bottom", ...movie } = req.body;

      requireId(movie.id);

      const index = movies.findIndex(m => m.id === movie.id);

      if (index >= 0) {
        movies[index] = { ...movies[index], ...movie };
        if (position === "top") {
          const [item] = movies.splice(index, 1);
          movies.unshift(item);
        }
      } else {
        position === "top" ? movies.unshift(movie) : movies.push(movie);
      }

      await writeJSON(MOVIES_FILE, movies);
      res.json({ success: true, count: movies.length });
    });
  } catch (err) { next(err); }
});

app.delete("/api/movies/:id", async (req, res, next) => {
  try {
    await withFileLock(MOVIES_FILE, async () => {
      const movies   = await readJSON(MOVIES_FILE, []);
      const filtered = movies.filter(m => m.id !== req.params.id);

      if (movies.length === filtered.length) {
        return res.status(404).json({ error: "Movie not found" });
      }

      await writeJSON(MOVIES_FILE, filtered);
      res.json({ success: true, count: filtered.length });
    });
  } catch (err) { next(err); }
});

/* ===================== Series ===================== */
app.get("/api/series", async (req, res, next) => {
  try {
    const series = await readJSON(SERIES_FILE, []);
    res.json(series);
  } catch (err) { next(err); }
});

app.get("/api/series/:id", async (req, res, next) => {
  try {
    const series = await readJSON(SERIES_FILE, []);
    const item   = series.find(s => s.id === req.params.id);
    if (!item) return res.status(404).json({ error: "Series not found" });
    res.json(item);
  } catch (err) { next(err); }
});

app.post("/api/series", async (req, res, next) => {
  try {
    await withFileLock(SERIES_FILE, async () => {
      const series    = await readJSON(SERIES_FILE, []);
      const newSeries = req.body;

      requireId(newSeries.id);

      if (newSeries.seasons !== undefined && !Array.isArray(newSeries.seasons)) {
        badRequest("seasons must be an array");
      }

      const index = series.findIndex(s => s.id === newSeries.id);
      if (index >= 0) series.splice(index, 1);

      series.unshift(newSeries);

      await writeJSON(SERIES_FILE, series);
      res.json({ success: true, count: series.length });
    });
  } catch (err) { next(err); }
});

app.delete("/api/series/:id", async (req, res, next) => {
  try {
    await withFileLock(SERIES_FILE, async () => {
      const series   = await readJSON(SERIES_FILE, []);
      const filtered = series.filter(s => s.id !== req.params.id);

      if (series.length === filtered.length) {
        return res.status(404).json({ error: "Series not found" });
      }

      await writeJSON(SERIES_FILE, filtered);
      res.json({ success: true, count: filtered.length });
    });
  } catch (err) { next(err); }
});

/* ===================== Collections ===================== */
app.get("/api/collections", async (req, res, next) => {
  try {
    res.json(await readJSON(COLLECTIONS_FILE, {}));
  } catch (err) { next(err); }
});

app.get("/api/collections/:id", async (req, res, next) => {
  try {
    const collections = await readJSON(COLLECTIONS_FILE, {});
    const collection  = collections[req.params.id];
    if (!collection) return res.status(404).json({ error: "Collection not found" });
    res.json(collection);
  } catch (err) { next(err); }
});

app.post("/api/collections", async (req, res, next) => {
  try {
    await withFileLock(COLLECTIONS_FILE, async () => {
      const collections = await readJSON(COLLECTIONS_FILE, {});
      const { id, name, banner, "bg-music": bgMusic, movies = [] } = req.body;

      requireId(id);
      requireStr(name, "name");

      if (!Array.isArray(movies)) badRequest("movies must be an array");

      const { [id]: _, ...rest } = collections;

      const updated = {
        ...rest,
        [id]: {
          name: name.trim(),
          banner:     banner  || "",
          "bg-music": bgMusic || "",
          movies,
        },
      };

      await writeJSON(COLLECTIONS_FILE, updated);
      res.json({ success: true, total: Object.keys(updated).length });
    });
  } catch (err) { next(err); }
});

app.delete("/api/collections/:id", async (req, res, next) => {
  try {
    await withFileLock(COLLECTIONS_FILE, async () => {
      const collections = await readJSON(COLLECTIONS_FILE, {});

      if (!collections[req.params.id]) {
        return res.status(404).json({ error: "Collection not found" });
      }

      delete collections[req.params.id];
      await writeJSON(COLLECTIONS_FILE, collections);
      res.json({ success: true, total: Object.keys(collections).length });
    });
  } catch (err) { next(err); }
});

/* ===================== Error Handler ===================== */
app.use((err, req, res, _next) => {
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "CORS: origin not allowed" });
  }
  console.error("Server Error:", err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

/* ===================== Start ===================== */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend live on port ${PORT}`);
});