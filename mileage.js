(function () {
  if (!localStorage.getItem("ev_user")) {
    window.location.href = "login.html";
    return;
  }

  let type = window.EVApp.getVehicleType();
  if (new URLSearchParams(window.location.search).get("type")) {
    type = new URLSearchParams(window.location.search).get("type");
    window.EVApp.setVehicleType(type);
  }
  if (!type) {
    window.location.href = "select-vehicle.html";
    return;
  }

  const route = JSON.parse(sessionStorage.getItem("ev_route") || "{}");
  const startEl = document.getElementById("start-place");
  const destEl = document.getElementById("dest-place");
  if (startEl && route.start) startEl.value = route.start;
  if (destEl && route.dest) destEl.value = route.dest;
  const destDisplay = document.getElementById("dest-display");
  if (destDisplay) destDisplay.textContent = route.dest || destEl?.value || "Set destination";

  document.getElementById("vehicle-label").textContent = window.EVApp.vehicleLabel(type);
  document.querySelectorAll(".vehicle-fields").forEach((el) => el.classList.add("hidden"));
  const fieldMap = {
    "2wheeler": "fields-2wheeler",
    "3wheeler": "fields-3wheeler",
    "4wheeler": "fields-4wheeler",
    lorry: "fields-lorry",
  };
  const show = document.getElementById(fieldMap[type]);
  if (show) show.classList.remove("hidden");

  function collectPayload() {
    const speed = Number(document.getElementById("cruise-speed")?.value || 65);
    const base = {
      vehicle_type: type,
      start_place: startEl.value.trim() || route.start || "Current Location",
      dest_place: destEl.value.trim() || route.dest || "Destination",
      charge_pct: Number(document.getElementById("charge-pct").value),
      weather: document.getElementById("weather").value,
      road_type: document.getElementById("road-type").value,
      cruise_speed: speed,
    };

    if (type === "2wheeler") {
      Object.assign(base, {
        ac_on: document.getElementById("ac-2w").checked,
        riders: Number(document.getElementById("riders-2w").value),
        battery_kwh: Number(document.getElementById("battery-kwh-2w").value),
        rated_range_km: Number(document.getElementById("rated-range-2w").value),
      });
    } else if (type === "3wheeler") {
      Object.assign(base, {
        ac_on: document.getElementById("ac-3w").checked,
        riders: Number(document.getElementById("riders-3w").value),
        cargo_kg: Number(document.getElementById("cargo-3w").value),
        battery_kwh: Number(document.getElementById("battery-kwh-3w").value),
        rated_range_km: Number(document.getElementById("rated-range-3w").value),
      });
    } else if (type === "4wheeler") {
      Object.assign(base, {
        ac_on: document.getElementById("ac-4w").checked,
        riders: Number(document.getElementById("riders-4w").value),
        battery_kwh: Number(document.getElementById("battery-kwh-4w").value),
        rated_range_km: Number(document.getElementById("rated-range-4w").value),
      });
    } else if (type === "lorry") {
      Object.assign(base, {
        ac_on: document.getElementById("ac-lorry").checked,
        load_pct: Number(document.getElementById("load-pct").value),
        cargo_kg: Number(document.getElementById("cargo-kg").value),
        battery_kwh: Number(document.getElementById("battery-kwh-lorry").value),
        rated_range_km: Number(document.getElementById("rated-range-lorry").value),
      });
    }
    return base;
  }

  window.predictRangeClient = function predictRangeClient(p) {
    let factor = 1;
    const weatherF = { mild: 1, hot: 0.88, cold: 0.82, rain: 0.9 };
    const roadF = {
      highway_no_traffic: 0.78,
      traffic_road: 0.92,
      off_road: 0.7,
      mixed_traffic: 0.88,
      non_traffic: 0.95,
    };
    factor *= weatherF[p.weather] || 1;
    factor *= roadF[p.road_type] || 1;
    if (p.ac_on) factor *= 0.9;

    const speed = p.cruise_speed || 65;
    if (speed > 100) factor *= 0.72;
    else if (speed > 80) factor *= 0.85;

    if (p.vehicle_type === "2wheeler") {
      if (p.riders > 1) factor *= 0.92;
    } else if (p.vehicle_type === "3wheeler") {
      if (p.riders > 2) factor *= 0.94;
      if (p.cargo_kg > 50) factor *= Math.max(0.75, 1 - p.cargo_kg / 5000);
    } else if (p.vehicle_type === "4wheeler") {
      if (p.riders > 4) factor *= 0.93;
    } else if (p.vehicle_type === "lorry") {
      factor *= Math.max(0.55, 1 - (p.load_pct || 0) / 200);
      if (p.cargo_kg > 3000) factor *= 0.92;
    }

    const baseRange = (p.rated_range_km * (p.charge_pct / 100)) * factor;
    return Math.round(baseRange * 10) / 10;
  };

  document.getElementById("trip-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("form-error");
    err.hidden = true;
    const payload = collectPayload();

    let predicted_km;
    try {
      const res = await fetch(`${window.EVApp.API_BASE}/api/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      predicted_km = data.predicted_km;
    } catch {
      predicted_km = window.predictRangeClient(payload);
    }

    sessionStorage.setItem("ev_last_trip", JSON.stringify({ ...payload, predicted_km }));
    window.location.href = "result.html";
  });
})();
