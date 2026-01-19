import express from "express";
import "dotenv/config";
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
  const countries = await checkVisisted();
  let userColor = color(currentUserId);
  res.render("index.ejs", {
    countries: countries,
    total: countries.length,
    users: users,
    color: userColor,
  });
});
app.post("/add", async (req, res) => {
  const input = (req.body.country || "").trim();

  if (!input) {
    return res.redirect("/");
  }

  try {
    // Look up country code by name
    const result = await db.query(
      "SELECT country_code FROM countries WHERE LOWER(country_name) LIKE '%' || $1 || '%';",
      [input.toLowerCase()],
    );

    if (result.rows.length === 0) {
      return res.redirect("/"); // country not found
    }

    const countryCode = result.rows[0].country_code;

    // Insert visit
    await db.query(
      "INSERT INTO visited_countries (country_code, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;",
      [countryCode, currentUserId],
    );

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
