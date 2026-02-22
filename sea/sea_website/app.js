// ----------------- FOOTER YEAR -----------------
document.addEventListener("DOMContentLoaded", () => {
  const yearSpan = document.getElementById("year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();
});

// ----------------- SIGNUP -----------------
const signupForm = document.getElementById("signup-form");
if (signupForm) {
  signupForm.addEventListener("submit", async e => {
    e.preventDefault();
    const name = document.getElementById("signup-name").value.trim();
    const phone = document.getElementById("signup-phone").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const pass = document.getElementById("signup-pass").value;
    const confirm = document.getElementById("signup-confirm").value;

    if (pass !== confirm) {
      document.getElementById("signup-msg").textContent = "❌ Passwords do not match!";
      return;
    }

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, pass })
      });
      const data = await res.json();
      if (res.ok) {
        document.getElementById("signup-msg").textContent = "✅ Account created! Redirecting...";
        setTimeout(() => window.location.href = "index.html", 1200);
      } else {
        document.getElementById("signup-msg").textContent = `❌ ${data.message}`;
      }
    } catch (err) {
      document.getElementById("signup-msg").textContent = "❌ Server error!";
    }
  });
}

// ----------------- LOGIN -----------------
const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const pass = document.getElementById("login-pass").value;

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, pass })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("user", JSON.stringify(data.user));
        document.getElementById("login-msg").textContent = "✅ Login successful! Redirecting...";
        setTimeout(() => window.location.href = "home.html", 1200);
      } else {
        document.getElementById("login-msg").textContent = `❌ ${data.message}`;
      }
    } catch (err) {
      document.getElementById("login-msg").textContent = "❌ Server error!";
    }
  });
}

// ----------------- PROFILE -----------------
if (document.getElementById("p-name")) {
  const user = JSON.parse(localStorage.getItem("user"));
  if (user) {
    document.getElementById("p-name").textContent = user.name;
    document.getElementById("p-email").textContent = user.email;
    document.getElementById("p-phone").textContent = user.phone;
  }
}

function logout() {
  localStorage.removeItem("user");
  window.location.href = "index.html";
}

// ----------------- REQUEST FORM (Home Page) -----------------
const requestForm = document.getElementById("request-form");
if (requestForm) {
  requestForm.addEventListener("submit", async e => {
    e.preventDefault();

    const phone = document.getElementById("r-phone").value.trim();
    const resource = document.getElementById("r-type").value;
    const address = document.getElementById("r-address").value.trim();

    if (!phone || !resource || !address) {
      document.getElementById("request-msg").textContent = "❌ Please fill all fields!";
      return;
    }

    try {
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, resource, address })
      });
      const data = await res.json();
      document.getElementById("request-msg").textContent = data.message;
      if (res.ok) requestForm.reset();
    } catch (err) {
      document.getElementById("request-msg").textContent = "❌ Server error!";
    }
  });
}

// ----------------- DASHBOARD MAP & ACTIVE REQUESTS -----------------
let dashboardMap;
async function initDashboardMap() {
  const mapDiv = document.getElementById("map");
  const requestsList = document.getElementById("requests-list");
  if (!mapDiv || !requestsList) return;

  if (!dashboardMap) {
    dashboardMap = L.map("map").setView([12.9716, 77.5946], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(dashboardMap);
  } else {
    dashboardMap.invalidateSize();
  }

  // Fetch active requests from backend
  requestsList.innerHTML = "";
  try {
    const res = await fetch("/api/requests");
    const requests = await res.json();

    if (requests.length === 0) {
      requestsList.innerHTML = "<p>No active requests.</p>";
    }

    requests.forEach(req => {
      const div = document.createElement("div");
      div.className = "request-item card";
      div.innerHTML = `<strong>${req.resource}</strong><br>Address: ${req.address}<br>Phone: ${req.phone}<br>Time: ${req.time}`;

      div.addEventListener("click", async () => {
        const geocoderUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(req.address)}`;
        const geoRes = await fetch(geocoderUrl);
        const data = await geoRes.json();
        if (data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          dashboardMap.setView([lat, lon], 15);
          L.marker([lat, lon])
            .addTo(dashboardMap)
            .bindPopup(`<strong>${req.resource}</strong><br>${req.address}<br>${req.phone}`)
            .openPopup();
        }
      });

      requestsList.appendChild(div);
    });
  } catch (err) {
    requestsList.innerHTML = "<p>Failed to load requests.</p>";
  }

  // Add NGOs
  const ngoItems = document.querySelectorAll(".ngo-list li");
  ngoItems.forEach(item => {
    const lat = parseFloat(item.getAttribute("data-lat"));
    const lon = parseFloat(item.getAttribute("data-lon"));
    const name = item.textContent;
    if (!isNaN(lat) && !isNaN(lon)) {
      L.marker([lat, lon], {
        icon: L.icon({
          iconUrl: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        })
      })
      .addTo(dashboardMap)
      .bindPopup(`<strong>${name}</strong> (NGO)`);
    }
  });

  // Add Volunteers
  const volunteerItems = document.querySelectorAll(".volunteer-list li");
  volunteerItems.forEach(item => {
    const lat = parseFloat(item.getAttribute("data-lat"));
    const lon = parseFloat(item.getAttribute("data-lon"));
    const name = item.textContent;
    if (!isNaN(lat) && !isNaN(lon)) {
      L.marker([lat, lon], {
        icon: L.icon({
          iconUrl: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        })
      })
      .addTo(dashboardMap)
      .bindPopup(`<strong>${name}</strong> (Volunteer)`);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("map")) initDashboardMap();
});
