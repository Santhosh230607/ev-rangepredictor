(function () {
  const form = document.getElementById("feedback-form");
  const box = document.getElementById("fb-message-box");
  const user = JSON.parse(localStorage.getItem("ev_user") || "null");
  if (user && user.name) {
    const nameInput = document.getElementById("fb-name");
    if (nameInput && !nameInput.value) nameInput.value = user.name;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      name: document.getElementById("fb-name").value.trim(),
      rating: Number(document.getElementById("fb-rating").value),
      message: document.getElementById("fb-message").value.trim(),
    };

    try {
      const res = await fetch(`${window.EVApp.API_BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      box.hidden = false;
      box.className = "form-message success";
      box.textContent = "Thank you! Your feedback was saved.";
      form.reset();
    } catch {
      box.hidden = false;
      box.className = "form-message success";
      box.textContent = "Thank you! (Demo mode — start START.bat to save to database.)";
    }
  });
})();
