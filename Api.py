import os
import math
import hashlib
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Optional, Callable, Any, Dict, List, Tuple
from functools import wraps

from flask import Flask, request, jsonify, Response, g
from flask_cors import CORS
from dotenv import load_dotenv
import jwt
from werkzeug.security import generate_password_hash, check_password_hash

from processing import PDFProcessor
from retrieval import load_vector_store_or_raise
from agents import AgentOrchestrator


# ================== Config & Boot ==================
load_dotenv()

app = Flask(__name__)

# ---- CORS (explicit origins recommended when using credentials) ----
_default_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _default_origins.split(",") if o.strip()]
CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    supports_credentials=True,
    expose_headers=["Authorization"],
    allow_headers=["Content-Type", "Authorization"],
)

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "./uploads")
INDEX_DIR = os.environ.get("INDEX_DIR", "./index")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-prod")
JWT_ALGO = os.environ.get("JWT_ALGO", "HS256")
JWT_EXPIRE_HOURS = int(os.environ.get("JWT_EXPIRE_HOURS", "2"))
DB_PATH = os.environ.get("DB_PATH", "./app.db")

# Toggle this to protect chat routes
PROTECT_CHAT_ROUTES = True

os.makedirs(UPLOAD_DIR, exist_ok=True)
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is required")

# ---- Load persisted index (MUST exist) ----
vector_store = load_vector_store_or_raise(INDEX_DIR)  # raises if missing

pdf = PDFProcessor()
agent = AgentOrchestrator(
    gemini_api_key=GEMINI_API_KEY,
    vector_store=vector_store
)

# ================== DB Helpers ==================
def get_db() -> sqlite3.Connection:
    """
    One connection per request; enable foreign keys for integrity.
    Row factory returns sqlite3.Row for dict-like access.
    """
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db

@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()

def init_db():
    """
    Creates base tables if not exist.
    Adds columns if missing (idempotent, safe for existing DBs).
    """
    db = get_db()
    # users table
    db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('client','lawyer')),
            created_at TEXT NOT NULL,
            -- optional location info (added via migration if missing)
            location_name TEXT,
            location_lat REAL,
            location_lon REAL
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)")

    # ensure new columns exist (migrations)
    def _column_exists(table: str, col: str) -> bool:
        cur = db.execute(f"PRAGMA table_info({table})")
        return any(row["name"] == col for row in cur.fetchall())

    for col, ddl in [
        ("location_name", "ALTER TABLE users ADD COLUMN location_name TEXT"),
        ("location_lat",  "ALTER TABLE users ADD COLUMN location_lat REAL"),
        ("location_lon",  "ALTER TABLE users ADD COLUMN location_lon REAL"),
    ]:
        if not _column_exists("users", col):
            db.execute(ddl)

    # chats table
    db.execute("""
        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            lawyer_id INTEGER NOT NULL,
            sender_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(client_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(lawyer_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_chats_pair ON chats(client_id, lawyer_id, created_at)")
    db.commit()

with app.app_context():
    init_db()

# ================== JWT Helpers ==================
def create_token(user_id: int, email: str, role: str) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=JWT_EXPIRE_HOURS)).timestamp())
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def decode_token(token: str) -> Dict[str, Any]:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])

def _get_auth_header_token() -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    return auth.split(" ", 1)[1].strip()

def jwt_required(fn: Callable) -> Callable:
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = _get_auth_header_token()
        if not token:
            return jsonify({"error": "missing bearer token"}), 401
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "invalid token"}), 401

        # Attach user info to request context (Flask g)
        g.user = {
            "id": int(payload["sub"]),
            "email": payload["email"],
            "role": payload["role"]
        }
        return fn(*args, **kwargs)
    return wrapper

def role_required(*roles: str) -> Callable:
    def deco(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not getattr(g, "user", None):
                return jsonify({"error": "auth required"}), 401
            if g.user["role"] not in roles:
                return jsonify({"error": "forbidden: insufficient role"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return deco

# ================== Utilities ==================
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def row_to_user_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "role": row["role"],
        "location_name": row["location_name"],
        "location_lat": row["location_lat"],
        "location_lon": row["location_lon"],
        "created_at": row["created_at"],
    }

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance (kilometers)."""
    R = 6371.0  # km
    φ1, λ1, φ2, λ2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dφ, dλ = (φ2 - φ1), (λ2 - λ1)
    a = math.sin(dφ/2)**2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def parse_float(value: Optional[str]) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None

# ================== Auth Routes ==================
@app.post("/auth/register")
def register():
    try:
        data = request.get_json(force=True)
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        role = (data.get("role") or "").strip().lower()

        # optional location on signup
        location_name = (data.get("location_name") or None)
        location_lat = data.get("location_lat")
        location_lon = data.get("location_lon")
        location_lat = float(location_lat) if location_lat not in (None, "") else None
        location_lon = float(location_lon) if location_lon not in (None, "") else None

        if not email or not password or role not in ("client", "lawyer"):
            return jsonify({"error": "email, password, role(client|lawyer) required"}), 400

        pwd_hash = generate_password_hash(password)
        db = get_db()
        try:
            db.execute(
                """
                INSERT INTO users (email, password_hash, role, created_at, location_name, location_lat, location_lon)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (email, pwd_hash, role, now_iso(), location_name, location_lat, location_lon)
            )
            db.commit()
        except sqlite3.IntegrityError:
            return jsonify({"error": "email already registered"}), 409

        user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        token = create_token(user["id"], user["email"], user["role"])
        return jsonify({"token": token, "user": row_to_user_dict(user)})
    except Exception as e:
        app.logger.exception("register failed")
        return jsonify({"error": f"register failed: {e}"}), 500

@app.post("/auth/login")
def login():
    try:
        data = request.get_json(force=True)
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""

        if not email or not password:
            return jsonify({"error": "email and password required"}), 400

        db = get_db()
        row = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if not row or not check_password_hash(row["password_hash"], password):
            return jsonify({"error": "invalid credentials"}), 401

        token = create_token(row["id"], row["email"], row["role"])
        return jsonify({"token": token, "user": row_to_user_dict(row)})
    except Exception as e:
        app.logger.exception("login failed")
        return jsonify({"error": f"login failed: {e}"}), 500

@app.get("/me")
@jwt_required
def me():
    return jsonify({"user": g.user})

@app.get("/me/profile")
@jwt_required
def me_profile():
    """Return the full user row safely (no writes)."""
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id=?", (g.user["id"],)).fetchone()
    if not row:
        return jsonify({"error": "user not found"}), 404
    return jsonify({"user": row_to_user_dict(row)})


@app.patch("/me/location")
@jwt_required
def update_location():
    """
    Partially update location_name and/or coordinates for the current user.
    Only keys present in the JSON body are updated. Omitted keys are left unchanged.
    """
    try:
        data = request.get_json(silent=True) or {}

        fields, params = [], []

        if "location_name" in data:
            fields.append("location_name=?")
            params.append(data.get("location_name"))

        if "location_lat" in data:
            lat = data.get("location_lat")
            lat = float(lat) if lat not in (None, "") else None
            fields.append("location_lat=?")
            params.append(lat)

        if "location_lon" in data:
            lon = data.get("location_lon")
            lon = float(lon) if lon not in (None, "") else None
            fields.append("location_lon=?")
            params.append(lon)

        db = get_db()
        if fields:
            params.append(g.user["id"])
            sql = f"UPDATE users SET {', '.join(fields)} WHERE id=?"
            db.execute(sql, tuple(params))
            db.commit()

        row = db.execute("SELECT * FROM users WHERE id=?", (g.user["id"],)).fetchone()
        return jsonify({"user": row_to_user_dict(row)})
    except Exception as e:
        app.logger.exception("update_location failed")
        return jsonify({"error": f"update_location failed: {e}"}), 500

# Example role-protected route:
@app.get("/lawyer/dashboard")
@jwt_required
@role_required("lawyer")
def lawyer_only():
    return jsonify({"message": f"Welcome, {g.user['email']} (lawyer)!"})

# ================== Lawyer Discovery ==================
@app.get("/lawyers")
@jwt_required
def list_lawyers():
    """
    Query params:
      - lat, lon, radius_km (optional) -> geo filter using haversine
      - q (optional) -> fuzzy filter on email/location_name
      - limit (optional, default 50)
    """
    try:
        q = (request.args.get("q") or "").strip().lower()
        lat = parse_float(request.args.get("lat"))
        lon = parse_float(request.args.get("lon"))
        radius_km = parse_float(request.args.get("radius_km"))
        limit = int(request.args.get("limit") or 50)
        limit = max(1, min(limit, 200))

        db = get_db()
        rows = db.execute("SELECT * FROM users WHERE role='lawyer'").fetchall()
        lawyers: List[Dict[str, Any]] = []

        for r in rows:
            if q:
                blob = f"{r['email']} {r['location_name'] or ''}".lower()
                if q not in blob:
                    continue

            item = row_to_user_dict(r)
            # compute distance if coordinates given and lawyer has coords
            if lat is not None and lon is not None and r["location_lat"] is not None and r["location_lon"] is not None:
                dist = haversine_km(lat, lon, r["location_lat"], r["location_lon"])
                item["distance_km"] = round(dist, 3)
                if radius_km is not None and dist > radius_km:
                    continue
            lawyers.append(item)

        # If distance_km present, sort by it; else keep insertion order
        lawyers.sort(key=lambda x: x.get("distance_km", float("inf")))
        return jsonify({"lawyers": lawyers[:limit]})
    except Exception as e:
        app.logger.exception("list_lawyers failed")
        return jsonify({"error": f"list_lawyers failed: {e}"}), 500

# ================== Client ↔ Lawyer Messaging ==================
def _resolve_pair(sender_id: int, other_user_id: int) -> Tuple[int, int]:
    """
    Resolve (client_id, lawyer_id) given the two participants; validates roles.
    """
    db = get_db()
    s = db.execute("SELECT id, role FROM users WHERE id=?", (sender_id,)).fetchone()
    o = db.execute("SELECT id, role FROM users WHERE id=?", (other_user_id,)).fetchone()
    if not s or not o:
        raise ValueError("sender or recipient not found")
    roles = {s["role"], o["role"]}
    if roles != {"client", "lawyer"}:
        raise ValueError("messages must be between a client and a lawyer")
    client_id = s["id"] if s["role"] == "client" else o["id"]
    lawyer_id = s["id"] if s["role"] == "lawyer" else o["id"]
    return client_id, lawyer_id

@app.post("/messages/send")
@jwt_required
def send_message():
    """
    Body JSON: { "to_user_id": int, "message": str }
    Stores message with (client_id, lawyer_id, sender_id).
    """
    try:
        data = request.get_json(force=True)
        to_user_id = data.get("to_user_id")
        message = (data.get("message") or "").strip()
        if not isinstance(to_user_id, int) or not message:
            return jsonify({"error": "to_user_id(int) and non-empty message required"}), 400

        client_id, lawyer_id = _resolve_pair(g.user["id"], to_user_id)
        db = get_db()
        db.execute(
            """
            INSERT INTO chats (client_id, lawyer_id, sender_id, message, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (client_id, lawyer_id, g.user["id"], message, now_iso())
        )
        db.commit()
        return jsonify({"status": "sent"})
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        app.logger.exception("send_message failed")
        return jsonify({"error": f"send_message failed: {e}"}), 500

@app.get("/messages/thread")
@jwt_required
def get_thread():
    """
    Query params:
      - with_user_id (required): other participant
      - limit (optional, default 100)
      - before_id / after_id (optional): pagination cursors on chat id
    """
    try:
        other_id = request.args.get("with_user_id", type=int)
        if not other_id:
            return jsonify({"error": "with_user_id is required"}), 400

        limit = request.args.get("limit", default=100, type=int)
        limit = max(1, min(limit, 500))

        before_id = request.args.get("before_id", type=int)
        after_id = request.args.get("after_id", type=int)

        client_id, lawyer_id = _resolve_pair(g.user["id"], other_id)
        db = get_db()

        sql = ["SELECT * FROM chats WHERE client_id=? AND lawyer_id=?"]
        params: List[Any] = [client_id, lawyer_id]

        if before_id is not None:
            sql.append("AND id < ?")
            params.append(before_id)
        if after_id is not None:
            sql.append("AND id > ?")
            params.append(after_id)

        sql.append("ORDER BY id DESC")
        sql.append("LIMIT ?")
        params.append(limit)

        rows = db.execute(" ".join(sql), tuple(params)).fetchall()
        # reverse to chronological ascending for UI
        rows = list(reversed(rows))

        msgs = [{
            "id": r["id"],
            "client_id": r["client_id"],
            "lawyer_id": r["lawyer_id"],
            "sender_id": r["sender_id"],
            "message": r["message"],
            "created_at": r["created_at"],
        } for r in rows]

        return jsonify({"messages": msgs})
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        app.logger.exception("get_thread failed")
        return jsonify({"error": f"get_thread failed: {e}"}), 500

# ================== Chat with LLM (optional protection) ==================
def _maybe_protect(fn):
    # Apply @jwt_required dynamically based on PROTECT_CHAT_ROUTES
    return jwt_required(fn) if PROTECT_CHAT_ROUTES else fn

@app.route("/chat", methods=["POST"])
@_maybe_protect
def chat():
    try:
        top_k = 6
        session_id: Optional[str] = None
        user_doc_text: Optional[str] = None

        if request.content_type and request.content_type.startswith("multipart/form-data"):
            msg = request.form.get("message", "").strip()
            session_id = request.form.get("session_id", None)
            f = request.files.get("user_pdf")
            if f and f.filename.lower().endswith(".pdf"):
                file_bytes = f.read()
                temp_path = os.path.join(UPLOAD_DIR, hashlib.md5(file_bytes).hexdigest() + ".pdf")
                f.stream.seek(0)
                f.save(temp_path)
                pages = pdf.process_pdf(temp_path)
                try:
                    os.remove(temp_path)
                except FileNotFoundError:
                    pass
                user_doc_text = "\n\n".join([p["text"] for p in pages if p.get("text")])
            else:
                user_doc_text = request.form.get("user_doc_text", None)
        else:
            data = request.get_json(force=True)
            msg = (data.get("message") or "").strip()
            session_id = data.get("session_id")
            user_doc_text = data.get("user_doc_text")
            top_k = int(data.get("top_k") or 6)

        if not msg:
            return jsonify({"error": "message is required"}), 400

        result = agent.answer(
            user_message=msg,
            session_id=session_id,
            user_doc_text=user_doc_text,
            top_k=top_k
        )
        return jsonify(result)
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        app.logger.exception("chat failed")
        return jsonify({"error": f"chat failed: {e}"}), 500    
    
@app.get("/messages/partners")
@jwt_required
def list_partners():
    """
    Returns distinct conversation partners for the current user, most-recent first.
    Optional: ?limit=200  (default 100)
    Response:
      { "partners": [
          { "id": int, "email": str, "role": "client"|"lawyer",
            "location_name": str|null, "location_lat": float|null, "location_lon": float|null,
            "last_message": str, "last_at": iso8601, "last_sender_id": int }
        ]
      }
    """
    try:
        limit = request.args.get("limit", default=100, type=int)
        limit = max(1, min(limit, 500))

        db = get_db()
        # Get all chats where current user is involved, newest first
        rows = db.execute(
            "SELECT * FROM chats WHERE client_id=? OR lawyer_id=? ORDER BY id DESC",
            (g.user["id"], g.user["id"])
        ).fetchall()

        seen = set()
        partners: List[Dict[str, Any]] = []
        for r in rows:
            # Determine the other participant
            other_id = r["lawyer_id"] if g.user["id"] == r["client_id"] else r["client_id"]
            if other_id in seen:
                continue
            seen.add(other_id)

            u = db.execute("SELECT * FROM users WHERE id=?", (other_id,)).fetchone()
            if not u:
                continue

            partners.append({
                "id": u["id"],
                "email": u["email"],
                "role": u["role"],
                "location_name": u["location_name"],
                "location_lat": u["location_lat"],
                "location_lon": u["location_lon"],
                "last_message": r["message"],
                "last_at": r["created_at"],
                "last_sender_id": r["sender_id"],
            })

            if len(partners) >= limit:
                break

        return jsonify({"partners": partners})
    except Exception as e:
        app.logger.exception("list_partners failed")
        return jsonify({"error": f"list_partners failed: {e}"}), 500


# ================== Main ==================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)