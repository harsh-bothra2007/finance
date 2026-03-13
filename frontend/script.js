const express = require("express");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const cors = require("cors");

const app = express();
const PORT = 3000;
const SECRET = "mysecret123";

app.use(express.json());
app.use(cors());

const db = new Database("finance.db");

/* ---------- TABLES ---------- */
db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT,
  amount INTEGER,
  category TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

/* ---------- CATEGORY NORMALIZER ---------- */
function normalizeCategory(category) {
  if (!category) return "";
  category = category.trim().toLowerCase();
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/* ---------- AUTH ---------- */
function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token required" });

  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token" });
    req.user = user;
    next();
  });
}

/* ---------- REGISTER ---------- */
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  try {
    db.prepare(
      "INSERT INTO users (username, password) VALUES (?, ?)"
    ).run(username, password);
    res.json({ message: "User registered successfully" });
  } catch {
    res.status(400).json({ error: "Username already exists" });
  }
});

/* ---------- LOGIN ---------- */
async function login() {

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();

  if (res.ok) {
    localStorage.setItem("token", data.token);   // ✅ SAVE TOKEN
    window.location.href = "dashboard.html";     // Redirect
  } else {
    alert(data.error);
  }
}

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const user = db
    .prepare("SELECT * FROM users WHERE username=? AND password=?")
    .get(username, password);

  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { userId: user.id, username: user.username },
    SECRET,
    { expiresIn: "1h" }
  );

  res.json({ message: "Login successful", token });
});

/* ---------- ADD EXPENSE ---------- */
app.post("/expenses", authenticateToken, (req, res) => {
  let { title, amount, category } = req.body;
  category = normalizeCategory(category);

  db.prepare(`
    INSERT INTO expenses (user_id, title, amount, category)
    VALUES (?, ?, ?, ?)
  `).run(req.user.userId, title, amount, category);

  res.json({ message: "Expense added successfully" });
});

/* ---------- GET EXPENSES (MONTH) ---------- */
app.get("/expenses", authenticateToken, (req, res) => {
  const { month, year } = req.query;

  const expenses = db.prepare(`
    SELECT id, title, amount, category
    FROM expenses
    WHERE user_id=?
    AND strftime('%m', created_at)=?
    AND strftime('%Y', created_at)=?
  `).all(
    req.user.userId,
    month.padStart(2, "0"),
    year
  );

  res.json(expenses);
});

/* ---------- UPDATE ---------- */
app.put("/expenses/:id", authenticateToken, (req, res) => {
  let { title, amount, category } = req.body;
  category = normalizeCategory(category);

  db.prepare(`
    UPDATE expenses
    SET title=?, amount=?, category=?
    WHERE id=? AND user_id=?
  `).run(title, amount, category, req.params.id, req.user.userId);

  res.json({ message: "Expense updated successfully" });
});

/* ---------- DELETE ---------- */
app.delete("/expenses/:id", authenticateToken, (req, res) => {
  db.prepare(
    "DELETE FROM expenses WHERE id=? AND user_id=?"
  ).run(req.params.id, req.user.userId);

  res.json({ message: "Expense deleted" });
});

/* ---------- CATEGORY SUMMARY (FOR PIE) ---------- */
app.get("/category-summary", authenticateToken, (req, res) => {
  const { month, year } = req.query;

  const summary = db.prepare(`
    SELECT category, SUM(amount) as total
    FROM expenses
    WHERE user_id=?
    AND strftime('%m', created_at)=?
    AND strftime('%Y', created_at)=?
    GROUP BY category
  `).all(
    req.user.userId,
    month.padStart(2, "0"),
    year
  );

  res.json(summary);
});

/* ---------- MONTHLY TOTALS (FOR BAR) ---------- */
app.get("/monthly-summary", authenticateToken, (req, res) => {
  const { year } = req.query;

  const rows = db.prepare(`
    SELECT strftime('%m', created_at) AS month, SUM(amount) AS total
    FROM expenses
    WHERE user_id=?
    AND strftime('%Y', created_at)=?
    GROUP BY month
  `).all(req.user.userId, year);

  res.json(rows);
});

/* ---------- SERVER ---------- */
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});