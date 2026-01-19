// index.js
import express from "express";
import "dotenv/config";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
const port = process.env.PORT || 3000;

// ---------- DB ----------
if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set. Add it to your .env file.");
  process.exit(1);
}

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon requires SSL
});

const DEBUG = true;

// ---------- Middleware ----------
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.set("view engine", "ejs");

// ---------- App State ----------
let currentUserId = 1;
let users = [];

// ---------- Helpers ----------
async function loadUsers() {
  const result = await db.query(
    "SELECT id, name, color FROM users ORDER BY id;",
  );
  users = result.rows;
  return users;
}

function getUserColor(userId) {
  const u = users.find((x) => Number(x.id) === Number(userId));
  return u?.color || "teal";
}

async function getVisitedCountryCodes(userId) {
  const result = await db.query(
    "SELECT country_code FROM visited_countries WHERE user_id = $1 ORDER BY id;",
    [userId],
  );
  return result.rows.map((r) => r.country_code);
}

// ---------- Debug Routes ----------
app.get("/ping", (req, res) => res.send("pong"));

app.get("/debug/neon", async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        current_database() AS db,
        current_user AS "user",
        (SELECT setting FROM pg_settings WHERE name='server_version') AS server_version,
        (SELECT COUNT(*) FROM visited_countries) AS visit_count,
        EXISTS (
          SELECT 1 FROM visited_countries WHERE country_code = 'AU' AND user_id = 1
        ) AS au_exists_for_user1
    `);
    res.json({
      host: db.connectionParameters.host,
      ...r.rows[0],
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------- Routes ----------
app.get("/", async (req, res) => {
  try {
    await loadUsers();
    const countries = await getVisitedCountryCodes(currentUserId);
    const userColor = getUserColor(currentUserId);

    res.render("index.ejs", {
      countries, // MUST be an array of ISO-2 codes like ["FR","GB"]
      total: countries.length,
      users,
      color: userColor,
    });
  } catch (err) {
    console.error("GET / error:", err);
    res.status(500).send("Server error");
  }
});

app.post("/add", async (req, res) => {
  const input = (req.body.country || "").trim();
  if (!input) return res.redirect("/");

  try {
    if (DEBUG) {
      console.log("HIT /add", new Date().toISOString(), "input:", input);
      console.log("RUNTIME HOST:", db.connectionParameters.host);
    }

    // Find country code from country name (e.g., "Australia" -> "AU")
    const lookup = await db.query(
      `
      SELECT country_code
      FROM countries
      WHERE LOWER(country_name) LIKE '%' || $1 || '%'
      ORDER BY country_name
      LIMIT 1;
      `,
      [input.toLowerCase()],
    );

    if (lookup.rowCount === 0) {
      if (DEBUG) console.log("NOT FOUND:", input);
      return res.redirect("/");
    }

    const countryCode = lookup.rows[0].country_code;

    // Insert; skip duplicates per (country_code, user_id)
    const inserted = await db.query(
      `
      INSERT INTO visited_countries (country_code, user_id)
      VALUES ($1, $2)
      ON CONFLICT (country_code, user_id) DO NOTHING
      RETURNING *;
      `,
      [countryCode, currentUserId],
    );

    if (DEBUG) {
      if (inserted.rowCount === 1) console.log("INSERTED:", inserted.rows[0]);
      else console.log("ALREADY EXISTS:", { countryCode, currentUserId });
    }

    return res.redirect("/");
  } catch (err) {
    console.error("Add country error:", err);
    return res.redirect("/");
  }
});

app.post("/user", async (req, res) => {
  try {
    if (req.body.add === "new") return res.render("new.ejs");

    currentUserId = Number(req.body.user);
    return res.redirect("/");
  } catch (err) {
    console.error("POST /user error:", err);
    return res.redirect("/");
  }
});

app.post("/new", async (req, res) => {
  const name = (req.body.name || "").trim();
  const chosenColor = (req.body.color || "").trim();

  if (!name) return res.render("new.ejs", { error: "emptyName" });

  try {
    await db.query("INSERT INTO users (name, color) VALUES ($1, $2);", [
      name,
      chosenColor,
    ]);
    return res.redirect("/");
  } catch (err) {
    console.error("POST /new error:", err);
    return res.redirect("/");
  }
});

// ---------- Startup ----------
async function start() {
  await db.connect();

  if (DEBUG) {
    console.log("ENV DATABASE_URL defined?", Boolean(process.env.DATABASE_URL));
    console.log("PG HOST:", db.connectionParameters.host);
    console.log("PG DB:", db.connectionParameters.database);
    console.log(
      "DATABASE_URL (redact pwd):",
      process.env.DATABASE_URL.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@"),
    );

    // optional: quick identity check
    const info = await db.query(
      'SELECT current_database() AS db, current_user AS "user";',
    );
    console.log("CONNECTED TO:", info.rows[0]);
  }

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
