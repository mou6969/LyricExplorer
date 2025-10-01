import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import expressLayouts from "express-ejs-layouts";

dotenv.config();

const app = express();
const GENIUS_API = "https://api.genius.com";

app.set("view engine", "ejs");
app.use(expressLayouts);
app.set("layout", "partials/layout");
app.use(express.static("public"));

// Default title middleware (prevents "title is not defined")
app.use((req, res, next) => {
  res.locals.title = "Lyric Explorer"; 
  next();
});

// Homepage
app.get("/", (req, res) => {
  res.render("index", { title: "Home" });
});

// Search Route
app.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.redirect("/");
  }

  try {
    const response = await axios.get(`${GENIUS_API}/search`, {
      headers: { Authorization: `Bearer ${process.env.GENIUS_API_KEY}` },
      params: { q: query }
    });

    const hits = response.data.response.hits;

    const results = hits.map(hit => ({
      id: hit.result.id,
      title: hit.result.full_title,
      artist: hit.result.primary_artist.name,
      image: hit.result.song_art_image_thumbnail_url
    }));

    res.render("search", { title: `Results for "${query}"`, query, results });
  } catch (error) {
    console.error(error.message);
    res.render("search", { title: "Error", query, results: [] });
  }
});

app.get("/song/:id", async (req, res) => {
  const songId = req.params.id;
  try {
    // 1. Song metadata
    const songResponse = await axios.get(`${GENIUS_API}/songs/${songId}`, {
      headers: { Authorization: `Bearer ${process.env.GENIUS_API_KEY}` }
    });
    const song = songResponse.data.response.song;

    // 2. Scrape lyrics
    const lyricsPage = await axios.get(song.url);
    const $ = cheerio.load(lyricsPage.data);

    let rawLyrics = [];
    $('div[data-lyrics-container="true"]').each((i, el) => {
      let blockText = $(el)
        .html()
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")       
        .trim();

      if (blockText) {
        rawLyrics.push(blockText);
      }
    });

    // Merge into one string
    let lyrics = rawLyrics.join("\n\n");

    // Find where actual lyrics start ([Intro], [Verse], [Chorus], etc.)
    const startMatch = lyrics.match(/(\[Intro\]|\[Verse.*?\]|\[Chorus\])/i);
    if (startMatch) {
      const startIndex = lyrics.indexOf(startMatch[0]);
      lyrics = lyrics.slice(startIndex).trim();
    }

    // Ensure fallback if nothing valid found
    if (!lyrics.trim()) {
      lyrics = "Lyrics unavailable. View on Genius instead.";
    }

    res.render("song", {
      title: song.full_title,
      artist: song.primary_artist.name,
      image: song.song_art_image_url,
      album: song.album ? song.album.name : "Single",
      releaseDate: song.release_date || "Unknown",
      url: song.url,
      lyrics
    });
  } catch (error) {
    console.error(error.message);
    res.render("song", { title: "Error", lyrics: "Could not fetch song details." });
  }
});



app.listen(3000, () => console.log("Server running at http://localhost:3000"));
