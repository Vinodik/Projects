from flask import Flask, request, jsonify, render_template, redirect, url_for
from flask_cors import CORS
import sqlite3
from datetime import datetime
import os
import requests as py_requests  # avoid conflict with Flask's request
import urllib.parse
from twilio.rest import Client  # ✅ Added for Twilio

app = Flask(__name__)
CORS(app)

DB_FILE = os.path.join(os.path.dirname(__file__), "database.db")

# ----------------- DATABASE SETUP -----------------
def init_db():
    with sqlite3.connect(DB_FILE) as conn:
        c = conn.cursor()
        # USERS TABLE
        c.execute('''CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT, phone TEXT, email TEXT UNIQUE, password TEXT)''')

        # REQUESTS TABLE
        c.execute('''CREATE TABLE IF NOT EXISTS requests (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        phone TEXT,
                        resource TEXT,
                        address TEXT,
                        time TEXT)''')

        # Add latitude & longitude if not exist
        c.execute("PRAGMA table_info(requests)")
        columns = [row[1] for row in c.fetchall()]
        if "latitude" not in columns:
            c.execute("ALTER TABLE requests ADD COLUMN latitude REAL")
        if "longitude" not in columns:
            c.execute("ALTER TABLE requests ADD COLUMN longitude REAL")

        # Add status column if not exist
        if "status" not in columns:
            c.execute("ALTER TABLE requests ADD COLUMN status TEXT DEFAULT 'Pending'")


        # HELPERS TABLE
        c.execute('''CREATE TABLE IF NOT EXISTS helpers (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT,
                        phone TEXT,
                        latitude REAL,
                        longitude REAL,
                        request_id INTEGER)''')
        conn.commit()

init_db()

# ----------------- HTML ROUTES -----------------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/signup")
def signup_page():
    return render_template("signup.html")

@app.route("/home")
def home_page():
    return render_template("home.html")

@app.route("/profile")
def profile_page():
    return render_template("profile.html")

@app.route("/dashboard")
def dashboard_page():
    """
    Updated for real-time volunteer tracking.
    Pass current_request_id to dashboard.html
    """
    current_request_id = 0  # default if no request
    with sqlite3.connect(DB_FILE) as conn:
        c = conn.cursor()
        c.execute("SELECT id FROM requests ORDER BY id DESC LIMIT 1")
        row = c.fetchone()
        if row:
            current_request_id = row[0]

    return render_template("dashboard.html", current_request_id=current_request_id)

@app.route("/contact")
def contact_page():
    return render_template("contact.html")

@app.route("/volunteer")
def volunteer_page():
    return render_template("volunteer.html")

# ----------------- HELPER FUNCTIONS -----------------
def get_whatsapp_link(phone, resource, address):
    try:
        geo_res = py_requests.get(f"https://nominatim.openstreetmap.org/search?format=json&q={urllib.parse.quote(address)}", timeout=5)
        geo_res.raise_for_status()
        geo_data = geo_res.json()
        if geo_data:
            lat, lon = geo_data[0]["lat"], geo_data[0]["lon"]
            maps_link = f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"
            message = f"{resource} request received. Location: {maps_link}"
            return f"https://wa.me/{phone}?text={urllib.parse.quote(message)}"
    except Exception as e:
        print("Geo lookup failed:", e)
    return f"https://wa.me/{phone}?text={urllib.parse.quote(resource+' request received.')}"

# ----------------- API ROUTES -----------------
@app.route("/api/signup", methods=["POST"])
def api_signup():
    data = request.get_json()
    if not data:
        return jsonify({"message": "Invalid JSON"}), 400
    name = data.get("name")
    phone = data.get("phone")
    email = data.get("email")
    password = data.get("pass")
    if not all([name, phone, email, password]):
        return jsonify({"message": "All fields required"}), 400
    try:
        with sqlite3.connect(DB_FILE) as conn:
            c = conn.cursor()
            c.execute("INSERT INTO users (name, phone, email, password) VALUES (?, ?, ?, ?)",
                      (name, phone, email, password))
            conn.commit()
        return jsonify({"message": "Account created!"}), 200
    except sqlite3.IntegrityError:
        return jsonify({"message": "Email already exists!"}), 400

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json()
    if not data:
        return jsonify({"message": "Invalid JSON"}), 400
    email = data.get("email")
    password = data.get("pass")
    if not all([email, password]):
        return jsonify({"message": "All fields required"}), 400

    ngo_email = "volunteer@ngo.com"
    ngo_pass = "volunteer123"
    if email == ngo_email and password == ngo_pass:
        return jsonify({
            "user": {"id": 0, "name": "Volunteer/NGO", "email": ngo_email},
            "redirect": "/volunteer"
        }), 200

    with sqlite3.connect(DB_FILE) as conn:
        c = conn.cursor()
        c.execute("SELECT id, name, phone, email FROM users WHERE email=? AND password=?", (email, password))
        user = c.fetchone()
    if user:
        return jsonify({
            "user": {"id": user[0], "name": user[1], "phone": user[2], "email": user[3]},
            "redirect": "/home"
        }), 200

    return jsonify({"message": "Invalid credentials!"}), 400

# ----------------- REQUEST ROUTE -----------------
@app.route("/api/request", methods=["POST"])
def api_request():
    data = request.get_json()
    if not data:
        return jsonify({"message": "Invalid JSON"}), 400
    phone = data.get("phone")
    resource = data.get("resource")
    address = data.get("address")
    latitude = data.get("latitude")
    longitude = data.get("longitude")

    if not all([phone, resource, address, latitude, longitude]):
        return jsonify({"message": "All fields required"}), 400

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with sqlite3.connect(DB_FILE) as conn:
        c = conn.cursor()
        c.execute("""
            INSERT INTO requests (phone, resource, address, time, latitude, longitude)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (phone, resource, address, now, float(latitude), float(longitude)))
        conn.commit()

    volunteer_number = "+919019790330"
    whatsapp_url = get_whatsapp_link(volunteer_number, resource, address)

    # Twilio WhatsApp Message
    try:
        account_sid = "ACcd979a17a72329bc53b4514d399799b6"
        auth_token = "06d7ec082a46a0a3b7914e5d0ac366fa"
        client = Client(account_sid, auth_token)

        message_body = f"⚠️ New {resource} request received!\nLocation: {address}\nPhone: {phone}\nTime: {now}"

        # ✅ Add multiple recipients here
        recipients = ["+919019790330"]

        for number in recipients:
            try:
                message = client.messages.create(
                    from_="whatsapp:+14155238886",
                    body=message_body,
                    to=f"whatsapp:{number}"
                )
                print(f"Twilio message sent to {number}: {message.sid}")
            except Exception as send_error:
                print(f"Failed to send to {number}: {send_error}")

    except Exception as e:
        print("Twilio send error:", e)

    return jsonify({"message": "Request sent successfully!", "whatsapp": whatsapp_url}), 200

@app.route("/api/requests", methods=["GET"])
def api_get_requests():
    with sqlite3.connect(DB_FILE) as conn:
        c = conn.cursor()
        c.execute("SELECT id, phone, resource, address, time, latitude, longitude FROM requests ORDER BY id DESC")
        requests_list = [{"id": r[0], "phone": r[1], "resource": r[2], "address": r[3], "time": r[4], "latitude": r[5], "longitude": r[6]} for r in c.fetchall()]
    return jsonify(requests_list), 200

@app.route("/api/accept_request/<int:request_id>", methods=["POST"])
def accept_request(request_id):
    with sqlite3.connect(DB_FILE) as conn:
        c = conn.cursor()
        # Update request status
        c.execute("UPDATE requests SET status='On The Way' WHERE id=?", (request_id,))
        conn.commit()

        # Return request details with coordinates
        c.execute("SELECT phone, resource, address, time, latitude, longitude FROM requests WHERE id=?", (request_id,))
        req = c.fetchone()
        if req:
            # Get assigned volunteer for this request (if exists)
            c.execute("SELECT latitude, longitude FROM helpers WHERE request_id=? ORDER BY id DESC LIMIT 1", (request_id,))
            vol = c.fetchone()
            return jsonify({
                "success": True,
                "phone": req[0],
                "resource": req[1],
                "address": req[2],
                "time": req[3],
                "latitude": req[4],
                "longitude": req[5],
                "volunteer_lat": vol[0] if vol else None,
                "volunteer_lng": vol[1] if vol else None
            }), 200

    return jsonify({"success": False, "message": "Request not found"}), 404


@app.route("/api/update_helper_location", methods=["POST"])
def update_helper_location():
    data = request.get_json()
    name = data.get("name")
    phone = data.get("phone")
    latitude = data.get("latitude")
    longitude = data.get("longitude")
    request_id = data.get("request_id")

    with sqlite3.connect(DB_FILE) as conn:
        c = conn.cursor()
        c.execute("SELECT id FROM helpers WHERE name=? AND phone=? AND request_id=?", (name, phone, request_id))
        existing = c.fetchone()
        if existing:
            c.execute("UPDATE helpers SET latitude=?, longitude=? WHERE id=?", (latitude, longitude, existing[0]))
        else:
            c.execute("INSERT INTO helpers (name, phone, latitude, longitude, request_id) VALUES (?, ?, ?, ?, ?)",
                      (name, phone, latitude, longitude, request_id))
        conn.commit()
    return jsonify({"message": "Location updated"}), 200

@app.route("/api/helpers", methods=["GET"])
def get_helpers():
    with sqlite3.connect(DB_FILE) as conn:
        c = conn.cursor()
        c.execute("SELECT name, latitude, longitude, request_id FROM helpers")
        helpers = [{"name": r[0], "latitude": r[1], "longitude": r[2], "request_id": r[3]} for r in c.fetchall()]
    return jsonify(helpers), 200

@app.route("/api/delete_request/<int:request_id>", methods=["DELETE"])
def delete_request(request_id):
    try:
        with sqlite3.connect(DB_FILE) as conn:
            c = conn.cursor()
            c.execute("SELECT id FROM requests WHERE id=?", (request_id,))
            if not c.fetchone():
                return jsonify({"message": "Request not found!"}), 404
            c.execute("DELETE FROM requests WHERE id=?", (request_id,))
            conn.commit()
        return jsonify({"message": "Request deleted successfully!"}), 200
    except Exception as e:
        print("Delete request error:", e)
        return jsonify({"message": "Server error!"}), 500

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
