import express from "express";
import cors from "cors";
import { promises as fs } from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.resolve("./movies.json");

app.use(cors());
app.use(express.json());

/* ===================== Helpers ===================== */

async function readMovies() {
  try {
    const data = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(data || "[]");
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function writeMovies(movies) {
  await fs.writeFile(DATA_FILE, JSON.stringify(movies, null, 2));
}

/* ===================== Routes ===================== */

app.get("/", (req, res) => {
  res.send("SC Files Backend is Active 🚀");
});

app.get("/api/movies", async (req, res, next) => {
  try {
    const movies = await readMovies();
    res.json(movies);
  } catch (err) {
    next(err);
  }
});

app.post("/api/movies", async (req, res, next) => {
  try {
    const movies = await readMovies();

    // Extract position WITHOUT saving it
    const { position = "bottom", ...movie } = req.body;

    if (!movie.id || typeof movie.id !== "string") {
      return res.status(400).json({ error: "Movie ID (slug) is required" });
    }

    const index = movies.findIndex(m => m.id === movie.id);

    if (index >= 0) {
      // Update existing movie (merge, don’t overwrite)
      movies[index] = { ...movies[index], ...movie };

      // Optional: move updated movie if position is provided
      if (position === "top") {
        const [item] = movies.splice(index, 1);
        movies.unshift(item);
      }

      console.log(`Updated: ${movie.id}`);
    } else {
      // Insert new movie at requested position
      if (position === "top") {
        movies.unshift(movie);
        console.log(`Inserted at TOP: ${movie.id}`);
      } else {
        movies.push(movie);
        console.log(`Inserted at BOTTOM: ${movie.id}`);
      }
    }

    await writeMovies(movies);

    res.json({
      success: true,
      count: movies.length,
      id: movie.id
    });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/movies/:id", async (req, res, next) => {
  try {
    const movies = await readMovies();
    const filtered = movies.filter(m => m.id !== req.params.id);

    if (movies.length === filtered.length) {
      return res.status(404).json({ error: "Movie not found" });
    }

    await writeMovies(filtered);
    console.log(`Deleted: ${req.params.id}`);

    res.json({
      success: true,
      count: filtered.length
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
