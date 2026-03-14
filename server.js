const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const cors = require("cors");
require("dotenv").config();
const app = express();
const PORT = 3000;

if (!process.env.JWT_SECRET) {
  console.error("CRITICAL ERROR: JWT_SECRET is not defined in your .env file!");
  console.log("Please create a .env file and add: JWT_SECRET=your_secret_here");
  process.exit(1);
}

console.log("Starting server...");

// ---------- MIDDLEWARE ----------
app.use(cors());
app.use(express.json());
app.use(express.static("frontend"));

app.get("/ping", (req, res) => res.send("Server is running!"));

// ---------- GLOBAL ERROR HANDLING ----------
process.on("uncaughtException", (err) => {
  console.error("FATAL ERROR (uncaughtException):", err.stack || err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("UNHANDLED REJECTION:", reason);
});

// ---------- DATABASE ----------
let db;
try {
  console.log("Connecting to database: finance.db...");
  db = new Database("finance.db");
  console.log("Database connected successfully.");
} catch (err) {
  console.error("FAILED TO CONNECT TO DATABASE:", err);
  console.log("\nTIP: If you are seeing a 'module not found' or 'native' error, run:");
  console.log("rm -rf node_modules package-lock.json && npm install\n");
  process.exit(1);
}

// USERS TABLE
db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT,
  balance REAL DEFAULT 0
)
`).run();

// EXPENSES TABLE
db.prepare(`
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  amount REAL,
  remark TEXT,
  category TEXT,
  date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`).run();

// INCOME TABLE
db.prepare(`
CREATE TABLE IF NOT EXISTS income (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  amount REAL,
  source TEXT,
  date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS stocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  symbol TEXT,
  quantity REAL,
  buy_price REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`).run();

// SPLITWISE FRIENDS TABLE
db.prepare(`
CREATE TABLE IF NOT EXISTS splitwise_friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  name TEXT
)
`).run();

// SPLITWISE EXPENSES TABLE
db.prepare(`
CREATE TABLE IF NOT EXISTS splitwise_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  description TEXT,
  amount REAL,
  paid_by TEXT, -- "You" or friend_id
  split_among TEXT, -- JSON array of IDs/names
  is_settlement INTEGER DEFAULT 0,
  settled_with TEXT,
  date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`).run();

// RECURRING PAYMENTS TABLE
db.prepare(`
CREATE TABLE IF NOT EXISTS recurring_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  description TEXT,
  amount REAL,
  type TEXT, -- "emi" or "sub"
  next_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`).run();

// GAMIFICATION TABLE
db.prepare(`
CREATE TABLE IF NOT EXISTS gamification (
  user_id INTEGER PRIMARY KEY,
  current_streak INTEGER DEFAULT 0,
  last_login_date TEXT,
  unlocked_badges TEXT -- JSON array
)
`).run();

// ---------- AUTH MIDDLEWARE ----------
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid token" });

    req.user = decoded; // decoded.userId
    next();
  });
}

function authenticateToken(req, res, next) {
  return auth(req, res, next);
}

// ---------- REGISTER ----------
app.post("/register", (req, res) => {
  try {
    if (!req.body.username || !req.body.password)
      return res.status(400).json({ error: "All fields required" });

    const hash = bcrypt.hashSync(req.body.password, 10);

    db.prepare(`
      INSERT INTO users(username, password)
      VALUES (?, ?)
    `).run(req.body.username, hash);

    res.json({ message: "Account created" });
  } catch {
    res.status(400).json({ error: "Username already exists" });
  }
});

// ---------- LOGIN ----------
app.post("/login", (req, res) => {
  if (!req.body.username || !req.body.password)
    return res.status(400).json({ error: "Username and password required" });

  const user = db.prepare(`
    SELECT * FROM users WHERE username=?
  `).get(req.body.username);

  if (!user || !bcrypt.compareSync(req.body.password, user.password))
    return res.status(400).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );

  res.json({ message: "Login successful", token });
});

// ---------- ADD EXPENSE ----------
app.post("/expenses", auth, async (req, res) => {

  // ✅ VALIDATION
  if (!req.body.amount || req.body.amount <= 0)
    return res.status(400).json({ error: "Invalid amount" });

  if (!req.body.date)
    return res.status(400).json({ error: "Date required" });

  let category = req.body.category || "Other";

  db.prepare(`
    INSERT INTO expenses(user_id, amount, remark, category, date)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    req.user.userId,
    req.body.amount,
    req.body.remark || "",
    category,
    req.body.date
  );

  res.json({ message: "Added" });
});

// ---------- GET EXPENSES ----------
app.get("/expenses", auth, (req, res) => {

  let query = `
    SELECT id, amount, remark, category, date, created_at
    FROM expenses
    WHERE user_id=?
  `;

  let params = [req.user.userId];

  // Filter by month (YYYY-MM)
  if (req.query.month) {
    query += ` AND strftime('%Y-%m', date)=?`;
    params.push(req.query.month);
  }

  // Filter by category
  if (req.query.category) {
    query += ` AND category=?`;
    params.push(req.query.category.toLowerCase());
  }

  query += ` ORDER BY date DESC, created_at DESC`;

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

// ---------- GET UNIQUE CATEGORIES ----------
app.get("/categories", auth, (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT category FROM expenses WHERE user_id=? ORDER BY category ASC
  `).all(req.user.userId);
  res.json(rows.map(r => r.category));
});

// ---------- GET UNIQUE REMARKS ----------
app.get("/remarks", auth, (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT remark FROM expenses WHERE user_id=? AND remark != '' ORDER BY remark ASC
  `).all(req.user.userId);
  res.json(rows.map(r => r.remark));
});

// ---------- UPDATE EXPENSE ----------
app.put("/expenses/:id", auth, (req, res) => {

  if (!req.body.amount || req.body.amount <= 0)
    return res.status(400).json({ error: "Invalid amount" });

  db.prepare(`
    UPDATE expenses
    SET amount=?, remark=?, category=?, date=?
    WHERE id=? AND user_id=?
  `).run(
    req.body.amount,
    req.body.remark || "",
    req.body.category.toLowerCase(),
    req.body.date,
    req.params.id,
    req.user.userId
  );

  res.json({ message: "Updated" });
});

// ---------- DELETE EXPENSE ----------
app.delete("/expenses/:id", auth, (req, res) => {
  const info = db.prepare(`
    DELETE FROM expenses
    WHERE id=? AND user_id=?
  `).run(req.params.id, req.user.userId);

  if (info.changes === 0)
    return res.status(404).json({ error: "Not found" });

  res.json({ message: "Deleted" });
});

// ---------- ADD INCOME ----------
app.post("/income", auth, (req, res) => {

  if (!req.body.amount || req.body.amount <= 0)
    return res.status(400).json({ error: "Invalid amount" });

  db.prepare(`
    INSERT INTO income(user_id, amount, source, date)
    VALUES (?, ?, ?, ?)
  `).run(
    req.user.userId,
    req.body.amount,
    req.body.source || "",
    req.body.date
  );

  res.json({ message: "Income added" });
});

// ---------- GET INCOME ----------
app.get("/income", auth, (req, res) => {

  const rows = db.prepare(`
    SELECT id, amount, source, date
    FROM income
    WHERE user_id=?
    ORDER BY date DESC
  `).all(req.user.userId);

  res.json(rows);
});

// ---------- UPDATE INCOME ----------
app.put("/income/:id", auth, (req, res) => {
  if (!req.body.amount || req.body.amount <= 0)
    return res.status(400).json({ error: "Invalid amount" });

  if (!req.body.date)
    return res.status(400).json({ error: "Date required" });

  db.prepare(`
    UPDATE income
    SET amount=?, source=?, date=?
    WHERE id=? AND user_id=?
  `).run(
    req.body.amount,
    req.body.source || "",
    req.body.date,
    req.params.id,
    req.user.userId
  );

  res.json({ message: "Income updated" });
});

// ---------- DELETE INCOME ----------
app.delete("/income/:id", auth, (req, res) => {

  db.prepare(`
    DELETE FROM income
    WHERE id=? AND user_id=?
  `).run(req.params.id, req.user.userId);

  res.json({ message: "Income deleted" });
});

app.get("/summary", auth, (req, res) => {

  const income = db.prepare(`
    SELECT IFNULL(SUM(amount),0) as total
    FROM income
    WHERE user_id = ?
  `).get(req.user.userId).total;

  const expense = db.prepare(`
    SELECT IFNULL(SUM(amount),0) as total
    FROM expenses
    WHERE user_id = ?
  `).get(req.user.userId).total;

  res.json({
    income,
    expense
  });

});

app.get("/insights", authenticateToken, (req, res) => {

  const userId = req.user.userId;

  const income = db.prepare(`
    SELECT IFNULL(SUM(amount),0) as total
    FROM income
    WHERE user_id = ?
  `).get(userId).total;

  const expense = db.prepare(`
    SELECT IFNULL(SUM(amount),0) as total
    FROM expenses
    WHERE user_id = ?
  `).get(userId).total;

  const savingsRate = income > 0
    ? ((income - expense) / income) * 100
    : 0;

  let message = "";

  if (income === 0) {
    message = "You haven't added income yet.";
  } else if (savingsRate < 10) {
    message = "Your savings rate is very low. Try reducing discretionary expenses.";
  } else if (savingsRate < 20) {
    message = "Your savings rate is moderate. Aim for 25% or more.";
  } else {
    message = "Good job! Your savings rate is healthy.";
  }

  res.json({
    income,
    expense,
    savingsRate: savingsRate.toFixed(1),
    message
  });
});


// ---------- MONTH SUMMARY ----------
app.get("/summary/month", auth, (req, res) => {

  const userId = req.user.userId;
  const month = req.query.month; // "2026-02"
  if (!month)
    return res.status(400).json({ error: "Month required (YYYY-MM)" });

  const income = db.prepare(`
    SELECT SUM(amount) as totalIncome
    FROM income
    WHERE user_id = ?
    AND date LIKE ?
  `).get(userId, month + "%");

  const expense = db.prepare(`
    SELECT SUM(amount) as totalExpense
    FROM expenses
    WHERE user_id = ?
    AND date LIKE ?
  `).get(userId, month + "%");

  res.json({
    totalIncome: income.totalIncome || 0,
    totalExpense: expense.totalExpense || 0
  });
});

app.get("/summary/year", auth, (req, res) => {

  const year = req.query.year;
  const userId = req.user.userId;

  if (!year) {
    return res.status(400).json({ error: "Year required" });
  }

  const income = db.prepare(`
    SELECT strftime('%m', date) as month,
           SUM(amount) as total
    FROM income
    WHERE user_id = ?
    AND strftime('%Y', date) = ?
    GROUP BY month
  `).all(userId, year);

  const expense = db.prepare(`
    SELECT strftime('%m', date) as month,
           SUM(amount) as total
    FROM expenses
    WHERE user_id = ?
    AND strftime('%Y', date) = ?
    GROUP BY month
  `).all(userId, year);

  res.json({ income, expense });
});

// ---------- SPLITWISE ----------
app.get("/splitwise/friends", auth, (req, res) => {
  const rows = db.prepare("SELECT * FROM splitwise_friends WHERE user_id=?").all(req.user.userId);
  res.json(rows);
});

app.post("/splitwise/friends", auth, (req, res) => {
  db.prepare("INSERT INTO splitwise_friends (user_id, name) VALUES (?, ?)").run(req.user.userId, req.body.name);
  res.json({ message: "Friend added" });
});

app.delete("/splitwise/friends/:id", auth, (req, res) => {
  db.prepare("DELETE FROM splitwise_friends WHERE id=? AND user_id=?").run(req.params.id, req.user.userId);
  res.json({ message: "Friend removed" });
});

app.get("/splitwise/expenses", auth, (req, res) => {
  const rows = db.prepare("SELECT * FROM splitwise_expenses WHERE user_id=? ORDER BY created_at DESC").all(req.user.userId);
  res.json(rows);
});

app.post("/splitwise/expenses", auth, (req, res) => {
  db.prepare(`
    INSERT INTO splitwise_expenses (user_id, description, amount, paid_by, split_among, is_settlement, settled_with, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.userId,
    req.body.description,
    req.body.amount,
    req.body.paidBy,
    JSON.stringify(req.body.splitAmong),
    req.body.isSettlement ? 1 : 0,
    req.body.settledWith,
    req.body.date
  );
  res.json({ message: "Expense added" });
});

app.delete("/splitwise/expenses/:id", auth, (req, res) => {
  db.prepare("DELETE FROM splitwise_expenses WHERE id=? AND user_id=?").run(req.params.id, req.user.userId);
  res.json({ message: "Expense deleted" });
});

// ---------- RECURRING PAYMENTS ----------
app.get("/recurring", auth, (req, res) => {
  const rows = db.prepare("SELECT * FROM recurring_payments WHERE user_id=?").all(req.user.userId);
  res.json(rows);
});

app.post("/recurring", auth, (req, res) => {
  db.prepare(`
    INSERT INTO recurring_payments (user_id, description, amount, type, next_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.userId, req.body.description, req.body.amount, req.body.type, req.body.nextDate);
  res.json({ message: "Recurring payment added" });
});

app.delete("/recurring/:id", auth, (req, res) => {
  db.prepare("DELETE FROM recurring_payments WHERE id=? AND user_id=?").run(req.params.id, req.user.userId);
  res.json({ message: "Deleted" });
});

// ---------- GAMIFICATION ----------
app.get("/gamification", auth, (req, res) => {
  let stats = db.prepare("SELECT * FROM gamification WHERE user_id=?").get(req.user.userId);
  if (!stats) {
    stats = { user_id: req.user.userId, current_streak: 0, last_login_date: null, unlocked_badges: "[]" };
    db.prepare("INSERT INTO gamification (user_id, current_streak, unlocked_badges) VALUES (?, 0, ?)").run(req.user.userId, "[]");
  }
  res.json({
    ...stats,
    unlocked_badges: JSON.parse(stats.unlocked_badges || "[]")
  });
});

app.post("/gamification/sync", auth, (req, res) => {
  db.prepare(`
    INSERT INTO gamification (user_id, current_streak, last_login_date, unlocked_badges)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      current_streak = excluded.current_streak,
      last_login_date = excluded.last_login_date,
      unlocked_badges = excluded.unlocked_badges
  `).run(
    req.user.userId,
    req.body.current_streak,
    req.body.last_login_date,
    JSON.stringify(req.body.unlocked_badges)
  );
  res.json({ message: "Synced" });
});

// ---------- STOCKS ----------
app.get("/stocks", auth, (req, res) => {
  const rows = db.prepare("SELECT * FROM stocks WHERE user_id=?").all(req.user.userId);
  res.json(rows);
});

app.post("/stocks", auth, (req, res) => {
  const { symbol, qty, price } = req.body;
  const userId = req.user.userId;
  
  const existing = db.prepare("SELECT * FROM stocks WHERE user_id=? AND symbol=?").get(userId, symbol);
  
  if (existing) {
    const newQty = existing.qty + qty;
    const newPrice = (existing.qty * existing.price + qty * price) / newQty;
    db.prepare("UPDATE stocks SET qty=?, price=? WHERE id=?").run(newQty, newPrice, existing.id);
  } else {
    db.prepare("INSERT INTO stocks (user_id, symbol, qty, price) VALUES (?, ?, ?, ?)").run(userId, symbol, qty, price);
  }
  res.json({ message: "Stock updated" });
});

app.delete("/stocks/:id", auth, (req, res) => {
  // Allow deleting by ID or Symbol
  db.prepare("DELETE FROM stocks WHERE (id=? OR symbol=?) AND user_id=?").run(req.params.id, req.params.id, req.user.userId);
  res.json({ message: "Stock removed" });
});

// ---------- SERVER ----------
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
