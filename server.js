import express from "express";
import cors from "cors";
import { promises as fs } from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

const MOVIES_FILE = path.resolve("./movies.json");
const COLLECTIONS_FILE = path.resolve("./collections.json");
const SERIES_FILE = path.resolve("./series.json"); // ✅ NEW

app.use(cors());
app.use(express.json());

/* ===================== Helpers ===================== */

async function readJSON(file, fallback) {
  try {
    const data = await fs.readFile(file, "utf-8");
    return JSON.parse(data || JSON.stringify(fallback));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJSON(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

/* ===================== Root ===================== */

app.get("/", (req, res) => {
  res.send("SC Files Backend is Active 🚀");
});

/* ===================== Movies API (UNCHANGED) ===================== */

app.get("/api/movies", async (req, res, next) => {
  try {
    res.json(await readJSON(MOVIES_FILE, []));
  } catch (err) {
    next(err);
  }
});

app.post("/api/movies", async (req, res, next) => {
  try {
    const movies = await readJSON(MOVIES_FILE, []);
    const { position = "bottom", ...movie } = req.body;

    if (!movie.id) {
      return res.status(400).json({ error: "Movie ID required" });
    }

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
  } catch (err) {
    next(err);
  }
});

app.delete("/api/movies/:id", async (req, res, next) => {
  try {
    const movies = await readJSON(MOVIES_FILE, []);
    const filtered = movies.filter(m => m.id !== req.params.id);

    if (movies.length === filtered.length) {
      return res.status(404).json({ error: "Movie not found" });
    }

    await writeJSON(MOVIES_FILE, filtered);
    res.json({ success: true, count: filtered.length });
  } catch (err) {
    next(err);
  }
});

/* ===================== Series API (NEW - SAFE) ===================== */

// Get all series
app.get("/api/series", async (req, res, next) => {
  try {
    res.json(await readJSON(SERIES_FILE, []));
  } catch (err) {
    next(err);
  }
});

// Get single series by id
app.get("/api/series/:id", async (req, res, next) => {
  try {
    const series = await readJSON(SERIES_FILE, []);
    const item = series.find(s => s.id === req.params.id);

    if (!item) {
      return res.status(404).json({ error: "Series not found" });
    }

    res.json(item);
  } catch (err) {
    next(err);
  }
});

// Add or Update series (ALWAYS MOVE TO TOP)
app.post("/api/series", async (req, res, next) => {
  try {
    const series = await readJSON(SERIES_FILE, []);
    const newSeries = req.body;

    if (!newSeries.id) {
      return res.status(400).json({ error: "Series ID required" });
    }

    const index = series.findIndex(s => s.id === newSeries.id);

    if (index >= 0) {
      // Remove old entry
      series.splice(index, 1);
    }

    // Always add to top
    series.unshift(newSeries);

    await writeJSON(SERIES_FILE, series);
    res.json({ success: true, count: series.length });

  } catch (err) {
    next(err);
  }
});

// Delete series
app.delete("/api/series/:id", async (req, res, next) => {
  try {
    const series = await readJSON(SERIES_FILE, []);
    const filtered = series.filter(s => s.id !== req.params.id);

    if (series.length === filtered.length) {
      return res.status(404).json({ error: "Series not found" });
    }

    await writeJSON(SERIES_FILE, filtered);
    res.json({ success: true, count: filtered.length });
  } catch (err) {
    next(err);
  }
});

/* ===================== Collections API (UNCHANGED) ===================== */

app.get("/api/collections", async (req, res, next) => {
  try {
    res.json(await readJSON(COLLECTIONS_FILE, {}));
  } catch (err) {
    next(err);
  }
});

app.get("/api/collections/:id", async (req, res, next) => {
  try {
    const collections = await readJSON(COLLECTIONS_FILE, {});
    const collection = collections[req.params.id];

    if (!collection) {
      return res.status(404).json({ error: "Collection not found" });
    }

    res.json(collection);
  } catch (err) {
    next(err);
  }
});

app.post("/api/collections", async (req, res, next) => {
  try {
    const collections = await readJSON(COLLECTIONS_FILE, {});
    const { id, name, banner, "bg-music": bgMusic, movies = [] } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: "Collection id and name required" });
    }

    collections[id] = {
      name,
      banner: banner || "",
      "bg-music": bgMusic || "",
      movies
    };

    await writeJSON(COLLECTIONS_FILE, collections);

    res.json({
      success: true,
      total: Object.keys(collections).length
    });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/collections/:id", async (req, res, next) => {
  try {
    const collections = await readJSON(COLLECTIONS_FILE, {});

    if (!collections[req.params.id]) {
      return res.status(404).json({ error: "Collection not found" });
    }

    delete collections[req.params.id];

    await writeJSON(COLLECTIONS_FILE, collections);

    res.json({
      success: true,
      total: Object.keys(collections).length
    });
  } catch (err) {
    next(err);
  }
});

/* ===================== Error Handler ===================== */

app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

/* ===================== Start ===================== */

app.listen(PORT, () => {
  console.log(`Backend live on port ${PORT}`);
});
