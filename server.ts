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
    language TEXT DEFAULT 'English',
    reminder_days INTEGER DEFAULT 7,
    notification_frequency TEXT DEFAULT 'daily'
  );

  CREATE TABLE IF NOT EXISTS pantry_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    used_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
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

// Migration for existing users table
try {
  db.prepare("ALTER TABLE users ADD COLUMN reminder_days INTEGER DEFAULT 7").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE pantry_items ADD COLUMN used_count INTEGER DEFAULT 0").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE pantry_items ADD COLUMN status TEXT DEFAULT 'active'").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE users ADD COLUMN notification_frequency TEXT DEFAULT 'daily'").run();
} catch (e) {}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Auth Routes
  app.post("/api/auth/signup", (req, res) => {
    const { email, password, language } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    try {
      const stmt = db.prepare("INSERT INTO users (email, password, language, reminder_days, notification_frequency) VALUES (?, ?, ?, ?, ?)");
      const info = stmt.run(email, password, language || 'English', 7, 'daily');
      res.json({ id: info.lastInsertRowid, email, language: language || 'English', reminderDays: 7, notificationFrequency: 'daily' });
    } catch (e: any) {
      res.status(400).json({ error: "Email already exists" });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    try {
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
      if (!user) {
        return res.status(404).json({ error: "No account found with this email. Please create an account." });
      }
      if (user.password !== password) {
        return res.status(401).json({ error: "Incorrect password. Please try again." });
      }
      res.json({ 
        id: user.id, 
        email: user.email, 
        language: user.language, 
        reminderDays: user.reminder_days,
        notificationFrequency: user.notification_frequency || 'daily'
      });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Pantry Routes
  app.get("/api/pantry/:userId", (req, res) => {
    const items = db.prepare("SELECT * FROM pantry_items WHERE user_id = ? ORDER BY expiry_date ASC").all(req.params.userId);
    res.json(items);
  });

  app.post("/api/pantry", (req, res) => {
    const { userId, name, expiryDate } = req.body;
    const stmt = db.prepare("INSERT INTO pantry_items (user_id, name, expiry_date, used_count, status) VALUES (?, ?, ?, 0, 'active')");
    const info = stmt.run(userId, name, expiryDate);
    res.json({ id: info.lastInsertRowid, userId, name, expiryDate, used_count: 0, status: 'active' });
  });

  app.patch("/api/pantry/:id", (req, res) => {
    const { used_count, status } = req.body;
    if (used_count !== undefined) {
      db.prepare("UPDATE pantry_items SET used_count = ? WHERE id = ?").run(used_count, req.params.id);
    }
    if (status !== undefined) {
      db.prepare("UPDATE pantry_items SET status = ? WHERE id = ?").run(status, req.params.id);
    }
    res.json({ success: true });
  });

  app.post("/api/pantry/bulk-update", (req, res) => {
    const { items } = req.body;
    const update = db.prepare("UPDATE pantry_items SET name = ?, used_count = ?, status = ? WHERE id = ?");
    const transaction = db.transaction((items) => {
      for (const item of items) {
        update.run(item.name, item.used_count || 0, item.status || 'active', item.id);
      }
    });
    transaction(items);
    res.json({ success: true });
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

  // User Settings
  app.patch("/api/user/:id", (req, res) => {
    const { language, reminderDays, notificationFrequency } = req.body;
    try {
      if (language !== undefined) {
        db.prepare("UPDATE users SET language = ? WHERE id = ?").run(language, req.params.id);
      }
      if (reminderDays !== undefined) {
        db.prepare("UPDATE users SET reminder_days = ? WHERE id = ?").run(reminderDays, req.params.id);
      }
      if (notificationFrequency !== undefined) {
        db.prepare("UPDATE users SET notification_frequency = ? WHERE id = ?").run(notificationFrequency, req.params.id);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to update settings" });
    }
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
