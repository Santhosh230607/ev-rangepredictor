(function () {

  const raw = sessionStorage.getItem("ev_last_trip");

  if (!raw) {

    window.location.href = "home.html";

    return;

  }

  const trip = JSON.parse(raw);
  let gps = JSON.parse(sessionStorage.getItem("ev_gps") || "null");



  const destinationEl = document.getElementById("dest-display");
  if (destinationEl) destinationEl.textContent = trip.dest_place;
  const routeEl = document.getElementById("route-display");
  if (routeEl) routeEl.textContent = `${trip.start_place} → ${trip.dest_place}`;
  const statusEl = document.getElementById("location-status");
  const listEl = document.getElementById("station-list");
  const countEl = document.getElementById("station-count");
  const gpsButton = document.getElementById("enable-gps-result");
  const retryButton = document.getElementById("retry-stations");
  const map = typeof L !== "undefined"
    ? L.map("route-map", { scrollWheelZoom: false }).setView(
      gps ? [Number(gps.lat), Number(gps.lon)] : [20, 0],
      gps ? 13 : 2,
    )
    : null;
  if (!map) {
    document.getElementById("route-map").textContent = "The interactive map could not load. Check your internet connection and reload.";
  }
  const mapLayers = map ? L.featureGroup().addTo(map) : null;
  if (map) {
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
  }

  function addMapPopup(marker, title, details) {
    const popup = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = title;
    popup.appendChild(heading);
    if (details) {
      const description = document.createElement("div");
      description.textContent = details;
      popup.appendChild(description);
    }
    marker.bindPopup(popup);
  }

  function renderMap(data) {
    if (!map || !mapLayers) return;
    mapLayers.clearLayers();
    const bounds = [];
    const origin = data?.origin || gps;
    if (origin && Number.isFinite(Number(origin.lat)) && Number.isFinite(Number(origin.lon))) {
      const point = [Number(origin.lat), Number(origin.lon)];
      const marker = L.marker(point).addTo(mapLayers);
      addMapPopup(marker, "Starting point", trip.start_place);
      bounds.push(point);
    }

    const routeCoordinates = data?.route_coordinates || [];
    if (routeCoordinates.length > 1) {
      const route = routeCoordinates.map(([lon, lat]) => [Number(lat), Number(lon)]);
      L.polyline(route, { color: "#20c96b", weight: 5, opacity: 0.9 }).addTo(mapLayers);
      bounds.push(...route);
    }

    if (data && data.lat != null && data.lon != null
      && Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lon))) {
      const point = [Number(data.lat), Number(data.lon)];
      const marker = L.marker(point).addTo(mapLayers);
      addMapPopup(marker, "Destination", trip.dest_place);
      bounds.push(point);
    }

    (data?.stations || []).forEach((station) => {
      if (station.lat == null || station.lon == null
        || !Number.isFinite(Number(station.lat)) || !Number.isFinite(Number(station.lon))) return;
      const point = [Number(station.lat), Number(station.lon)];
      const marker = L.circleMarker(point, {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: "#39ff7c",
        fillOpacity: 1,
      }).addTo(mapLayers);
      addMapPopup(marker, station.name || "EV charging station", station.address || "");
      bounds.push(point);
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 13);
    }
    setTimeout(() => map.invalidateSize(), 0);
  }

  renderMap(null);
  let stationOrigin = null;
  function renderStations(stations) {

    listEl.innerHTML = "";

    if (countEl) countEl.textContent = `${stations.length} Found`;

    if (!stations.length) {

      listEl.innerHTML = '<p class="muted">No stations found nearby.</p>';

      return;

    }

    stations.forEach((s, i) => {

      const card = document.createElement("div");

      card.className = "charger-card";

      const origin = stationOrigin || gps;
      const directionsUrl = s.lat != null && s.lon != null
        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${s.lat},${s.lon}`)}${origin ? `&origin=${encodeURIComponent(`${origin.lat},${origin.lon}`)}` : `&origin=${encodeURIComponent(trip.start_place)}`}&travelmode=driving`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name)}`;
      card.innerHTML = `

        <div class="thumb"><img src="charger-placeholder.svg" alt="EV charging station"></div>

        <div class="body">

          <h3>${escapeHtml(s.name)}</h3>

          <div class="addr">${escapeHtml(s.address || "Along your route")}</div>

          <div class="charger-meta">

            <span class="kw">${i === 0 ? "✓ First reachable charger" : "⚡ Route charging station"}</span>
            <span>↗ ${s.route_distance_km} km into route</span>
            <span>↔ ${s.distance_from_route_km} km from route</span>

          </div>

        </div>

        <a class="btn btn-primary btn-sm" href="${directionsUrl}" target="_blank" rel="noopener">Go</a>`;

      listEl.appendChild(card);

    });

  }



  function escapeHtml(t) {

    const d = document.createElement("div");

    d.textContent = t || "";

    return d.innerHTML;

  }



  async function loadStations() {
    const hasDestination = trip.dest_place && trip.dest_place.trim() && trip.dest_place !== "Destination";
    const usesGpsOrigin = trip.start_place.trim().toLowerCase() === "current location";
    const hasGps = gps && Number.isFinite(Number(gps.lat)) && Number.isFinite(Number(gps.lon));
    if ((!hasGps && usesGpsOrigin) || !hasDestination) {
      statusEl.textContent = !hasDestination
        ? "Set a destination to find chargers along your route."
        : "Enable GPS to find chargers along your route.";
      renderStations([]);
      return;
    }

    statusEl.textContent = "Calculating your route and finding chargers within your safe range…";

    let requestTimeout;
    try {

      const controller = new AbortController();
      requestTimeout = setTimeout(() => controller.abort(), 90000);
      const res = await fetch(`${window.EVApp.API_BASE}/api/stations/nearby`, {

        method: "POST",

        headers: { "Content-Type": "application/json" },
        signal: controller.signal,

        body: JSON.stringify({
          destination: trip.dest_place,
          origin_place: usesGpsOrigin ? "" : trip.start_place,
          ...(usesGpsOrigin ? { origin_lat: gps.lat, origin_lon: gps.lon } : {}),
          predicted_range_km: Number(trip.predicted_km),
        }),

      });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const message = res.status >= 500
          ? `The charger server failed with HTTP ${res.status}. Check the Render service logs for the traceback.`
          : `The charger API returned an unexpected page (HTTP ${res.status}). Check that the app is deployed as a Flask web service.`;
        throw new Error(message);
      }
      const data = await res.json();
      clearTimeout(requestTimeout);

      if (!res.ok) throw new Error(data.error);

      stationOrigin = data.origin;
      renderMap(data);
      retryButton?.classList.toggle("hidden", !data.station_error);
      statusEl.textContent = data.station_error || `Showing all charging stations along the route up to ${data.safe_range_km} km from the start, keeping a 15% range reserve.`;

      renderStations(data.stations || []);
      if (!data.stations || !data.stations.length) {
        listEl.innerHTML = `<p class="muted">${data.station_error || `No charging stations were found along the route before the safe predicted range ends (${data.safe_range_km} km). Try a different route or increase the starting charge.`}</p>`;
      }

    } catch (error) {

      clearTimeout(requestTimeout);
      const errorMessage = error.name === "AbortError"
        ? "The map service took too long to respond. Your starting point is shown; try the charger search again."
        : error.message || "Could not load nearby chargers.";
      statusEl.textContent = errorMessage;
      if (countEl) countEl.textContent = "Unavailable";
      retryButton?.classList.remove("hidden");
      listEl.textContent = "";
      const errorNotice = document.createElement("p");
      errorNotice.className = "muted";
      errorNotice.textContent = statusEl.textContent;
      listEl.appendChild(errorNotice);

    }

  }



  async function enableGpsAndLoad() {
    if (!gpsButton) return;
    gpsButton.disabled = true;
    gpsButton.textContent = "Requesting live location...";
    try {
      gps = await window.EVApp.requestLocation();
      gpsButton.classList.add("hidden");
      renderMap(null);
      await loadStations();
    } catch {
      statusEl.textContent = "Location access was blocked. Enable GPS in your browser and try again.";
      gpsButton.disabled = false;
      gpsButton.textContent = "Try live GPS again";
      renderStations([]);
    }
  }

  if (gpsButton) gpsButton.addEventListener("click", enableGpsAndLoad);
  if (retryButton) retryButton.addEventListener("click", loadStations);
  const needsGpsForOrigin = trip.start_place.trim().toLowerCase() === "current location";
  if (needsGpsForOrigin && !gps) {
    if (gpsButton) gpsButton.classList.remove("hidden");
    statusEl.textContent = "Enable GPS to find chargers along your route.";
  } else {
    gpsButton?.classList.add("hidden");
    loadStations();
  }

})();
