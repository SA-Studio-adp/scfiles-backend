import express from "express";
import cors from "cors";
import { promises as fs } from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

const MOVIES_FILE      = path.resolve("./movies.json");
const COLLECTIONS_FILE = path.resolve("./collections.json");
const SERIES_FILE      = path.resolve("./series.json");

/* 🔐 MOVE YOUR API KEY HERE ONLY */
const TMDB_KEY = "d67317159cbc25bdad2a79e81f06265d";
const TMDB_BASE = "https://api.themoviedb.org/3";

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

/* ===================== TMDB PROXY (🔥 FIX) ===================== */
app.get("/api/tmdb", async (req, res) => {
  try {
    const path = req.query.path;

    if (!path) {
      return res.status(400).json({ error: "Missing path" });
    }

    const url = `${TMDB_BASE}${path}&api_key=${TMDB_KEY}`;

    // Cache response
    if (_memCache[url]) {
      return res.json(_memCache[url]);
    }

    const response = await fetch(url);
    const data = await response.json();

    _memCache[url] = data;

    res.json(data);
  } catch (err) {
    console.error("TMDB Proxy Error:", err);
    res.status(500).json({ error: "TMDB fetch failed" });
  }
});

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

app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error("Server Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`Backend live on port ${PORT}`));
