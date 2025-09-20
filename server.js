const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

// Statiska filer för portal (landningssida)
const portalPath = path.join(__dirname, "portal");
app.use(express.static(portalPath));

// Statiska filer för kanban
const kanbanPath = path.join(__dirname, "kanban", "public");
app.use("/kanban", express.static(kanbanPath));

// Root → portal/index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(portalPath, "index.html"));
});

// Starta servern
app.listen(port, () => {
  console.log(`Server kör på http://localhost:${port}`);
  console.log(`Portal nås på http://localhost:${port}/`);
  console.log(`Kanban nås på http://localhost:${port}/kanban/`);
});
