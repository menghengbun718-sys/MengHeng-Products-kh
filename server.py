"""Small web server for the MengHeng storefront.

Works on any host that can run a Python process (Render, Railway, Fly.io, a VPS,
Heroku-style `Procfile` platforms). It serves the static site and exposes
POST /api/log, which forwards download activity to Telegram.

Environment variables:
  PORT                 port to listen on (set automatically by most hosts)
  HOST                 bind address (default 0.0.0.0)
  TELEGRAM_BOT_TOKEN   bot token from @BotFather      (optional)
  TELEGRAM_CHAT_ID     chat/channel id to notify      (optional)
"""
import json
import os
import posixpath
import time
from collections import defaultdict, deque
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

from telegram_log import cambodia_now, send_telegram_message

ROOT = os.path.dirname(os.path.abspath(__file__))

# Never serve source code, config or secrets, even though they sit next to the site.
BLOCKED_SUFFIXES = (".py", ".pyc", ".pyo", ".md", ".txt", ".toml", ".env", ".log", ".yml", ".yaml", ".ini")
BLOCKED_NAMES = {"procfile", "requirements.txt", "dockerfile"}

RATE_LIMIT = 20          # max log events ...
RATE_WINDOW = 60         # ... per this many seconds, per client IP
_hits = defaultdict(deque)


def rate_limited(ip: str) -> bool:
    now = time.monotonic()
    q = _hits[ip]
    while q and now - q[0] > RATE_WINDOW:
        q.popleft()
    if len(q) >= RATE_LIMIT:
        return True
    q.append(now)
    if len(_hits) > 5000:  # keep memory bounded
        for key in [k for k, v in _hits.items() if not v]:
            del _hits[key]
    return False


def is_blocked(url_path: str) -> bool:
    path = posixpath.normpath(unquote(urlsplit(url_path).path))
    parts = [p for p in path.split("/") if p]
    if any(p.startswith(".") or p == "__pycache__" for p in parts):
        return True
    if not parts:
        return False
    name = parts[-1].lower()
    return name in BLOCKED_NAMES or name.endswith(BLOCKED_SUFFIXES)


class StorefrontHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # CORS is only needed when the page is opened from disk / another dev server.
        if self.path.split("?", 1)[0] == "/api/log":
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def client_ip(self) -> str:
        forwarded = self.headers.get("X-Forwarded-For", "")
        return forwarded.split(",")[0].strip() or self.client_address[0]

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/") or is_blocked(self.path):
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if self.path.startswith("/api/") or is_blocked(self.path):
            self.send_error(404)
            return
        super().do_HEAD()

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/log":
            self.send_error(404)
            return

        if rate_limited(self.client_ip()):
            self._json(429, {"ok": False, "error": "too many requests"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 0 or length > 4096:
                self._json(413, {"ok": False, "error": "request is too large"})
                return
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("request body must be a JSON object")
        except (ValueError, TypeError, UnicodeDecodeError) as exc:  # JSONDecodeError is a ValueError
            self._json(400, {"ok": False, "error": str(exc)})
            return

        event = str(payload.get("event", "unknown"))[:80]
        product = str(payload.get("product", "unknown product"))[:200]
        message = (
            "MengHeng Productions\n"
            f"Event: {event}\n"
            f"Product: {product}\n"
            f"Time: {cambodia_now().strftime('%Y-%m-%d %H:%M:%S ICT')}"
        )
        sent = send_telegram_message(message)
        self._json(200 if sent else 502, {"ok": sent})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8001"))
    host = os.getenv("HOST", "0.0.0.0")
    server = ThreadingHTTPServer((host, port), StorefrontHandler)
    print(f"Storefront running at http://{host}:{port}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStorefront stopped.")
    finally:
        server.server_close()
