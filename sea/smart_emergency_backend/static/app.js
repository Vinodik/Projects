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
                document.getElementById("signup-msg").textContent = "Account Created...";
                setTimeout(() => window.location.href = "/", 1200);
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
                document.getElementById("login-msg").textContent = "Login Successful...";
                const redirectUrl = data.redirect || "/home";
                setTimeout(() => window.location.href = redirectUrl, 1200);
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
    } else {
        window.location.href = "/";
    }
}

function logout() {
    localStorage.removeItem("user");
    window.location.href = "/";
}

// ----------------- REQUEST FORM -----------------
const requestForm = document.getElementById("request-form");
if (requestForm) {
    let selectedLat, selectedLng;
    let pickerMarker;
    let mapPicker;

    const mapPickerDiv = document.getElementById("map-picker");
    if (mapPickerDiv) {
        mapPicker = L.map("map-picker").setView([12.9716, 77.5946], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors"
        }).addTo(mapPicker);

        mapPicker.on("click", async e => {
            selectedLat = e.latlng.lat;
            selectedLng = e.latlng.lng;

            if (pickerMarker) pickerMarker.setLatLng([selectedLat, selectedLng]);
            else pickerMarker = L.marker([selectedLat, selectedLng], { draggable: true }).addTo(mapPicker);

            await updateAddress(selectedLat, selectedLng);

            pickerMarker.on("dragend", async () => {
                const pos = pickerMarker.getLatLng();
                selectedLat = pos.lat;
                selectedLng = pos.lng;
                await updateAddress(selectedLat, selectedLng);
            });
        });
    }

    async function updateAddress(lat, lng) {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
            const data = await res.json();
            document.getElementById("r-address").value = data.display_name || `${lat}, ${lng}`;
        } catch {
            document.getElementById("r-address").value = `${lat}, ${lng}`;
        }
    }

    requestForm.addEventListener("submit", async e => {
        e.preventDefault();
        const phone = document.getElementById("r-phone").value.trim();
        const resource = document.getElementById("r-type").value;
        const address = document.getElementById("r-address").value.trim();

        if ((!selectedLat || !selectedLng) && address) {
            try {
                const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
                const geoData = await geoRes.json();
                if (geoData && geoData.length > 0) {
                    selectedLat = parseFloat(geoData[0].lat);
                    selectedLng = parseFloat(geoData[0].lon);
                }
            } catch {}
        }

        if (!phone || !resource || !address || !selectedLat || !selectedLng) {
            document.getElementById("request-msg").textContent = "❌ Please fill all fields and select your location!";
            return;
        }

        try {
            const res = await fetch("/api/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone, resource, address, latitude: selectedLat, longitude: selectedLng })
            });
            const data = await res.json();
            document.getElementById("request-msg").textContent = data.message || "Request sent!";
            if (res.ok) {
                requestForm.reset();          // Reset the form
                selectedLat = selectedLng = null;  // Clear selected coordinates
                if (pickerMarker && mapPicker) mapPicker.removeLayer(pickerMarker);

                // Redirect user to dashboard
                setTimeout(() => {
                    window.location.href = "/dashboard";
                }, 1000);
            }

        } catch (err) {
            document.getElementById("request-msg").textContent = "❌ Server error!";
        }
    });
}

// ----------------- DASHBOARD MAP -----------------
let dashboardMap;
const markers = {};
let volunteerTrackingMarker;

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

    requestsList.innerHTML = "";
    const user = JSON.parse(localStorage.getItem("user")) || {};
    try {
        const res = await fetch("/api/requests");
        const requests = await res.json();
        if (!requests.length) {
            requestsList.innerHTML = "<p>No requests made yet.</p>";
        } else {
            requestsList.innerHTML = "";
            requests.forEach(req => {
                const reqKey = `request-${req.id}`;
                if (!markers[reqKey] && req.latitude && req.longitude) {
                    const marker = L.marker([req.latitude, req.longitude], {
                        icon: L.icon({
                            iconUrl: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
                            iconSize: [32, 32],
                            iconAnchor: [16, 32],
                        }),
                        title: req.resource
                    }).addTo(dashboardMap).bindPopup(`<strong>${req.resource}</strong><br>${req.address}<br>Status: ${req.status || 'Pending'}`);
                    markers[reqKey] = marker;
                }

                const div = document.createElement("div");
                div.className = "request-item card";
                div.dataset.id = req.id;   // <-- ADD THIS LINE
                div.innerHTML = `
                    <strong>${req.resource}</strong><br>
                    Address: ${req.address}<br>
                    Phone: ${req.phone}<br>
                    Time: ${req.time}
                `;
                requestsList.appendChild(div);
            });
    }

    } catch {
        requestsList.innerHTML = "<p>Failed to load requests.</p>";
    }

    // ------------------ VOLUNTEERS ------------------
    try {
        const res = await fetch("/api/helpers");
        const volunteers = await res.json();
        volunteers.forEach(v => {
            const volKey = `helper-${v.name}-${v.request_id}`;
            if (markers[volKey]) {
                markers[volKey].setLatLng([v.latitude, v.longitude]);
            } else {
                const marker = L.marker([v.latitude, v.longitude], {
                    icon: L.icon({
                        iconUrl: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
                        iconSize: [32, 32],
                        iconAnchor: [16, 32],
                    }),
                    title: v.name
                }).addTo(dashboardMap).bindPopup(`<strong>${v.name}</strong>`);
                markers[volKey] = marker;
            }
        });
    } catch { console.log("Failed to load volunteers."); }

    // ------------------ NGOS ------------------
    try {
        const ngos = document.querySelectorAll(".ngo-list li");
        ngos.forEach(ngo => {
            const lat = parseFloat(ngo.dataset.lat);
            const lon = parseFloat(ngo.dataset.lon);
            const name = ngo.textContent;
            const ngoKey = `ngo-${name}`;
            if (!markers[ngoKey]) {
                const marker = L.marker([lat, lon], {
                    icon: L.icon({
                        iconUrl: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
                        iconSize: [32, 32],
                        iconAnchor: [16, 32],
                    }),
                    title: name
                }).addTo(dashboardMap).bindPopup(`<strong>${name}</strong>`);
                markers[ngoKey] = marker;
            }
        });
    } catch { console.log("Failed to load NGOs."); }

    // ------------------ REAL-TIME VOLUNTEER + NGO TRACKING ------------------
const userRequestId = mapDiv.dataset.requestId;
if (userRequestId && userRequestId != 0) {
    try {
        const res = await fetch(`/api/accept_request/${userRequestId}`, { method: 'POST' });
        const data = await res.json();

        if (data.success && data.latitude && data.longitude) {
            // Update request status in dashboard
            const requestDiv = document.querySelector(`.request-item[data-id='${userRequestId}']`);
            if (requestDiv) requestDiv.innerHTML = requestDiv.innerHTML.replace(/Status:.*<br>/, "Status: On The Way<br>");

            const userLatLng = [parseFloat(data.latitude), parseFloat(data.longitude)];

            // Volunteer location marker
            if (data.volunteer_lat && data.volunteer_lng) {
                const volLatLng = [parseFloat(data.volunteer_lat), parseFloat(data.volunteer_lng)];
                if (volunteerTrackingMarker) volunteerTrackingMarker.setLatLng(volLatLng);
                else {
                    volunteerTrackingMarker = L.marker(volLatLng, {
                        icon: L.icon({
                            iconUrl: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
                            iconSize: [32, 32],
                            iconAnchor: [16, 32],
                        }),
                        title: "Volunteer Location"
                    }).addTo(dashboardMap);
                }

                // Draw line volunteer → user
                if (typeof volunteerLine !== "undefined") dashboardMap.removeLayer(volunteerLine);
                volunteerLine = L.polyline([volLatLng, userLatLng], { color: 'blue', weight: 3 }).addTo(dashboardMap);

                const distance = dashboardMap.distance(userLatLng, volLatLng).toFixed(2);
                volunteerTrackingMarker.bindPopup(`Volunteer Location - ${distance} meters away`).openPopup();
            }

            // Center map
            dashboardMap.setView(userLatLng, 13);
        }

    } catch { console.log("Failed to fetch volunteer or NGO location."); }
}
}
// ----------------- INITIALIZE DASHBOARD MAP -----------------
document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("map")) initDashboardMap();
    setInterval(() => {
        if (document.getElementById("map")) initDashboardMap();
    }, 5000);
});

// ----------------- USE MY LOCATION BUTTON -----------------
const useLocationBtn = document.getElementById("use-location-btn");
if (useLocationBtn) {
    useLocationBtn.addEventListener("click", () => {
        if (!navigator.geolocation) return alert("Geolocation not supported!");
        useLocationBtn.textContent = "Locating...";
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            if (typeof mapPicker !== "undefined" && mapPicker) {
                mapPicker.setView([lat, lon], 16);
                if (pickerMarker) pickerMarker.setLatLng([lat, lon]);
                else pickerMarker = L.marker([lat, lon], { draggable: true }).addTo(mapPicker);
                selectedLat = lat;
                selectedLng = lon;

                pickerMarker.on("dragend", async () => {
                    const pos = pickerMarker.getLatLng();
                    selectedLat = pos.lat;
                    selectedLng = pos.lng;
                    await updateAddress(selectedLat, selectedLng);
                });
            }

            const addressField = document.getElementById("r-address");
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
                const data = await res.json();
                addressField.value = data.display_name || `${lat}, ${lon}`;
            } catch {
                addressField.value = `${lat}, ${lon}`;
            } finally {
                useLocationBtn.textContent = "Use My Location";
            }
        }, () => {
            useLocationBtn.textContent = "Use My Location";
            alert("Unable to get location");
        }, { enableHighAccuracy: true, timeout: 20000 });
    });
}

// ----------------- VOLUNTEER PAGE -----------------
if (document.getElementById("volunteer-form")) {
    let trackingInterval;
    const volunteerForm = document.getElementById("volunteer-form");

    volunteerForm.addEventListener("submit", e => {
        e.preventDefault();
        const name = document.getElementById("v-name").value.trim();
        const phone = document.getElementById("v-phone").value.trim();
        const requestId = document.getElementById("v-request").value;

        if (!name || !phone || !requestId) {
            document.getElementById("volunteer-msg").textContent = "❌ Please fill all fields!";
            return;
        }

        if (!navigator.geolocation) {
            document.getElementById("volunteer-msg").textContent = "❌ Geolocation not supported!";
            return;
        }

        if (trackingInterval) clearInterval(trackingInterval);
        trackingInterval = setInterval(() => {
            navigator.geolocation.getCurrentPosition(async pos => {
                const latitude = pos.coords.latitude;
                const longitude = pos.coords.longitude;
                try {
                    await fetch("/api/update_helper_location", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name, phone, request_id: requestId, latitude, longitude })
                    });
                    document.getElementById("volunteer-msg").textContent = `✅ Tracking active... (${new Date().toLocaleTimeString()})`;

                    if (typeof dashboardMap !== "undefined") {
                        const existingMarker = dashboardMap._layers && Object.values(dashboardMap._layers).find(l => l.options && l.options.title === name);
                        if (existingMarker) {
                            existingMarker.setLatLng([latitude, longitude]);
                        } else {
                            L.marker([latitude, longitude], {
                                icon: L.icon({
                                    iconUrl: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
                                    iconSize: [32, 32],
                                    iconAnchor: [16, 32],
                                }),
                                title: name
                            }).addTo(dashboardMap).bindPopup(`<strong>${name}</strong> (You)`);
                        }
                    }
                } catch {
                    document.getElementById("volunteer-msg").textContent = "❌ Server error!";
                }
            }, () => {
                document.getElementById("volunteer-msg").textContent = "❌ Unable to get location!";
            });
        }, 5000);
    });

    async function loadVolunteerRequests() {
        const requestsList = document.getElementById("volunteer-requests-list");
        if (!requestsList) return;

        try {
            const res = await fetch("/api/requests");
            const requests = await res.json();
            requestsList.innerHTML = "";

            requests.forEach(req => {
                const div = document.createElement("div");
                div.className = "request-item card";
                div.innerHTML = `
                    <strong>${req.resource}</strong><br> 
                    Address: ${req.address}<br> 
                    Phone: ${req.phone}<br> 
                    Time: ${req.time}<br> 
                    <button class="accept-btn" data-id="${req.id}">Accept</button>
                    <button class="reject-btn" data-id="${req.id}">Reject</button>
                    <button class="delete-btn" data-id="${req.id}">Delete</button>
                `;
                requestsList.appendChild(div);
            });

            document.querySelectorAll(".delete-btn").forEach(btn => {
                btn.addEventListener("click", async () => {
                    const id = btn.dataset.id;
                    if (!confirm("Are you sure you want to delete this request?")) return;
                    try {
                        const res = await fetch(`/api/delete_request/${id}`, { method: "DELETE" });
                        const data = await res.json();
                        if (res.ok) { alert(data.message); loadVolunteerRequests(); } 
                        else { alert(`❌ ${data.message}`); }
                    } catch {
                        alert("❌ Server error!");
                    }
                });
            });

            document.querySelectorAll(".reject-btn").forEach(btn => {
                btn.addEventListener("click", async () => {
                    const id = btn.dataset.id;
                    if (!confirm("Are you sure you want to reject this request?")) return;
                    try {
                        const res = await fetch(`/api/delete_request/${id}`, { method: "DELETE" });
                        const data = await res.json();
                        if (res.ok) { alert("Request rejected!"); loadVolunteerRequests(); } 
                        else { alert(`❌ ${data.message}`); }
                    } catch {
                        alert("❌ Server error!");
                    }
                });
            });

        } catch {
            requestsList.innerHTML = "<p>Failed to load requests.</p>";
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        if (document.getElementById("volunteer-requests-list")) loadVolunteerRequests();
        setInterval(() => {
            if (document.getElementById("volunteer-requests-list")) loadVolunteerRequests();
        }, 10000);
    });
}
