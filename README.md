# RouteCharge (EV Range AI) — Automotive AI Project

Website for EV users to **predict mileage** (weather, AC, charge level, road type, vehicle load) and see **EV charging stations along their driving route**, filtered to leave a range reserve.

## You do not need to connect MySQL manually

The backend uses **SQLite** (`ev_range.db`). It is created automatically when you start the server.

`schema.sql` is included only for your **project report** (MySQL version).

## How to run (Windows)

1. Install [Python 3](https://www.python.org/downloads/) if needed.
2. Double-click **`START.bat`** in this folder.
3. Open **http://127.0.0.1:5000** in Chrome or Edge.

Do **not** open `.html` files directly from Explorer — use the URL above so login, prediction, and stations work.

## Deploy

Use `wsgi:app` as the WSGI application target and install `requirements.txt`. For example, with Waitress:

```text
waitress-serve --listen=0.0.0.0:5000 wsgi:app
```

Serve the deployed site over **HTTPS**. Browsers block GPS access on insecure public URLs; `localhost` and `127.0.0.1` are the local development exceptions.

### Deploy on Render

1. Put this project in a GitHub repository.
2. Open [render.com](https://render.com), create an account, and choose **New > Blueprint**.
3. Select the GitHub repository containing this project.
4. Render reads `render.yaml`, installs the dependencies, and starts the Flask app automatically.
5. Open the generated `https://...onrender.com` URL and allow location access.

The SQLite database is local to the service and may reset when the service is redeployed. Use a hosted database before storing important production data.

## Pages (requirements 5.1–5.7)

| File | Purpose |
|------|---------|
| `login.html` | Splash login (mockup) (5.1) |
| `home.html` | Map hub — no active route |
| `route.html` | Origin / destination search (5.3.1) |
| `select-vehicle.html` | 2W / 3W / 4W / lorry (5.2) |
| `details.html` | Driving conditions sliders (5.3) |
| `result.html` | Predicted range only, with a link to route planning (5.4) |
| `stations.html` | Destination, route map, and reachable chargers (5.5) |
| `feedback.html` | Profile / reviews (5.6) |
| `offline.html` | Connection error screen |
| `style.css` + `ui.js` | RouteCharge dark UI + bottom nav (5.7) |

## Backend files

| File | Purpose |
|------|---------|
| `app.py` | Flask API + serves all pages |
| `requirements.txt` | Python dependencies |
| `schema.sql` | Optional MySQL DDL for documentation |

## Frontend JS

| File | Purpose |
|------|---------|
| `script.js` | Shared UI |
| `auth.js` | Login / register |
| `mileage.js` | Trip form + predict |
| `range.js` | Displays the predicted range |
| `result.js` | Route map and reachable charging stations |
| `feedback.js` | Submit reviews |

## For your report — limitations / future work

- The range page shows only the predicted driving range. The separate route-chargers page draws the OSRM route, start, destination, and all charging-station pins on an interactive OpenStreetMap map. Stations are searched within 5 km of the route and filtered to the first 85% of predicted range, leaving a 15% reserve; all matching stations are shown in route order. The app does not substitute stations near the starting point. Map, route, and station data depend on public OSRM/OpenStreetMap services; if station data is temporarily unavailable, the route map is still shown with an error and retry option.
- Range model is **rule-based AI** (explainable factors), not ML training on fleet data.
- Geocoding and stations use **OpenStreetMap** (free, needs internet when server runs).

## Stack

- Frontend: HTML, CSS, JavaScript  
- Framework note: React-style flow implemented with multi-page HTML + JS (suitable for internship demo; can migrate to React later).  
- Backend: Python (Flask)  
- Database: SQLite (auto), MySQL schema provided for documentation  
