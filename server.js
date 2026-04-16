import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { promises as fs } from "fs";
import path from "path";

const app  = express();
const PORT = process.env.PORT || 3000;

const MOVIES_FILE      = path.resolve("./movies.json");
const COLLECTIONS_FILE = path.resolve("./collections.json");
const SERIES_FILE      = path.resolve("./series.json");

/* ===================== TMDB CONFIG ===================== */
const TMDB_KEY  = "d67317159cbc25bdad2a79e81f06265d";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/original"; // change to /original for HD

/* ===================== Middleware ===================== */
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

/* ===================== Cache ===================== */
const _memCache = {};

/* ===================== JSON Helpers ===================== */
async function readJSON(file, fallback) {
  try {
    if (_memCache[file]) return _memCache[file];

    const raw = await fs.readFile(file, "utf-8");
    const parsed = raw ? JSON.parse(raw) : fallback;

    _memCache[file] = parsed;
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    console.error("JSON Read Error:", err);
    return fallback;
  }
}

async function writeJSON(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
  _memCache[file] = data;
}

/* ===================== TMDB IMAGE FIX ===================== */
function attachImages(obj) {
  if (Array.isArray(obj)) return obj.map(attachImages);

  if (obj && typeof obj === "object") {
    const newObj = {};

    for (const key in obj) {
      const value = obj[key];

      if (
        (key === "poster_path" ||
         key === "backdrop_path" ||
         key === "profile_path") &&
        value
      ) {
        newObj[key] = TMDB_IMG + value;
      } else {
        newObj[key] = attachImages(value);
      }
    }

    return newObj;
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
    const reqPath = req.query.path;

    if (!reqPath) {
      return res.status(400).json({ error: "Missing path" });
    }

    const url =
      `${TMDB_BASE}${reqPath}${reqPath.includes("?") ? "&" : "?"}api_key=${TMDB_KEY}`;

    if (_memCache[url]) {
      return res.json(_memCache[url]);
    }

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(500).json({ error: "TMDB request failed" });
    }

    const data = await response.json();

    // 🔥 FIX: convert image paths to full URLs
    const finalData = attachImages(data);

    _memCache[url] = finalData;

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

  } catch (err) { next(err); }
});

app.delete("/api/movies/:id", async (req, res, next) => {
  try {
    const movies   = await readJSON(MOVIES_FILE, []);
    const filtered = movies.filter(m => m.id !== req.params.id);

    if (movies.length === filtered.length) {
      return res.status(404).json({ error: "Movie not found" });
    }

    await writeJSON(MOVIES_FILE, filtered);

    res.json({ success: true, count: filtered.length });

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

  } catch (err) { next(err); }
});

app.delete("/api/series/:id", async (req, res, next) => {
  try {
    const series   = await readJSON(SERIES_FILE, []);
    const filtered = series.filter(s => s.id !== req.params.id);

    if (series.length === filtered.length) {
      return res.status(404).json({ error: "Series not found" });
    }

    await writeJSON(SERIES_FILE, filtered);

    res.json({ success: true, count: filtered.length });

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

    if (!collection) {
      return res.status(404).json({ error: "Collection not found" });
    }

    res.json(collection);

  } catch (err) { next(err); }
});

app.post("/api/collections", async (req, res, next) => {
  try {
    const collections = await readJSON(COLLECTIONS_FILE, {});
    const { id, name, banner, "bg-music": bgMusic, movies = [] } = req.body;

    requireId(id);
    requireStr(name, "name");

    if (!Array.isArray(movies)) {
      badRequest("movies must be an array");
    }

    const { [id]: _, ...rest } = collections;

    const updated = {
      ...rest,
      [id]: {
        name: name.trim(),
        banner: banner || "",
        "bg-music": bgMusic || "",
        movies
      }
    };

    await writeJSON(COLLECTIONS_FILE, updated);

    res.json({ success: true, total: Object.keys(updated).length });

  } catch (err) { next(err); }
});

app.delete("/api/collections/:id", async (req, res, next) => {
  try {
    const collections = await readJSON(COLLECTIONS_FILE, {});

    if (!collections[req.params.id]) {
      return res.status(404).json({ error: "Collection not found" });
    }

    delete collections[req.params.id];

    await writeJSON(COLLECTIONS_FILE, collections);

    res.json({ success: true, total: Object.keys(collections).length });

  } catch (err) { next(err); }
});

/* ===================== Error Handler ===================== */
app.use((err, req, res, next) => {
  console.error("Server Error:", err);

  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  res.status(500).json({ error: "Internal server error" });
});

/* ===================== Start ===================== */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend live on port ${PORT}`);
});
