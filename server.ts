import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const db = new Database("pantry.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    language TEXT DEFAULT 'English'
  );

  CREATE TABLE IF NOT EXISTS pantry_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS liked_recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    recipe_name TEXT NOT NULL,
    recipe_content TEXT NOT NULL,
    food_item TEXT NOT NULL,
    liked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Auth Routes
  app.post("/api/auth/signup", (req, res) => {
    const { email, password, language } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO users (email, password, language) VALUES (?, ?, ?)");
      const info = stmt.run(email, password, language || 'English');
      res.json({ id: info.lastInsertRowid, email, language });
    } catch (e: any) {
      res.status(400).json({ error: "Email already exists" });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password) as any;
    if (user) {
      res.json({ id: user.id, email: user.email, language: user.language });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // Pantry Routes
  app.get("/api/pantry/:userId", (req, res) => {
    const items = db.prepare("SELECT * FROM pantry_items WHERE user_id = ? ORDER BY expiry_date ASC").all(req.params.userId);
    res.json(items);
  });

  app.post("/api/pantry", (req, res) => {
    const { userId, name, expiryDate } = req.body;
    const stmt = db.prepare("INSERT INTO pantry_items (user_id, name, expiry_date) VALUES (?, ?, ?)");
    const info = stmt.run(userId, name, expiryDate);
    res.json({ id: info.lastInsertRowid, userId, name, expiryDate });
  });

  app.delete("/api/pantry/:id", (req, res) => {
    db.prepare("DELETE FROM pantry_items WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Liked Recipes
  app.get("/api/liked/:userId", (req, res) => {
    const items = db.prepare("SELECT * FROM liked_recipes WHERE user_id = ?").all(req.params.userId);
    res.json(items);
  });

  app.post("/api/liked", (req, res) => {
    const { userId, recipeName, recipeContent, foodItem } = req.body;
    const stmt = db.prepare("INSERT INTO liked_recipes (user_id, recipe_name, recipe_content, food_item) VALUES (?, ?, ?, ?)");
    const info = stmt.run(userId, recipeName, recipeContent, foodItem);
    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/liked/:id", (req, res) => {
    db.prepare("DELETE FROM liked_recipes WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
