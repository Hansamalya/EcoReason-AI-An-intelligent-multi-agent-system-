"""
app.py — serves the website and a JSON API.

    pip install flask pypdf python-docx
    python backend/app.py            → http://localhost:5000

API
  GET  /api/health
  GET  /api/careers                          list of careers (summary)
  GET  /api/careers/<id>                     full career profile
  POST /api/recommend      {profile}         ranked careers with skill gaps
  POST /api/skill-gap      {profile, career} gap + courses for one career
  POST /api/roadmap        {profile, career} staged learning plan
  GET  /api/jobs?career=<id>&limit=10        sample postings
  POST /api/resume         multipart file    extracted text + skills
"""
import csv, io
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory, abort
from recommendation_engine import Engine

ROOT = Path(__file__).resolve().parent.parent
app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024
engine = Engine()
with open(ROOT / "data" / "jobs.csv", encoding="utf-8") as f:
    JOBS = list(csv.DictReader(f))


def body():
    return request.get_json(silent=True) or {}


@app.get("/api/health")
def health():
    return {"ok": True, "careers": len(engine.careers), "jobs": len(JOBS)}


@app.get("/api/careers")
def careers():
    return jsonify([{k: c[k] for k in ("id", "name", "category", "image", "education")} | {"salary_median": c["market"]["salary_median"],
                    "postings": c["market"]["postings"]} for c in engine.careers.values()])


@app.get("/api/careers/<cid>")
def career(cid):
    return jsonify(engine.careers.get(cid) or abort(404))


@app.post("/api/recommend")
def recommend():
    b = body()
    return jsonify(engine.rank(b.get("profile", b), top=int(request.args.get("top", 10))))


@app.post("/api/skill-gap")
def skill_gap():
    b = body(); cid = b.get("career")
    if cid not in engine.careers: abort(404)
    ev = engine.evaluate(b.get("profile", {}), engine.careers[cid])
    return jsonify(ev | {"courses": engine.courses_for_gap(b.get("profile", {}), cid)})


@app.post("/api/roadmap")
def roadmap():
    b = body(); cid = b.get("career")
    if cid not in engine.careers: abort(404)
    return jsonify(engine.roadmap(b.get("profile", {}), cid))


@app.get("/api/jobs")
def jobs():
    cid = request.args.get("career"); n = int(request.args.get("limit", 10))
    return jsonify([j for j in JOBS if not cid or j["career_id"] == cid][:n])


@app.post("/api/resume")
def resume():
    f = request.files.get("file")
    if not f: return {"error": "Attach a file in the 'file' field."}, 400
    name, data = f.filename.lower(), f.read()
    try:
        if name.endswith(".pdf"):
            from pypdf import PdfReader
            text = "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(data)).pages)
        elif name.endswith(".docx"):
            import docx
            text = "\n".join(p.text for p in docx.Document(io.BytesIO(data)).paragraphs)
        else:
            text = data.decode("utf-8", "ignore")
    except ImportError:
        return {"error": "Install pypdf and python-docx to parse PDF/DOCX on the server."}, 500
    return jsonify({"text": text} | engine.extract(text))


# ---------- static site
@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.get("/<path:path>")
def static_files(path):
    if path.startswith(("backend", "raw")): abort(404)
    return send_from_directory(ROOT, path)


if __name__ == "__main__":
    app.run(debug=True, port=5000, use_reloader=False)
