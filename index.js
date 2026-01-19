import express from "express";
import "dotenv/config";
console.log("ENV DATABASE_URL defined?", Boolean(process.env.DATABASE_URL));

import bodyParser from "body-parser";
import pg from "pg";

const { Client } = pg;

const app = express();
const port = process.env.PORT || 3000;

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon requires SSL
});

db.connect();

console.log("PG HOST:", db.connectionParameters.host);
console.log("PG DB:", db.connectionParameters.database);

(async () => {
  try {
    const info = await db.query(`
      SELECT
        current_database() AS db,
        current_user AS "user",
        inet_server_addr() AS server_ip,
        inet_server_port() AS server_port,
        (SELECT setting FROM pg_settings WHERE name='listen_addresses') AS listen_addresses,
        version() AS version;
    `);
    console.log("CONNECTED TO:", info.rows[0]);
    console.log(
      "DATABASE_URL (redact pwd):",
      process.env.DATABASE_URL?.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@"),
    );
  } catch (e) {
    console.error("DB CONNECT CHECK FAILED:", e);
  }
})();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

let currentUserId = 1;

let users = [];

async function checkUser() {
  try {
    const result = await db.query("SELECT id, name, color FROM users");
    users = result.rows; // each row already has id, name, color
    console.log(users);
  } catch (err) {
    console.error("Error fetching users:", err);
  }
}

function color(id) {
  for (let i = 0; i < users.length; i++) {
    if (users[i].id === id) {
      return users[i].color;
    }
  }
}

async function checkVisisted() {
  const result = await db.query(
    "SELECT country_code FROM visited_countries WHERE user_id = ($1)",
    [currentUserId],
  );
  let countries = [];
  result.rows.forEach((country) => {
    countries.push(country.country_code);
  });
  return countries;
}
app.get("/", async (req, res) => {
  await checkUser();

  const visited = await checkVisisted(); // whatever it returns now
  const countries = Array.isArray(visited)
    ? visited
        .map((v) => (typeof v === "string" ? v : v.country_code))
        .filter(Boolean)
    : String(visited || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  const userColor = color(currentUserId);

  res.render("index.ejs", {
    countries,
    total: countries.length,
    users,
    color: userColor,
  });
});

app.post("/add", async (req, res) => {
  console.log("HIT /add", new Date().toISOString());
  console.log("BODY:", req.body);
  const input = (req.body.country || "").trim();
  if (!input) return res.redirect("/");

  try {
    // 1) Find the country code (AU, US, etc.)
    const lookup = await db.query(
      "SELECT country_code FROM countries WHERE LOWER(country_name) LIKE '%' || $1 || '%' LIMIT 1;",
      [input.toLowerCase()],
    );

    if (lookup.rows.length === 0) {
      console.log("NOT FOUND:", input);
      return res.redirect("/");
    }

    const countryCode = lookup.rows[0].country_code;

    // 2) Insert visit and return the inserted row
    const inserted = await db.query(
      "INSERT INTO visited_countries (country_code, user_id) VALUES ($1, $2) RETURNING *;",
      [countryCode, currentUserId],
    );

    console.log("INSERTED:", inserted.rows[0]); // ✅ now inserted is defined

    return res.redirect("/");
  } catch (err) {
    console.error("Add country error:", err);
    return res.redirect("/");
  }
});
app.post("/user", async (req, res) => {
  if (req.body.add === "new") {
    res.render("new.ejs");
  } else {
    currentUserId = Number(req.body.user);
    console.log(currentUserId);
    res.redirect("/");
  }
});

app.post("/new", async (req, res) => {
  //Hint: The RETURNING keyword can return the data that was inserted.
  //https://www.postgresql.org/docs/current/dml-returning.html
  if (req.body.name === "") {
    return res.render("new.ejs", { error: "emptyName" });
  } else {
    try {
      await db.query("INSERT INTO users (name, color) VALUES ($1, $2)", [
        req.body.name,
        req.body.color,
      ]);
      res.redirect("/");
    } catch (err) {
      console.log(err);
    }
  }
});

app.listen(port, () => {
  console.log("app is running on neon and render");
});
