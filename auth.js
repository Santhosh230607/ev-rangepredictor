(function () {
  const msg = document.getElementById("auth-message");
  const loginForm = document.getElementById("form-login");
  const signupForm = document.getElementById("form-signup");

  function showMessage(text, isError) {
    if (!msg) return;
    msg.hidden = false;
    msg.textContent = text;
    msg.className = "form-message " + (isError ? "error" : "success");
  }

  async function apiAuth(path, body) {
    const res = await fetch(`${window.EVApp.API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function saveUser(user) {
    localStorage.setItem("ev_user", JSON.stringify(user));
  }

  function localDemoLogin(email, name) {
    saveUser({ email, name: name || email.split("@")[0] });
    window.location.href = "home.html";
  }

  document.getElementById("btn-guest")?.addEventListener("click", () => {
    saveUser({ name: "Guest", email: "guest@routecharge.local" });
    window.location.href = "home.html";
  });

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value;
      try {
        const data = await apiAuth("/api/login", { email, password });
        saveUser(data.user);
        window.location.href = "home.html";
      } catch {
        localDemoLogin(email);
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("signup-name").value.trim();
      const email = document.getElementById("signup-email").value.trim();
      const password = document.getElementById("signup-password").value;
      try {
        const data = await apiAuth("/api/register", { name, email, password });
        saveUser(data.user);
        window.location.href = "home.html";
      } catch {
        localDemoLogin(email, name);
      }
    });
  }
})();
