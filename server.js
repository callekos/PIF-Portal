// server.js - Lokal utvecklingsserver + API för kanban.json
const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// === Viktigt: peka uttryckligen på portal/data ===
const ROOT        = __dirname;
const PUBLIC_DIR  = path.join(ROOT, "portal");           // <-- /portal
const DATA_DIR    = path.join(PUBLIC_DIR, "data");        // <-- /portal/data
const KANBAN_FILE = path.join(DATA_DIR, "kanban.json");   // <-- /portal/data/kanban.json

// Logga så vi ser exakt var servern ligger och skriver
console.log("[server] ROOT       =", ROOT);
console.log("[server] PUBLIC_DIR =", PUBLIC_DIR);
console.log("[server] DATA_DIR   =", DATA_DIR);
console.log("[server] KANBAN_FILE=", KANBAN_FILE);

// Statisk portal (så /kanban/ och /data/mock/* funkar)
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

// GET: läs Normal
app.get("/api/kanban", async (_req, res) => {
  try {
    const buf = await fs.readFile(KANBAN_FILE);
    res.type("application/json").send(buf);
  } catch (err) {
    if (err.code === "ENOENT") return res.status(404).send("Not Found");
    console.error("[GET /api/kanban] error:", err);
    res.status(500).send("Server error");
  }
});

// PUT: spara Normal
app.put("/api/kanban", async (req, res) => {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const json = JSON.stringify(req.body ?? {}, null, 2);
    await fs.writeFile(KANBAN_FILE, json, "utf8");
    res.status(204).end();
  } catch (err) {
    console.error("[PUT /api/kanban] error:", err);
    res.status(500).send("Server error");
  }
});

app.listen(PORT, () => {
  console.log("=================================");
  console.log("Startar Kanban-server lokalt …");
  console.log("Öppna:  http://localhost:" + PORT + "/kanban/");
  console.log("API:    GET/PUT /api/kanban  ->", KANBAN_FILE);
  console.log("=================================");
});
