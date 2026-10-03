/** Shared UI helpers */
(function () {
  const API_BASE = window.location.origin;

  window.EVApp = {
    API_BASE,
    requestLocation() {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Geolocation is not supported by this browser."));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const location = {
              lat: position.coords.latitude,
              lon: position.coords.longitude,
            };
            sessionStorage.setItem("ev_gps", JSON.stringify(location));
            resolve(location);
          },
          (error) => reject(error),
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 300000 },
        );
      });
    },
    getVehicleType() {
      return new URLSearchParams(window.location.search).get("type") || sessionStorage.getItem("ev_vehicle_type");
    },
    setVehicleType(type) {
      sessionStorage.setItem("ev_vehicle_type", type);
    },
    vehicleLabel(type) {
      const map = {
        "2wheeler": "2 Wheeler",
        "3wheeler": "3 Wheeler",
        "4wheeler": "4 Wheeler",
        lorry: "Lorry (loaded)",
      };
      return map[type] || type;
    },
  };

  document.querySelectorAll(".tabs, .tabs-inline").forEach((tabBar) => {
    tabBar.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.tab;
        tabBar.querySelectorAll(".tab").forEach((b) => {
          b.classList.toggle("active", b.dataset.tab === mode);
          b.setAttribute("aria-selected", b.dataset.tab === mode ? "true" : "false");
        });
        const loginForm = document.getElementById("form-login");
        const signupForm = document.getElementById("form-signup");
        if (loginForm && signupForm) {
          loginForm.classList.toggle("hidden", mode !== "login");
          signupForm.classList.toggle("hidden", mode !== "signup");
        }
      });
    });
  });

  document.querySelectorAll(".vehicle-card").forEach((card) => {
    card.addEventListener("click", () => {
      const type = card.dataset.type;
      if (type) window.EVApp.setVehicleType(type);
    });
  });
})();
