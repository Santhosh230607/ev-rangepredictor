(function () {
  const raw = sessionStorage.getItem("ev_last_trip");
  if (!raw) {
    window.location.href = "home.html";
    return;
  }

  const trip = JSON.parse(raw);
  const rangeEl = document.getElementById("predicted-km");
  const warning = document.getElementById("res-warning");
  const backButton = document.getElementById("back-details");
  const stationsButton = document.getElementById("show-stations");

  rangeEl.textContent = Number(trip.predicted_km).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
  if (Number(trip.predicted_km) < 30) {
    warning.textContent = "Low range — review your charge level before starting this trip.";
    warning.classList.remove("hidden");
  }
  backButton.href = `details.html?type=${encodeURIComponent(trip.vehicle_type)}`;
  stationsButton.addEventListener("click", () => {
    window.location.href = "stations.html";
  });
})();
