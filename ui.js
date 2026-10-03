/** RouteCharge UI: nav, sliders, modals, vehicle picker */
(function () {
  const NAV = `
<nav class="bottom-nav" aria-label="Main">
  <a href="home.html" data-nav="map"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 20l-5-2V6l5 2 6-3 5 2v12l-5-2-6 3z"/></svg>Map</a>
  <a href="route.html" data-nav="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>Search</a>
  <a href="feedback.html" data-nav="profile"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>Profile</a>
</nav>`;

  window.RouteChargeUI = {
    mountBottomNav(active) {
      const shell = document.querySelector(".app-shell");
      if (!shell || shell.querySelector(".bottom-nav")) return;
      shell.insertAdjacentHTML("beforeend", NAV);
      shell.querySelectorAll(".bottom-nav a").forEach((a) => {
        if (a.dataset.nav === active) a.classList.add("active");
      });
    },

    bindSliders() {
      document.querySelectorAll("[data-slider-display]").forEach((range) => {
        const out = document.getElementById(range.dataset.sliderDisplay);
        const fmt = range.dataset.format || "{v}";
        const update = () => {
          const min = Number(range.min) || 0;
          const max = Number(range.max) || 100;
          const value = Number(range.value);
          const progress = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
          const width = range.getBoundingClientRect().width;
          const thumbSize = parseFloat(getComputedStyle(range).getPropertyValue("--range-thumb-size")) || 22;
          const fill = `${thumbSize / 2 + progress * Math.max(0, width - thumbSize)}px`;

          if (out) out.textContent = fmt.replace("{v}", range.value);
          range.style.setProperty("--track-fill", fill);
        };
        range.addEventListener("input", update);
        window.addEventListener("resize", update);
        update();
      });
    },

    bindTopoPills() {
      const hidden = document.getElementById("road-type");
      if (!hidden) return;
      document.querySelectorAll(".topo-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          document.querySelectorAll(".topo-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          hidden.value = btn.dataset.road || "non_traffic";
        });
      });
    },

    bindVehicleSelect() {
      const options = document.querySelectorAll(".vehicle-option");
      const confirm = document.getElementById("confirm-vehicle");
      if (!options.length) return;
      let selected = sessionStorage.getItem("ev_vehicle_type") || "4wheeler";
      options.forEach((opt) => {
        if (opt.dataset.type === selected) opt.classList.add("selected");
        opt.addEventListener("click", () => {
          selected = opt.dataset.type;
          options.forEach((o) => o.classList.remove("selected"));
          opt.classList.add("selected");
          if (window.EVApp) window.EVApp.setVehicleType(selected);
        });
      });
      if (confirm) {
        confirm.addEventListener("click", () => {
          if (window.EVApp) window.EVApp.setVehicleType(selected);
          window.location.href = `details.html?type=${selected}`;
        });
      }
    },

    showLocationModalIfNeeded() {
      const key = "ev_location_ok";
      const backdrop = document.getElementById("location-modal");
      if (!backdrop || localStorage.getItem(key)) return;
      backdrop.classList.remove("hidden");
      backdrop.querySelectorAll("[data-loc-allow]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const originalText = btn.textContent;
          btn.disabled = true;
          btn.textContent = "Locating...";
          window.EVApp.requestLocation().then(() => {
            localStorage.setItem(key, "1");
            backdrop.classList.add("hidden");
          }).catch(() => {
            btn.disabled = false;
            btn.textContent = originalText;
          });
        });
      });
      const deny = backdrop.querySelector("[data-loc-deny]");
      if (deny) {
        deny.addEventListener("click", () => backdrop.classList.add("hidden"));
      }
    },

    tempToWeather(temp) {
      const t = Number(temp);
      if (t >= 35) return "hot";
      if (t <= 10) return "cold";
      return "mild";
    },

    syncWeatherFromTemp() {
      const temp = document.getElementById("ambient-temp");
      const weather = document.getElementById("weather");
      if (!temp || !weather) return;
      temp.addEventListener("input", () => {
        weather.value = RouteChargeUI.tempToWeather(temp.value);
      });
    },
  };

  document.addEventListener("DOMContentLoaded", () => {
    RouteChargeUI.bindSliders();
    RouteChargeUI.bindTopoPills();
    RouteChargeUI.bindVehicleSelect();
    RouteChargeUI.showLocationModalIfNeeded();
    RouteChargeUI.syncWeatherFromTemp();
  });
})();
