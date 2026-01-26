import express from "express";
import fs from "fs";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = "./movies.json";

app.use(cors());
app.use(express.json());

function readMovies() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function writeMovies(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.get("/", (req, res) => {
  res.send("SC Files Backend running");
});

app.get("/api/movies", (req, res) => {
  res.json(readMovies());
});

app.get("/api/movies/:id", (req, res) => {
  const movies = readMovies();
  const movie = movies.find(m => m.id === req.params.id);
  if (!movie) return res.status(404).json({ error: "Not found" });
  res.json(movie);
});

app.post("/api/movies", (req, res) => {
  const movies = readMovies();
  const movie = req.body;

  if (!movie.id) {
    return res.status(400).json({ error: "Movie ID required" });
  }

  const index = movies.findIndex(m => m.id === movie.id);
  if (index >= 0) movies[index] = movie;
  else movies.push(movie);

  writeMovies(movies);
  res.json({ success: true });
});

app.delete("/api/movies/:id", (req, res) => {
  const movies = readMovies().filter(m => m.id !== req.params.id);
  writeMovies(movies);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
