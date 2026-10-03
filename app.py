"""
EV Range AI — Flask backend
Serves the website and API. Database: SQLite (created automatically — no MySQL setup required).
"""
import hashlib
import json
import math
import sqlite3
import urllib.parse
import urllib.request
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "ev_range.db"

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")


@app.errorhandler(Exception)
def handle_unexpected_error(exc):
    if isinstance(exc, HTTPException):
        if request.path.startswith("/api/"):
            return jsonify({"error": exc.description}), exc.code
        return exc

    if request.path.startswith("/api/"):
        app.logger.exception("Unhandled error for %s %s", request.method, request.path)
        return jsonify({"error": "Internal server error. Check the service logs."}), 500

    raise exc


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS trips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT,
            vehicle_type TEXT,
            start_place TEXT,
            dest_place TEXT,
            charge_pct REAL,
            weather TEXT,
            road_type TEXT,
            payload_json TEXT,
            predicted_km REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            rating INTEGER,
            message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS station_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_hash TEXT UNIQUE NOT NULL,
            response_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    conn.commit()
    conn.close()


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def predict_range(p: dict) -> float:
    """Rule-based range model (automotive AI heuristic)."""
    factor = 1.0
    weather_f = {"mild": 1.0, "hot": 0.88, "cold": 0.82, "rain": 0.9}
    road_f = {
        "highway_no_traffic": 0.78,
        "traffic_road": 0.92,
        "off_road": 0.7,
        "mixed_traffic": 0.88,
        "non_traffic": 0.95,
    }
    factor *= weather_f.get(p.get("weather"), 1.0)
    factor *= road_f.get(p.get("road_type"), 1.0)
    if p.get("ac_on"):
        factor *= 0.9

    speed = float(p.get("cruise_speed") or 65)
    if speed > 100:
        factor *= 0.72
    elif speed > 80:
        factor *= 0.85

    vtype = p.get("vehicle_type")
    if vtype == "2wheeler":
        if p.get("riders", 1) > 1:
            factor *= 0.92
    elif vtype == "3wheeler":
        if p.get("riders", 1) > 2:
            factor *= 0.94
        cargo = float(p.get("cargo_kg") or 0)
        if cargo > 50:
            factor *= max(0.75, 1 - cargo / 5000)
    elif vtype == "4wheeler":
        if p.get("riders", 1) > 4:
            factor *= 0.93
    elif vtype == "lorry":
        load_pct = float(p.get("load_pct") or 0)
        factor *= max(0.55, 1 - load_pct / 200)
        if float(p.get("cargo_kg") or 0) > 3000:
            factor *= 0.92

    rated = float(p.get("rated_range_km") or 100)
    charge = float(p.get("charge_pct") or 100) / 100.0
    return round(rated * charge * factor, 1)


def geocode_place(place: str):
    q = urllib.parse.quote(place)
    url = f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=1"
    req = urllib.request.Request(url, headers={"User-Agent": "EVRangeAI/1.0 (student project)"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode())
    if not data:
        return None
    return float(data[0]["lat"]), float(data[0]["lon"])


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _get_cached_overpass(query_hash: str):
    """Get cached Overpass API response, returns None if not found or expired."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """SELECT response_json FROM station_cache 
           WHERE query_hash = ? AND datetime(created_at) > datetime('now', '-6 hours')""",
        (query_hash,),
    )
    row = cur.fetchone()
    conn.close()
    if row:
        app.logger.info(f"Cache hit for query {query_hash[:8]}...")
        return json.loads(row[0])
    return None


def _cache_overpass_response(query_hash: str, elements: list):
    """Cache Overpass API response for 6 hours."""
    conn = get_db()
    conn.execute(
        """INSERT OR REPLACE INTO station_cache (query_hash, response_json) 
           VALUES (?, ?)""",
        (query_hash, json.dumps(elements)),
    )
    conn.commit()
    conn.close()
    app.logger.info(f"Cached response for query {query_hash[:8]}...")


def _fetch_overpass_elements(query: str):
    query_hash = hashlib.sha256(query.encode()).hexdigest()
    
    # Try to get from cache first
    cached = _get_cached_overpass(query_hash)
    if cached is not None:
        return cached
    
    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.openstreetmap.fr/api/interpreter",
        "https://lz4.overpass-api.de/api/interpreter",
    ]
    last_error = None
    max_retries = 1

    for endpoint in dict.fromkeys(endpoints):
        for attempt in range(max_retries):
            try:
                request_data = urllib.parse.urlencode({"data": query}).encode("utf-8")
                req = urllib.request.Request(
                    endpoint,
                    data=request_data,
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded",
                        "User-Agent": "EVRangeAI/1.0",
                    },
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read().decode())
                elements = data.get("elements", [])
                # Cache successful response
                _cache_overpass_response(query_hash, elements)
                app.logger.info(f"Successfully fetched charging stations from {endpoint} (attempt {attempt + 1})")
                return elements
            except urllib.error.HTTPError as exc:
                if exc.code == 429:
                    app.logger.warning(f"Rate limited by {endpoint}: HTTP {exc.code}")
                else:
                    app.logger.warning(f"HTTP error from {endpoint}: {exc.code} {exc.reason}")
                last_error = exc
            except urllib.error.URLError as exc:
                app.logger.warning(f"Network error from {endpoint} (attempt {attempt + 1}): {exc.reason}")
                last_error = exc
            except Exception as exc:
                app.logger.warning(f"Error fetching from {endpoint} (attempt {attempt + 1}): {type(exc).__name__}: {exc}")
                last_error = exc

    error_msg = (
        "Charging station service unavailable. "
        f"Last error: {last_error if last_error is not None else 'No fallback endpoint responded'}"
    )
    app.logger.error(error_msg)
    raise RuntimeError(error_msg)


def _stations_from_elements(elements, reference_lat: float, reference_lon: float):
    stations = []
    for el in elements:
        name = el.get("tags", {}).get("name") or "EV Charging Station"
        if el.get("type") == "node":
            slat, slon = el.get("lat"), el.get("lon")
        else:
            center = el.get("center") or {}
            slat, slon = center.get("lat"), center.get("lon")
        if slat is None or slon is None:
            continue
        dist = haversine_km(reference_lat, reference_lon, slat, slon)
        addr = el.get("tags", {}).get("addr:full") or el.get("tags", {}).get("operator") or ""
        stations.append({"name": name, "distance_km": round(dist, 2), "address": addr, "lat": slat, "lon": slon})

    return stations


def _point_on_route(route_coordinates, cumulative_km, distance_km: float):
    for index in range(len(cumulative_km) - 1):
        segment_end = cumulative_km[index + 1]
        if segment_end >= distance_km:
            segment_length = segment_end - cumulative_km[index]
            fraction = (distance_km - cumulative_km[index]) / segment_length if segment_length else 0
            lon1, lat1 = route_coordinates[index]
            lon2, lat2 = route_coordinates[index + 1]
            return (
                lon1 + (lon2 - lon1) * fraction,
                lat1 + (lat2 - lat1) * fraction,
            )
    return route_coordinates[-1]


def _station_route_position(station_lat: float, station_lon: float, route_coordinates, cumulative_km):
    earth_radius_km = 6371.0
    best_position = None

    for index in range(len(route_coordinates) - 1):
        lon1, lat1 = route_coordinates[index]
        lon2, lat2 = route_coordinates[index + 1]
        mean_lat = math.radians((lat1 + lat2 + station_lat) / 3)
        x_scale = earth_radius_km * math.cos(mean_lat) * math.pi / 180
        y_scale = earth_radius_km * math.pi / 180
        segment_x = (lon2 - lon1) * x_scale
        segment_y = (lat2 - lat1) * y_scale
        station_x = (station_lon - lon1) * x_scale
        station_y = (station_lat - lat1) * y_scale
        segment_squared = segment_x * segment_x + segment_y * segment_y
        fraction = 0 if segment_squared == 0 else max(
            0,
            min(1, (station_x * segment_x + station_y * segment_y) / segment_squared),
        )
        nearest_lat = lat1 + (lat2 - lat1) * fraction
        nearest_lon = lon1 + (lon2 - lon1) * fraction
        cross_track_km = haversine_km(station_lat, station_lon, nearest_lat, nearest_lon)
        segment_km = cumulative_km[index + 1] - cumulative_km[index]
        route_position_km = cumulative_km[index] + segment_km * fraction
        if best_position is None or cross_track_km < best_position[1]:
            best_position = (route_position_km, cross_track_km)

    return best_position


def fetch_ev_stations_along_route(route_coordinates, max_route_km: float, corridor_km: float = 5.0):
    if len(route_coordinates) < 2 or max_route_km <= 0:
        return []

    cumulative_km = [0.0]
    for index in range(1, len(route_coordinates)):
        lon1, lat1 = route_coordinates[index - 1]
        lon2, lat2 = route_coordinates[index]
        cumulative_km.append(cumulative_km[-1] + haversine_km(lat1, lon1, lat2, lon2))

    max_route_km = min(max_route_km, cumulative_km[-1])
    if max_route_km <= 0:
        return []

    query_points = [route_coordinates[0]]
    next_sample_km = 10.0
    for distance_km in cumulative_km[1:]:
        if distance_km >= max_route_km:
            break
        if distance_km >= next_sample_km:
            query_points.append(_point_on_route(route_coordinates, cumulative_km, distance_km))
            next_sample_km = distance_km + 10.0
    query_points.append(_point_on_route(route_coordinates, cumulative_km, max_route_km))

    around_points = ",".join(f"{lat},{lon}" for lon, lat in query_points)
    radius_m = int(corridor_km * 1000)
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"="charging_station"](around:{radius_m},{around_points});
      way["amenity"="charging_station"](around:{radius_m},{around_points});
    );
    out center;
    """

    route_start_lat = route_coordinates[0][1]
    route_start_lon = route_coordinates[0][0]
    stations = _stations_from_elements(
        _fetch_overpass_elements(query),
        route_start_lat,
        route_start_lon,
    )
    stations_by_location = {}
    for station in stations:
        position = _station_route_position(
            station["lat"],
            station["lon"],
            route_coordinates,
            cumulative_km,
        )
        if not position:
            continue
        route_distance_km, distance_from_route_km = position
        if route_distance_km > max_route_km or distance_from_route_km > corridor_km:
            continue

        station["route_distance_km"] = round(route_distance_km, 1)
        station["distance_from_route_km"] = round(distance_from_route_km, 1)
        station["distance_km"] = station["route_distance_km"]
        key = (round(station["lat"], 4), round(station["lon"], 4))
        existing = stations_by_location.get(key)
        if not existing or station["route_distance_km"] < existing["route_distance_km"]:
            stations_by_location[key] = station

    return sorted(stations_by_location.values(), key=lambda station: station["route_distance_km"])


def fetch_driving_route(origin_coords, destination_coords):
    origin_lon, origin_lat = origin_coords
    destination_lon, destination_lat = destination_coords
    url = (
        "https://router.project-osrm.org/route/v1/driving/"
        f"{origin_lon},{origin_lat};{destination_lon},{destination_lat}"
        "?overview=full&geometries=geojson&steps=false"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "EVRangeAI/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode())

    routes = data.get("routes") or []
    if data.get("code") != "Ok" or not routes:
        raise RuntimeError("Could not calculate a driving route between these locations.")
    route = routes[0]
    coordinates = route.get("geometry", {}).get("coordinates", [])
    if len(coordinates) < 2:
        raise RuntimeError("The routing service returned an incomplete route.")
    return coordinates, round(float(route["distance"]) / 1000, 1)


def sample_route_coordinates(route_coordinates, max_points: int = 120):
    step = max(1, math.ceil((len(route_coordinates) - 1) / (max_points - 1)))
    sampled = route_coordinates[::step]
    if sampled[-1] != route_coordinates[-1]:
        sampled.append(route_coordinates[-1])
    return sampled


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "login.html")


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/home")
def home_page():
    return send_from_directory(BASE_DIR, "home.html")


@app.route("/<path:filename>")
def static_files(filename):
    if filename.startswith("api/"):
        return jsonify({"error": "Not found"}), 404
    return send_from_directory(BASE_DIR, filename)


@app.post("/api/register")
def register():
    body = request.get_json(force=True) or {}
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    if not name or not email or len(password) < 6:
        return jsonify({"error": "Invalid registration data"}), 400

    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (name, email, hash_password(password)),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": "Email already registered"}), 409
    conn.close()
    return jsonify({"user": {"name": name, "email": email}})


@app.post("/api/login")
def login():
    body = request.get_json(force=True) or {}
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    conn = get_db()
    row = conn.execute(
        "SELECT name, email, password_hash FROM users WHERE email = ?", (email,)
    ).fetchone()
    conn.close()
    if not row or row["password_hash"] != hash_password(password):
        return jsonify({"error": "Invalid email or password"}), 401
    return jsonify({"user": {"name": row["name"], "email": row["email"]}})


@app.post("/api/predict")
def api_predict():
    p = request.get_json(force=True) or {}
    if not p.get("vehicle_type") or not p.get("start_place"):
        return jsonify({"error": "Missing trip data"}), 400
    predicted_km = predict_range(p)

    conn = get_db()
    conn.execute(
        """INSERT INTO trips (user_email, vehicle_type, start_place, dest_place, charge_pct,
           weather, road_type, payload_json, predicted_km) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            p.get("user_email"),
            p.get("vehicle_type"),
            p.get("start_place"),
            p.get("dest_place"),
            p.get("charge_pct"),
            p.get("weather"),
            p.get("road_type"),
            json.dumps(p),
            predicted_km,
        ),
    )
    conn.commit()
    conn.close()
    return jsonify({"predicted_km": predicted_km, "factors_applied": True})


@app.post("/api/stations/nearby")
def stations_nearby():
    body = request.get_json(force=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400

    destination = body.get("destination") or body.get("place") or ""
    origin_place = body.get("origin_place") or ""
    if not isinstance(destination, str) or not isinstance(origin_place, str):
        return jsonify({"error": "Destination and origin must be text"}), 400
    destination = destination.strip()
    origin_place = origin_place.strip()
    if destination.lower() in {"current location", "destination"}:
        destination = ""
    origin_lat = body.get("origin_lat")
    origin_lon = body.get("origin_lon")
    predicted_range = body.get("predicted_range_km")
    if not destination:
        return jsonify({"error": "destination required"}), 400
    try:
        predicted_range = float(predicted_range)
    except (TypeError, ValueError):
        return jsonify({"error": "predicted_range_km must be a positive number"}), 400
    if not math.isfinite(predicted_range) or predicted_range <= 0:
        return jsonify({"error": "predicted_range_km must be a positive number"}), 400

    try:
        if origin_lat is not None and origin_lon is not None:
            origin_lat = float(origin_lat)
            origin_lon = float(origin_lon)
            if not (
                math.isfinite(origin_lat)
                and math.isfinite(origin_lon)
                and -90 <= origin_lat <= 90
                and -180 <= origin_lon <= 180
            ):
                return jsonify({"error": "Invalid GPS coordinates"}), 400
            origin_coords = (origin_lon, origin_lat)
        else:
            if not origin_place or origin_place.lower() == "current location":
                return jsonify({"error": "Enable GPS to search from your current location"}), 400
            origin_location = geocode_place(origin_place)
            if not origin_location:
                return jsonify({"error": "Could not locate the route starting point"}), 404
            origin_coords = (origin_location[1], origin_location[0])

        destination_coords = geocode_place(destination)
        if not destination_coords:
            return jsonify({"error": "Could not locate the destination. Enter a more specific place and retry."}), 404

        route_coordinates, route_distance_km = fetch_driving_route(
            origin_coords,
            (destination_coords[1], destination_coords[0]),
        )
        reserve_km = round(predicted_range * 0.15, 1)
        safe_range_km = round(predicted_range - reserve_km, 1)
        station_error = None
        route_lookup_failed = False
        try:
            stations = fetch_ev_stations_along_route(route_coordinates, safe_range_km)
        except Exception as exc:
            app.logger.warning("Route charger lookup failed: %s", exc)
            stations = []
            route_lookup_failed = True
            station_error = "Could not load EV stations along this route. Please retry."

        return jsonify({
            "origin": {"lat": origin_coords[1], "lon": origin_coords[0]},
            "destination": destination,
            "lat": destination_coords[0],
            "lon": destination_coords[1],
            "route_coordinates": sample_route_coordinates(route_coordinates),
            "search_source": "driving_route",
            "route_distance_km": route_distance_km,
            "predicted_range_km": round(predicted_range, 1),
            "reserve_percent": 15,
            "reserve_km": reserve_km,
            "safe_range_km": safe_range_km,
            "notice": None,
            "station_error": station_error,
            "stations": stations,
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@app.post("/api/feedback")
def feedback():
    body = request.get_json(force=True) or {}
    name = (body.get("name") or "").strip()
    rating = int(body.get("rating") or 0)
    message = (body.get("message") or "").strip()
    if not name or not message or rating < 1 or rating > 5:
        return jsonify({"error": "Invalid feedback"}), 400
    conn = get_db()
    conn.execute(
        "INSERT INTO feedback (name, rating, message) VALUES (?, ?, ?)",
        (name, rating, message),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


if __name__ == "__main__":
    init_db()
    print("EV Range AI running at http://127.0.0.1:5000")
    print("Open that URL in your browser (do not open HTML files directly).")
    app.run(host="127.0.0.1", port=5000, debug=False)
