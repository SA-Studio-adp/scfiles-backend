import express from "express";
import cors from "cors";
import { promises as fs } from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

const MOVIES_FILE      = path.resolve("./movies.json");
const COLLECTIONS_FILE = path.resolve("./collections.json");
const SERIES_FILE      = path.resolve("./series.json");

// TMDB key — set this as an env variable in Railway (Settings → Variables)
// Fall back to the hardcoded key if the env var isn't set yet
const TMDB_KEY  = process.env.TMDB_KEY || "d67317159cbc25bdad2a79e81f06265d";
const TMDB_API  = "https://api.themoviedb.org/3";
const TMDB_IMG  = "https://image.tmdb.org/t/p";

app.use(cors());
app.use(express.json());

/* ===================== In-memory cache ===================== */
const _memCache = {};

async function readJSON(file, fallback) {
  if (_memCache[file]) return _memCache[file];
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw || JSON.stringify(fallback));
    _memCache[file] = parsed;
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJSON(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
  _memCache[file] = data;
}

/* ===================== Validation helpers ===================== */
function badRequest(msg) { const e = new Error(msg); e.status = 400; throw e; }
function requireId(val) { if (typeof val !== "string" || !val.trim()) badRequest("id must be a non-empty string"); }
function requireStr(val, name) { if (typeof val !== "string" || !val.trim()) badRequest(`${name} must be a non-empty string`); }

/* ===================== Root ===================== */
app.get("/", (req, res) => res.send("SC Files Backend is Active 🚀"));

/* ===================== Movies ===================== */
app.get("/api/movies", async (req, res, next) => {
  try {
    const movies = await readJSON(MOVIES_FILE, []);
    const limit  = parseInt(req.query.limit)  || movies.length;
    const offset = parseInt(req.query.offset) || 0;
    res.json(movies.slice(offset, offset + limit));
  } catch (err) { next(err); }
});

app.post("/api/movies", async (req, res, next) => {
  try {
    const movies = await readJSON(MOVIES_FILE, []);
    const { position = "bottom", ...movie } = req.body;
    requireId(movie.id);
    const index = movies.findIndex(m => m.id === movie.id);
    if (index >= 0) {
      movies[index] = { ...movies[index], ...movie };
      if (position === "top") { const [item] = movies.splice(index, 1); movies.unshift(item); }
    } else {
      position === "top" ? movies.unshift(movie) : movies.push(movie);
    }
    await writeJSON(MOVIES_FILE, movies);
    res.json({ success: true, count: movies.length });
  } catch (err) { next(err); }
});

app.delete("/api/movies/:id", async (req, res, next) => {
  try {
    const movies   = await readJSON(MOVIES_FILE, []);
    const filtered = movies.filter(m => m.id !== req.params.id);
    if (movies.length === filtered.length) return res.status(404).json({ error: "Movie not found" });
    await writeJSON(MOVIES_FILE, filtered);
    res.json({ success: true, count: filtered.length });
  } catch (err) { next(err); }
});

/* ===================== Series ===================== */
app.get("/api/series", async (req, res, next) => {
  try {
    const series = await readJSON(SERIES_FILE, []);
    const limit  = parseInt(req.query.limit)  || series.length;
    const offset = parseInt(req.query.offset) || 0;
    res.json(series.slice(offset, offset + limit));
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
    const series    = await readJSON(SERIES_FILE, []);
    const newSeries = req.body;
    requireId(newSeries.id);
    if (newSeries.seasons !== undefined && !Array.isArray(newSeries.seasons))
      badRequest("seasons must be an array");
    const index = series.findIndex(s => s.id === newSeries.id);
    if (index >= 0) series.splice(index, 1);
    series.unshift(newSeries);
    await writeJSON(SERIES_FILE, series);
    res.json({ success: true, count: series.length });
  } catch (err) { next(err); }
});

app.delete("/api/series/:id", async (req, res, next) => {
  try {
    const series   = await readJSON(SERIES_FILE, []);
    const filtered = series.filter(s => s.id !== req.params.id);
    if (series.length === filtered.length) return res.status(404).json({ error: "Series not found" });
    await writeJSON(SERIES_FILE, filtered);
    res.json({ success: true, count: filtered.length });
  } catch (err) { next(err); }
});

/* ===================== Collections ===================== */
app.get("/api/collections", async (req, res, next) => {
  try { res.json(await readJSON(COLLECTIONS_FILE, {})); }
  catch (err) { next(err); }
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
    const collections = await readJSON(COLLECTIONS_FILE, {});
    const { id, name, banner, "bg-music": bgMusic, movies = [] } = req.body;
    requireId(id);
    requireStr(name, "name");
    if (!Array.isArray(movies)) badRequest("movies must be an array");
    const { [id]: _, ...rest } = collections;
    const updated = { [id]: { name: name.trim(), banner: banner || "", "bg-music": bgMusic || "", movies }, ...rest };
    await writeJSON(COLLECTIONS_FILE, updated);
    res.json({ success: true, total: Object.keys(updated).length });
  } catch (err) { next(err); }
});

app.delete("/api/collections/:id", async (req, res, next) => {
  try {
    const collections = await readJSON(COLLECTIONS_FILE, {});
    if (!collections[req.params.id]) return res.status(404).json({ error: "Collection not found" });
    delete collections[req.params.id];
    await writeJSON(COLLECTIONS_FILE, collections);
    res.json({ success: true, total: Object.keys(collections).length });
  } catch (err) { next(err); }
});

/* ===================== TMDB API Proxy =====================
 *
 * Fixes DNS blocking issues: instead of the browser calling
 * api.themoviedb.org directly (which gets blocked by AdGuard,
 * Pi-hole, ISP filters etc.), it calls this backend which is
 * already trusted. The backend then fetches from TMDB server-side.
 *
 * Usage from frontend:
 *   GET /api/tmdb?endpoint=/movie/123
 *   GET /api/tmdb?endpoint=/tv/456
 *   GET /api/tmdb?endpoint=/movie/123&append_to_response=credits
 *   GET /api/tmdb?endpoint=/tv/789/season/1/episode/2
 *
 * Responses are cached for 1 hour (stale-while-revalidate 24h).
 * ============================================================ */
app.get("/api/tmdb", async (req, res, next) => {
  try {
    const { endpoint, ...rest } = req.query;

    // Validate: must be a TMDB API path
    if (!endpoint || typeof endpoint !== "string" || !endpoint.startsWith("/") || endpoint.includes("..")) {
      return res.status(400).json({ error: "Invalid endpoint parameter" });
    }

    // Forward any extra query params (e.g. append_to_response, language)
    const params = new URLSearchParams({
      api_key: TMDB_KEY,
      language: "en-US",
      ...rest,
    });

    const tmdbUrl = `${TMDB_API}${endpoint}?${params}`;

    const response = await fetch(tmdbUrl, {
      headers: { "User-Agent": "SCFiles-Backend/2.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "TMDB returned an error", status: response.status });
    }

    const data = await response.json();

    // Don't cache TMDB error objects (status_code means TMDB reported an error)
    if (data.status_code) {
      return res.status(404).json({ error: data.status_message || "Not found" });
    }

    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.setHeader("Content-Type", "application/json");
    res.json(data);

  } catch (err) {
    console.error("[/api/tmdb]", err.message);
    next(err);
  }
});

/* ===================== TMDB Image Proxy =====================
 *
 * Same DNS fix for images. Streams the image from TMDB through
 * this backend so the browser never touches image.tmdb.org.
 *
 * Usage from frontend:
 *   <img src="/api/img?path=/abc123.jpg&w=500">
 *   <img src="/api/img?path=/xyz.jpg&w=1280">
 *
 * Supported widths: 92, 154, 185, 342, 500, 780, 1280, original
 * Images are cached for 7 days (they never change on TMDB).
 * ============================================================ */

const ALLOWED_WIDTHS = new Set(["92", "154", "185", "342", "500", "780", "1280", "original"]);

app.get("/api/img", async (req, res, next) => {
  try {
    const { path: imgPath, w = "500" } = req.query;

    // Validate path
    if (!imgPath || typeof imgPath !== "string" || !imgPath.startsWith("/") || imgPath.includes("..")) {
      return res.status(400).send("Invalid image path");
    }

    // Sanitise width
    const width = ALLOWED_WIDTHS.has(String(w)) ? String(w) : "500";
    const imgUrl = `${TMDB_IMG}/w${width}${imgPath}`;

    const response = await fetch(imgUrl, {
      headers: { "User-Agent": "SCFiles-Backend/2.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return res.status(response.status).send("Image not found");
    }

    // Forward content type
    const contentType = response.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);

    // Images on TMDB are immutable (path includes a hash), safe to cache forever
    res.setHeader("Cache-Control", "public, max-age=604800, immutable"); // 7 days

    // Stream directly — don't buffer the whole image in memory
    const reader = response.body.getReader();
    const stream = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    };
    await stream();

  } catch (err) {
    console.error("[/api/img]", err.message);
    // Don't call next(err) — just send a 502 so the browser can try a fallback
    if (!res.headersSent) res.status(502).send("Image proxy error");
  }
});

/* ===================== Error Handler ===================== */
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error("Server Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`Backend live on port ${PORT}`));
