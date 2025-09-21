// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 3000;
const root = __dirname;

// Paths
const portalPath = path.join(root, "portal");
const kanbanStaticPath = path.join(root, "apps", "kanban", "public");
const dataDir = path.join(root, "data");
const dataFile = path.join(dataDir, "kanban.json");

// Middleware
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => { res.setHeader("charset", "utf-8"); next(); });

// Ensure data file exists
function ensureData() {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, "[]", "utf8");
  } catch (e) {
    console.error("Init data error:", e);
  }
}
ensureData();

// Static routes
app.use(express.static(portalPath));                // /
app.use("/kanban", express.static(kanbanStaticPath)); // /kanban

// Root -> portal (fallback om portal saknas)
app.get("/", (req, res) => {
  const file = path.join(portalPath, "index.html");
  if (fs.existsSync(file)) return res.sendFile(file);
  res
    .status(200)
    .send(`<!doctype html><meta charset="utf-8">
      <h1>PIF-portalen</h1><p><a href="/kanban/">Öppna Kanban</a></p>`);
});

// ---- Kanban API (MATCHAR DIN FRONTEND) ----
// GET /load  -> returnera hela JSON:en
app.get("/load", (_req, res) => {
  fs.readFile(dataFile, "utf8", (err, txt) => {
    if (err) {
      console.error("READ /load:", err);
      return res.status(500).json({ error: "Kunde inte läsa datafil" });
    }
    try {
      const json = txt?.trim() ? JSON.parse(txt) : [];
      return res.json(json);
    } catch (e) {
      console.error("PARSE /load:", e);
      return res.status(500).json({ error: "Ogiltig JSON i datafil" });
    }
  });
});

// POST /save  -> spara hela JSON:en (req.body)
app.post("/save", (req, res) => {
  const text = JSON.stringify(req.body, null, 2);
  fs.writeFile(dataFile, text, "utf8", (err) => {
    if (err) {
      console.error("WRITE /save:", err);
      return res.status(500).json({ error: "Kunde inte spara datafil" });
    }
    return res.status(200).json({ success: true });
  });
});

// ---- Alias som vi kan använda framåt om du vill byta i frontend ----
app.get("/api/kanban", (_req, res) => {
  res.redirect(307, "/load");
});
app.post("/api/kanban", (req, res) => {
  // 307 gör att metoden + body behålls, men för enkelhet skriver vi direkt här:
  const text = JSON.stringify(req.body, null, 2);
  fs.writeFile(dataFile, text, "utf8", (err) => {
    if (err) return res.status(500).json({ error: "Kunde inte spara datafil" });
    return res.json({ success: true });
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server kör på  http://localhost:${port}`);
  console.log(`Portal:       http://localhost:${port}/`);
  console.log(`Kanban:       http://localhost:${port}/kanban/`);
  console.log(`API:          GET /load   | POST /save  (alias: /api/kanban)`);
});
