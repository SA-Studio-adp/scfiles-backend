import express from "express";
import fs from "fs";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = "./movies.json";

app.use(cors());
app.use(express.json());

function readMovies() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const data = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(data || "[]");
  } catch (err) {
    console.error("Read Error:", err);
    return [];
  }
}

function writeMovies(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error("Write Error:", err);
    return false;
  }
}

app.get("/", (req, res) => {
  res.send("SC Files Backend is Active");
});

app.get("/api/movies", (req, res) => {
  res.json(readMovies());
});

app.post("/api/movies", (req, res) => {
  const movies = readMovies();
  const movie = req.body;
  const position = req.body.position || 'bottom';

  if (!movie.id) {
    return res.status(400).json({ error: "Movie ID (slug) is required" });
  }

  const index = movies.findIndex(m => m.id === movie.id);

  if (index >= 0) {
    // Update existing entry
    movies[index] = movie;
    console.log(`Updated: ${movie.id}`);
  } else {
    // Add new entry based on requested position
    if (position === 'top') {
      movies.unshift(movie);
      console.log(`Inserted at TOP: ${movie.id}`);
    } else {
      movies.push(movie);
      console.log(`Appended to BOTTOM: ${movie.id}`);
    }
  }

  const success = writeMovies(movies);
  
  if (success) {
    res.json({ 
      success: true, 
      count: movies.length, 
      message: `Successfully saved ${movie.id}` 
    });
  } else {
    res.status(500).json({ error: "Failed to write to database file" });
  }
});

app.delete("/api/movies/:id", (req, res) => {
  const initialMovies = readMovies();
  const filteredMovies = initialMovies.filter(m => m.id !== req.params.id);
  
  if (initialMovies.length === filteredMovies.length) {
    return res.status(404).json({ error: "Movie not found" });
  }

  writeMovies(filteredMovies);
  console.log(`Deleted: ${req.params.id}`);
  res.json({ success: true, count: filteredMovies.length });
});

app.listen(PORT, () => {
  console.log(`Backend live on port ${PORT}`);
});
