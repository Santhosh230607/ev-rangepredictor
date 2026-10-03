-- Optional MySQL schema (for project documentation).
-- The running app uses SQLite (ev_range.db) automatically via app.py.

CREATE DATABASE IF NOT EXISTS ev_range_ai;
USE ev_range_ai;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trips (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_email VARCHAR(180),
  vehicle_type VARCHAR(32),
  start_place VARCHAR(255),
  dest_place VARCHAR(255),
  charge_pct DECIMAL(5,2),
  weather VARCHAR(32),
  road_type VARCHAR(64),
  payload_json JSON,
  predicted_km DECIMAL(8,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120),
  rating TINYINT,
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
