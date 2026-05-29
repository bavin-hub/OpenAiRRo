"""Minimal Flask API for the browser omnibox (plain-text searches).

GET /search?q=... returns JSON { query, results } for the React shell to render.
POST /ai/chat accepts JSON { "messages": [...] } and streams a dummy plain-text reply
(character chunks). The server is stateless: the client sends the full conversation each time.

Run: python3 main_server.py
"""

import time

from flask import Flask, Response, jsonify, request

app = Flask(__name__)

# Hard-coded “web” results — replace with real search later.
DUMMY_PAGES = [
    {
        "title": "Wikipedia — The Free Encyclopedia",
        "url": "https://www.wikipedia.org/",
        "snippet": "Open-content encyclopedia that anyone can edit.",
    },
    {
        "title": "MDN Web Docs",
        "url": "https://developer.mozilla.org/",
        "snippet": "Documentation for web technologies: HTML, CSS, JavaScript, and APIs.",
    },
    {
        "title": "Electron",
        "url": "https://www.electronjs.org/",
        "snippet": "Build cross-platform desktop apps with JavaScript, HTML, and CSS.",
    },
    {
        "title": "React",
        "url": "https://react.dev/",
        "snippet": "The library for web and native user interfaces, with components.",
    },
    {
        "title": "The Python Tutorial",
        "url": "https://docs.python.org/3/tutorial/",
        "snippet": "An informal introduction to Python for new programmers.",
    },
    {
        "title": "Vite",
        "url": "https://vitejs.dev/",
        "snippet": "Next-generation frontend tooling for fast dev and optimized builds.",
    },
]


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


# Fixed dummy copy for streaming demos (replace with a real model later).
DUMMY_STREAM_REPLY = (
    "This is a streamed reply from a tiny stateless endpoint. "
    "Your browser sent the entire conversation as JSON in the request body; "
    "this server does not store chats or sessions. "
    "Each chunk you see is plain text written to the response over time, "
    "similar to how a real assistant API might stream tokens. "
    "You can swap this paragraph for model output while keeping the same contract: "
    "POST /ai/chat with { \"messages\": [{\"role\":\"user\",\"content\":\"...\"}, ...] } "
    "and read the response body as incremental UTF-8 text."
)


@app.get("/")
def root():
    return jsonify(
        status="ok",
        hint=(
            "GET /search?q=your+query returns JSON results for the browser UI; "
            "POST /ai/chat streams plain text (dummy) for the AI side panel"
        ),
    )


@app.get("/search")
def search():
    q = request.args.get("q", "").strip()
    q_lower = q.lower()
    if q_lower:
        filtered = [
            p
            for p in DUMMY_PAGES
            if q_lower in p["title"].lower() or q_lower in p["snippet"].lower()
        ]
        results = filtered if filtered else DUMMY_PAGES[:5]
    else:
        results = DUMMY_PAGES[:5]

    return jsonify(query=q, results=results)


def _stream_dummy_text(text: str, chunk_size: int = 24, delay_s: float = 0.04):
    """Yield UTF-8 byte slices so the client sees incremental text."""
    encoded = text.encode("utf-8")
    for i in range(0, len(encoded), chunk_size):
        yield encoded[i : i + chunk_size]
        time.sleep(delay_s)


@app.route("/ai/chat", methods=["POST", "OPTIONS"])
def ai_chat():
    if request.method == "OPTIONS":
        return "", 204

    payload = request.get_json(silent=True) or {}
    messages = payload.get("messages")
    if not isinstance(messages, list):
        return jsonify(error='expected JSON body: { "messages": [ { "role": "...", "content": "..." }, ... ] }'), 400

    cleaned = []
    for item in messages:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("content")
        if role not in ("user", "assistant", "system"):
            continue
        if not isinstance(content, str):
            continue
        cleaned.append({"role": role, "content": content})

    if not cleaned or cleaned[-1]["role"] != "user":
        return jsonify(error="messages must be a non-empty list ending with a user message"), 400

    # Stateless: nothing is stored; we only shape a reply from this request’s payload.
    raw_last = cleaned[-1]["content"].strip() or "(empty message)"
    preview = raw_last if len(raw_last) <= 200 else raw_last[:200] + "…"
    intro = (
        f"[Stateless echo] Got {len(cleaned)} message(s) in this request. "
        f"Latest user text: {preview!r}\n\n"
    )

    return Response(
        _stream_dummy_text(intro + DUMMY_STREAM_REPLY),
        mimetype="text/plain; charset=utf-8",
    )



@app.route("/user/singup", methods=["POST"])
def user_signup():
    payload = request.get_json(silent=True) or {}
    email = payload.get("email")
    username = payload.get("username")
    password = payload.get("password")
    if not email or not password:
        return jsonify(error="email and password are required")
    
    # use the hash service to hash the password

    # check if user already exists - based on which create the user in the aws db

    # generate a otp code and send it to the user's email
    dummy_otp_code = "123456"

    # send success response along with the otp code
    return jsonify(success=True, otp=dummy_otp_code), 200

DUMMY_CHATS_BY_ID = {
    "1": [
        {"role": "user", "content": "how to use ai"},
        {"role": "assistant", "content": "Start with a clear goal, then pick a tool or model that fits your task."},
        {"role": "user", "content": "what do you know then"},
        {"role": "assistant", "content": "I can help with general guidance, drafting, and explaining concepts."},
    ],
    "2": [
        {"role": "user", "content": "what is life"},
        {"role": "assistant", "content": "A placeholder answer: different fields define life in different ways."},
    ],
}


@app.route("/user/get_full_chat", methods=["POST", "OPTIONS"])
def get_full_chat():
    if request.method == "OPTIONS":
        return "", 204

    payload = request.get_json(silent=True) or {}
    chat_id = payload.get("chat_id")
    if not chat_id:
        return jsonify(success=False, error="chat_id is required"), 400

    history = DUMMY_CHATS_BY_ID.get(str(chat_id))
    if history is None:
        return jsonify(success=False, error="chat not found"), 404

    return jsonify(success=True, conversation_history=history), 200


@app.route("/user/login", methods=["POST"])
def user_login():
    payload = request.get_json(silent=True) or {}
    email = payload.get("email")
    username = payload.get("username")
    password = payload.get("password")

    if not password:
        return jsonify(error="password is required"), 400
    if not email and not username:
        return jsonify(error="email or username is required"), 400

    # fetch user from db - if not found, return error

    # if found compare the password with the hashed password in the db

    # if correct - send a jwt token, success response and the user details
    dummy_jwt_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    dummy_user_details = {
        "username": "bavin",
        "email": "bavinsaravanan24@gmail.com",
        "profilepic": "",
    }

    list_of_chats_for_user = [
        {"chat_id": "1", "chat_name": "Chat 1", "chat_title": "how to use ai"},
        {"chat_id": "2", "chat_name": "Chat 2", "chat_title": "what is life"},
    ]





    # send success response along with the jwt token, user details
    return jsonify(
        success=True,
        token=dummy_jwt_token,
        user={
            "username": dummy_user_details["username"],
            "email": dummy_user_details["email"],
            "profilepic": dummy_user_details.get("profilepic", ""),
            "user_chats_info": list_of_chats_for_user
        },
    ), 200

    # if not send bad request response




if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
