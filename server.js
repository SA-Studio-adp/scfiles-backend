import express from "express";
import fs from "fs";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = "./movies.json";

// middleware
app.use(cors());
app.use(express.json());

// helper functions
function readMovies() {
  if (!fs.existsSync(DATA_FILE)) return {};
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function writeMovies(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// health check
app.get("/", (req, res) => {
  res.send("SC Files Backend is running");
});

// GET all movies
app.get("/api/movies", (req, res) => {
  const movies = readMovies();
  res.json(movies);
});

// GET single movie
app.get("/api/movies/:id", (req, res) => {
  const movies = readMovies();
  const movie = movies[req.params.id];

  if (!movie) {
    return res.status(404).json({ error: "Movie not found" });
  }

  res.json(movie);
});

// ADD or UPDATE movie
app.post("/api/movies", (req, res) => {
  const movies = readMovies();
  const movie = req.body;

  if (!movie.id) {
    return res.status(400).json({ error: "Movie ID required" });
  }

  movies[movie.id] = movie;
  writeMovies(movies);

  res.json({ success: true, id: movie.id });
});

// DELETE movie (optional but powerful)
app.delete("/api/movies/:id", (req, res) => {
  const movies = readMovies();

  if (!movies[req.params.id]) {
    return res.status(404).json({ error: "Movie not found" });
  }

  delete movies[req.params.id];
  writeMovies(movies);

  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`SC Files backend running on port ${PORT}`);
});
