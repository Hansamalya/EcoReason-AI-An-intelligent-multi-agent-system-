"""
recommendation_engine.py — the same matching logic as js/app.js, in Python.

    from recommendation_engine import Engine
    eng = Engine()                                   # loads ../data/recommendations.json
    eng.rank({"skills": ["Python", "SQL"], "interests": {"Investigative": 5}, "education": 4})
"""
import json, math, re
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
RIASEC = ["Realistic", "Investigative", "Artistic", "Social", "Enterprising", "Conventional"]

ALIAS = {"ms excel": "excel", "microsoft excel": "excel", "js": "javascript", "reactjs": "react", "react.js": "react",
         "node": "node.js", "nodejs": "node.js", "postgres": "postgresql", "amazon web services": "aws", "gcp": "google cloud",
         "powerbi": "power bi", "microsoft office": "ms office", "office 365": "ms office", "k8s": "kubernetes",
         "golang": "go", "c sharp": "c#", "cpp": "c++", "adobe photoshop": "photoshop", "github": "git"}
IMPLIES = {"mysql": ["sql"], "postgresql": ["sql"], "sql server": ["sql"], "react": ["javascript"],
           "typescript": ["javascript"], "pytorch": ["python"], "tensorflow": ["python"], "django": ["python"],
           "excel": ["ms office"], "powerpoint": ["ms office"]}
SHORT = {"R": r"(?<![\w-])R(?=[,/)]| programming| language| studio)", "C": r"(?<![\w#+-])C(?=[,/)]| programming| language)",
         "Go": r"\bGolang\b|(?<![\w-])Go(?=[,/)]| programming| language)"}
CORE_PHRASES = [
    (r"communicat", ["Speaking", "Writing", "Active Listening"]), (r"problem[- ]solving", ["Complex Problem Solving"]),
    (r"critical thinking|analytical", ["Critical Thinking"]), (r"leadership|led a team", ["Coordination", "Administration and Management"]),
    (r"teamwork|collaborat", ["Coordination"]), (r"programming|coding", ["Programming", "Computers and Electronics"]),
    (r"mathemat|statistic|calculus", ["Mathematics"]), (r"writing|documentation", ["Writing", "English Language"]),
    (r"presentation|public speaking", ["Speaking"]), (r"customer service", ["Service Orientation", "Customer and Personal Service"]),
    (r"time management", ["Time Management"]), (r"research", ["Active Learning", "Science"]),
    (r"\bdesign\b", ["Design"]), (r"marketing|sales", ["Sales and Marketing"]), (r"accounting|finance", ["Economics and Accounting"]),
    (r"engineering", ["Engineering and Technology"]), (r"patient|clinical|nursing", ["Medicine and Dentistry"]),
]


def edu_rank(label):
    s = str(label).lower()
    for rx, v in [(r"doctor|professional", 6), (r"master", 5), (r"bachelor|post-bacc", 4), (r"associate", 3),
                  (r"certificate|some college|post-secondary", 2)]:
        if re.search(rx, s): return v
    return 1


def pearson(a, b):
    n = len(a); ma, mb = sum(a) / n, sum(b) / n
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    da = math.sqrt(sum((x - ma) ** 2 for x in a)); db = math.sqrt(sum((y - mb) ** 2 for y in b))
    return num / (da * db) if da and db else 0.0


class Engine:
    def __init__(self, path=DATA / "recommendations.json"):
        self.db = json.loads(Path(path).read_text(encoding="utf-8"))
        self.careers = {c["id"]: c for c in self.db["careers"]}

    # ---------- skills
    @staticmethod
    def skill_set(skills):
        out = set()
        for s in skills or []:
            k = ALIAS.get(s.strip().lower(), s.strip().lower()); out.add(k); out.update(IMPLIES.get(k, []))
        return out

    def extract(self, text):
        found = set()
        for t in self.db["skill_vocab"]["technical"]:
            rx = SHORT.get(t) or r"(?<![\w])" + re.escape(t) + r"(?![\w])"
            if re.search(rx, text, 0 if t in SHORT else re.I): found.add(t)
        for rx, names in CORE_PHRASES:
            if re.search(rx, text, re.I): found.update(names)
        years = max([int(m) for m in re.findall(r"(\d{1,2})\s*\+?\s*(?:years|yrs)", text, re.I)] or [0])
        edu = 0
        for rx, v in [(r"ph\.?\s?d|doctor", 6), (r"master|m\.?tech|\bmba\b|m\.?sc", 5), (r"bachelor|b\.?tech|b\.?sc|b\.?com|\bbca\b", 4), (r"diploma", 2)]:
            if re.search(rx, text, re.I): edu = v; break
        return {"skills": sorted(found), "years": min(years, 45), "education": edu}

    # ---------- scoring
    def evaluate(self, profile, c):
        has = self.skill_set(profile.get("skills"))
        tech = [dict(s, have=s["name"].lower() in has) for s in c["technical"][:10]]
        seen, found = set(), []
        for s in c["core"] + c["knowledge"][:4]:
            if s["name"] not in seen: seen.add(s["name"]); found.append(dict(s, have=s["name"].lower() in has))
        w = lambda arr: (sum(s["importance"] for s in arr if s["have"]) / (sum(s["importance"] for s in arr) or 1))
        interests = profile.get("interests") or {}
        interest = (pearson([float(interests.get(k, 3)) for k in RIASEC], [c["riasec"].get(k, 0) for k in RIASEC]) + 1) / 2
        need, mine = edu_rank(c["education"]), int(profile.get("education") or 1)
        edu_fit = 1.0 if mine >= need else max(0.0, 1 - 0.3 * (need - mine))
        if profile.get("skills"):
            raw = 0.45 * w(tech) + 0.2 * w(found) + 0.27 * interest + 0.08 * edu_fit
        else:
            raw = 0.8 * interest + 0.2 * edu_fit
        return {"id": c["id"], "name": c["name"], "score": round(100 * raw ** 0.8),
                "tech_coverage": round(100 * w(tech)), "core_coverage": round(100 * w(found)),
                "interest_fit": round(100 * interest), "education_fit": round(100 * edu_fit),
                "have": [s["name"] for s in tech if s["have"]],
                "missing": [{"name": s["name"], "importance": s["importance"], "demand_pct": s["demand"]} for s in tech if not s["have"]],
                "salary_median": c["market"]["salary_median"], "postings": c["market"]["postings"]}

    def rank(self, profile, top=None):
        r = sorted((self.evaluate(profile, c) for c in self.careers.values()), key=lambda x: -x["score"])
        return r[:top] if top else r

    def courses_for_gap(self, profile, career_id, n=6):
        ev = self.evaluate(profile, self.careers[career_id]); out, seen = [], set()
        for m in ev["missing"]:
            for k in self.db["skill_courses"].get(m["name"], [])[:1]:
                if k["title"] not in seen: seen.add(k["title"]); out.append(dict(k, for_skill=m["name"]))
        for k in self.careers[career_id]["courses"]:
            if len(out) >= n: break
            if k["title"] not in seen: seen.add(k["title"]); out.append(dict(k, for_skill=None))
        return out[:n]

    def roadmap(self, profile, career_id):
        c = self.careers[career_id]; ev = self.evaluate(profile, c)
        miss = sorted(ev["missing"], key=lambda s: -s["importance"])
        stages = [
            {"stage": "Lay the foundations", "weeks": min(8, 2 + ev["core_coverage"] // 25),
             "skills": [s["name"] for s in c["core"][:6]], "courses": [k for k in c["courses"] if k["level"] in ("Beginner", "Mixed")][:3]},
            {"stage": "Build the core toolkit", "weeks": max(2, min(12, 3 * len(miss[:4]))),
             "skills": [s["name"] for s in miss[:4]], "courses": self.courses_for_gap(profile, career_id, 3), "project": c["tasks"][:1]},
            {"stage": "Specialise and ship projects", "weeks": max(3, min(12, 2 * len(miss[4:9]) + 3)),
             "skills": [s["name"] for s in miss[4:9]], "courses": [k for k in c["courses"] if k["level"] in ("Intermediate", "Advanced")][:3], "project": c["tasks"][1:3]},
            {"stage": "Get job-ready", "weeks": 4, "skills": [], "courses": [],
             "project": ["Publish a 2–3 project portfolio", "Tailor your résumé to the role", "Apply to: " + ", ".join(x["name"] for x in c["market"]["top_companies"][:3])]},
        ]
        return {"career": c["name"], "match": ev["score"], "total_weeks": sum(s["weeks"] for s in stages), "stages": stages}


if __name__ == "__main__":
    e = Engine()
    for r in e.rank({"skills": ["Python", "SQL", "Excel", "Critical Thinking", "Mathematics"],
                     "interests": {"Investigative": 5, "Conventional": 4, "Artistic": 1}, "education": 4}, top=5):
        print(f"{r['score']:>3}%  {r['name']:<28} missing: {', '.join(m['name'] for m in r['missing'][:4])}")
