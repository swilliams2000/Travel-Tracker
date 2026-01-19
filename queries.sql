-- Clean slate
DROP TABLE IF EXISTS visited_countries;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS countries;

-- Countries lookup table
CREATE TABLE countries (
  country_code CHAR(2) PRIMARY KEY,
  country_name TEXT NOT NULL
);

-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(15) UNIQUE NOT NULL,
  color VARCHAR(15)
);

-- Visited countries (join table)
CREATE TABLE visited_countries (
  id SERIAL PRIMARY KEY,
  country_code CHAR(2) REFERENCES countries(country_code),
  user_id INTEGER REFERENCES users(id),
  UNIQUE (country_code, user_id)
);

-- Seed countries (minimum set — add more anytime)
INSERT INTO countries (country_code, country_name) VALUES
('FR', 'France'),
('GB', 'United Kingdom'),
('CA', 'Canada'),
('US', 'United States'),
('DE', 'Germany'),
('IT', 'Italy'),
('ES', 'Spain');

-- Seed users
INSERT INTO users (name, color)
VALUES
('Seth', 'teal'),
('Jo', 'powderblue');

-- Seed visits
INSERT INTO visited_countries (country_code, user_id)
VALUES
('FR', 1),
('GB', 1),
('CA', 2),
('FR', 2);
