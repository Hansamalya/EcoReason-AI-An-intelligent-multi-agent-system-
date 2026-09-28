/* =========================================================================
   Waypoint — Career Recommendation System (front end)
   Everything runs in the browser from /data. The Flask backend (backend/app.py)
   serves these files and exposes the same engine as a JSON API.
   ========================================================================= */
(() => {
"use strict";

const BASE = document.body.dataset.base || "";
const PAGE = document.body.dataset.page || "";
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => (n ? "$" + Math.round(n / 1000) + "k" : "—");
const num = n => Number(n || 0).toLocaleString();
const sum = a => a.reduce((x, y) => x + y, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9+#.]+/g, "-");

/* ---------------------------------------------------------------- storage */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

const RIASEC = [
  ["Realistic", "Hands-on work with tools, machines, the outdoors"],
  ["Investigative", "Research, analysis, solving hard problems"],
  ["Artistic", "Creating, designing, self-expression"],
  ["Social", "Helping, teaching, caring for people"],
  ["Enterprising", "Leading, persuading, starting things"],
  ["Conventional", "Organising data, process, precision"],
];
const EDU_LEVELS = ["High school", "Diploma / certificate", "Associate's degree", "Bachelor's degree", "Master's degree", "Doctorate"];
const eduRank = label => {
  const s = String(label).toLowerCase();
  if (/doctor|professional|post-doctoral/.test(s)) return 6;
  if (/master/.test(s)) return 5;
  if (/bachelor|post-bacc/.test(s)) return 4;
  if (/associate/.test(s)) return 3;
  if (/certificate|some college|diploma \/|post-secondary/.test(s)) return 2;
  return 1;
};

const Store = {
  session() { return LS.get("wp_session", null); },
  signIn(user) { LS.set("wp_session", { name: user.name, email: user.email, guest: !!user.guest, at: Date.now() }); },
  signOut() { LS.del("wp_session"); location.href = BASE + "login.html"; },
  key(k) { const s = this.session(); return `wp_${k}_${s ? s.email : "guest"}`; },
  profile() {
    const s = this.session();
    const p = LS.get(this.key("profile"), null);
    return Object.assign({
      name: s ? s.name : "", headline: "", education: 4, years: 0,
      interests: Object.fromEntries(RIASEC.map(([k]) => [k, 3])), skills: [], resume: null, updated: null,
    }, p || {});
  },
  saveProfile(p) { p.updated = Date.now(); LS.set(this.key("profile"), p); },
  progress(id) { return LS.get(this.key("progress_" + id), {}); },
  saveProgress(id, v) { LS.set(this.key("progress_" + id), v); },
};

/* ------------------------------------------------------------- data load */
const Data = {
  db: null, jobs: null,
  async load() {
    if (this.db) return this.db;
    const r = await fetch(BASE + "data/recommendations.json");
    if (!r.ok) throw new Error("recommendations.json " + r.status);
    this.db = await r.json();
    this.byId = Object.fromEntries(this.db.careers.map(c => [c.id, c]));
    return this.db;
  },
  async loadJobs() {
    if (this.jobs) return this.jobs;
    const r = await fetch(BASE + "data/jobs.csv");
    this.jobs = r.ok ? parseCSV(await r.text()) : [];
    return this.jobs;
  },
};

function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(f); f = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = [];
    } else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift() || [];
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

/* ------------------------------------------------------ skill vocabulary */
const ALIAS = {
  "ms excel": "excel", "microsoft excel": "excel", "advanced excel": "excel", "js": "javascript", "reactjs": "react",
  "react.js": "react", "node": "node.js", "nodejs": "node.js", "postgres": "postgresql", "amazon web services": "aws",
  "gcp": "google cloud", "powerbi": "power bi", "microsoft word": "ms word", "microsoft office": "ms office",
  "office 365": "ms office", "microsoft 365": "ms office", "ms-office": "ms office", "tf": "tensorflow", "torch": "pytorch",
  "k8s": "kubernetes", "golang": "go", "c sharp": "c#", "cpp": "c++", "mssql": "sql server", "ms sql": "sql server",
  "microsoft powerpoint": "powerpoint", "ppt": "powerpoint", "adobe photoshop": "photoshop", "adobe illustrator": "illustrator",
  "adobe xd": "adobe xd", "premiere": "premiere pro", "vba macros": "vba", "matlab/simulink": "matlab", "tableau desktop": "tableau",
  "github": "git", "gitlab": "git", "ms project": "ms project", "autocad 2d": "autocad", "solid works": "solidworks",
};
const IMPLIES = {
  "mysql": ["sql"], "postgresql": ["sql"], "sql server": ["sql"], "oracle db": ["sql"], "sqlite": ["sql"], "snowflake": ["sql"],
  "react": ["javascript"], "typescript": ["javascript"], "angular": ["javascript"], "node.js": ["javascript"], "vue.js": ["javascript"],
  "aws ec2": ["aws"], "redshift": ["aws"], "pytorch": ["python"], "tensorflow": ["python"], "django": ["python"], "flask": ["python"],
  "excel": ["ms office"], "powerpoint": ["ms office"], "ms word": ["ms office"], "civil 3d": ["autocad"],
};
const canon = s => { const k = String(s).trim().toLowerCase(); return ALIAS[k] || k; };
function skillSet(profile) {
  const out = new Set();
  for (const s of profile.skills || []) {
    const k = canon(s); out.add(k);
    (IMPLIES[k] || []).forEach(x => out.add(x));
  }
  return out;
}

// Phrases people write on résumés → O*NET core skills / knowledge areas
const CORE_PHRASES = [
  [/\bcommunicat/i, ["Speaking", "Writing", "Active Listening"]], [/problem[- ]solving/i, ["Complex Problem Solving"]],
  [/critical thinking|analytical/i, ["Critical Thinking"]], [/leadership|team lead|led a team|managed a team/i, ["Coordination", "Administration and Management"]],
  [/teamwork|collaborat/i, ["Coordination", "Social Perceptiveness"]], [/programming|coding|software development/i, ["Programming", "Computers and Electronics"]],
  [/mathemat|\bmaths?\b|statistic|calculus|linear algebra/i, ["Mathematics"]], [/writing|documentation|content creation|copywrit/i, ["Writing", "English Language"]],
  [/presentation|public speaking/i, ["Speaking"]], [/customer service|client relations|customer support/i, ["Service Orientation", "Customer and Personal Service"]],
  [/time management|deadline/i, ["Time Management"]], [/research/i, ["Active Learning", "Science"]], [/decision[- ]making/i, ["Judgment and Decision Making"]],
  [/quality (control|assurance)|testing/i, ["Quality Control Analysis"]], [/system(s)? (design|analysis)/i, ["Systems Analysis"]],
  [/\bdesign\b|ui\/ux|user interface/i, ["Design"]], [/marketing|sales|branding/i, ["Sales and Marketing"]],
  [/accounting|finance|economics|budget/i, ["Economics and Accounting"]], [/electronics|computer|hardware|networking/i, ["Computers and Electronics"]],
  [/engineering/i, ["Engineering and Technology"]], [/physics/i, ["Physics"]], [/psychology|counsel/i, ["Psychology"]],
  [/teaching|training|mentor|tutor/i, ["Education and Training"]], [/patient|clinical|nursing|medical/i, ["Medicine and Dentistry"]],
  [/recruit|human resources|\bhr\b|onboarding/i, ["Personnel and Human Resources"]], [/law|legal|compliance|policy/i, ["Law and Government"]],
  [/construction|site engineer|building/i, ["Building and Construction"]], [/media|journalis|video|film|social media/i, ["Communications and Media"]],
  [/\bart\b|illustration|fine arts|drawing|painting/i, ["Fine Arts"]], [/project management|operations|administration/i, ["Administration and Management"]],
];
const SHORT_TECH = { "R": /(?<![\w-])R(?=[,/)]| programming| language| studio|\s*$)/m, "C": /(?<![\w#+-])C(?=[,/)]| programming| language)/, "Go": /\bGolang\b|(?<![\w-])Go(?=[,/)]| programming| language)/, "C++": /C\+\+/, "C#": /C#/ };
function techRegex(name) {
  if (SHORT_TECH[name]) return SHORT_TECH[name];
  const e = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(?<![\\w])" + e + "(?![\\w])", "i");
}
function extractFromText(text, db) {
  const found = new Set();
  for (const t of db.skill_vocab.technical) if (techRegex(t).test(text)) found.add(t);
  for (const [alias, target] of Object.entries(ALIAS)) {
    if (new RegExp("\\b" + alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(text)) {
      const hit = db.skill_vocab.technical.find(t => t.toLowerCase() === target); if (hit) found.add(hit);
    }
  }
  for (const [rx, names] of CORE_PHRASES) if (rx.test(text)) names.forEach(n => found.add(n));
  let years = 0;
  for (const m of text.matchAll(/(\d{1,2})\s*\+?\s*(?:years|yrs)/gi)) years = Math.max(years, +m[1]);
  let edu = 0;
  if (/ph\.?\s?d|doctor(ate|al)/i.test(text)) edu = 6;
  else if (/master|m\.?\s?tech\b|m\.?\s?sc\b|\bmba\b|\bm\.?s\.?\b|\bmca\b|\bm\.?e\.?\b/i.test(text)) edu = 5;
  else if (/bachelor|b\.?\s?tech\b|\bb\.?\s?e\b|b\.?\s?sc\b|b\.?\s?com\b|\bbca\b|\bbba\b|\bb\.?a\.?\b/i.test(text)) edu = 4;
  else if (/associate/i.test(text)) edu = 3;
  else if (/diploma|certificate/i.test(text)) edu = 2;
  const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [""])[0];
  const name = (text.split(/\n/).map(s => s.trim()).find(s => s && s.length < 40 && !/@|\d{4}|resume|curriculum/i.test(s)) || "");
  return { skills: [...found], years: Math.min(years, 45), education: edu, email, name };
}

/* ---------------------------------------------------------- the engine */
function pearson(a, b) {
  const n = a.length, ma = sum(a) / n, mb = sum(b) / n;
  let num_ = 0, da = 0, dbb = 0;
  for (let i = 0; i < n; i++) { num_ += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; dbb += (b[i] - mb) ** 2; }
  return da && dbb ? num_ / Math.sqrt(da * dbb) : 0;
}
function evaluate(profile, c) {
  const has = skillSet(profile);
  const tech = c.technical.slice(0, 10).map(s => ({ ...s, have: has.has(s.name.toLowerCase()) }));
  const seen = new Set();
  const foundation = [...c.core, ...c.knowledge.slice(0, 4)]
    .filter(s => (seen.has(s.name) ? false : seen.add(s.name)))
    .map(s => ({ ...s, have: has.has(s.name.toLowerCase()) }));
  const w = arr => { const t = sum(arr.map(s => s.importance)); return t ? sum(arr.filter(s => s.have).map(s => s.importance)) / t : 0; };
  const techScore = w(tech), foundScore = w(foundation);
  const u = RIASEC.map(([k]) => +profile.interests[k] || 0), v = RIASEC.map(([k]) => c.riasec[k] || 0);
  const interest = (pearson(u, v) + 1) / 2;
  const need = eduRank(c.education), mine = +profile.education || 1;
  const eduFit = mine >= need ? 1 : clamp(1 - 0.3 * (need - mine), 0, 1);
  const anySkills = (profile.skills || []).length > 0;
  const raw = anySkills ? 0.45 * techScore + 0.2 * foundScore + 0.27 * interest + 0.08 * eduFit : 0.8 * interest + 0.2 * eduFit;
  return {
    career: c, score: Math.round(100 * Math.pow(raw, 0.8)),
    techScore: Math.round(techScore * 100), foundScore: Math.round(foundScore * 100),
    interest: Math.round(interest * 100), eduFit: Math.round(eduFit * 100),
    tech, foundation, missing: tech.filter(s => !s.have), owned: tech.filter(s => s.have),
  };
}
const rank = (profile, careers) => careers.map(c => evaluate(profile, c)).sort((a, b) => b.score - a.score);

function coursesFor(ev, db, n = 6) {
  const out = [], seen = new Set();
  const add = (c, why) => { if (c && !seen.has(c.title)) { seen.add(c.title); out.push({ ...c, why }); } };
  for (const s of ev.missing) (db.skill_courses[s.name] || []).slice(0, 1).forEach(c => add(c, s.name));
  for (const c of ev.career.courses) { if (out.length >= n) break; add(c, ev.career.name); }
  return out.slice(0, n);
}

function buildRoadmap(profile, c, db) {
  const ev = evaluate(profile, c);
  const miss = [...ev.missing].sort((a, b) => b.importance - a.importance);
  const pickCourses = (levels, k, skip) => c.courses.filter(x => levels.includes(x.level) && !skip.has(x.title)).slice(0, k);
  const used = new Set();
  const mark = arr => { arr.forEach(x => used.add(x.title)); return arr; };
  const skillCourse = s => (db.skill_courses[s.name] || []).find(x => !used.has(x.title));
  const toolkit = miss.slice(0, 4), special = miss.slice(4, 9);
  const foundCourses = mark(pickCourses(["Beginner", "Mixed"], 3, used));
  const toolkitCourses = mark(toolkit.map(skillCourse).filter(Boolean).slice(0, 3));
  if (toolkitCourses.length < 2) mark(pickCourses(["Intermediate", "Mixed", "Beginner"], 2 - toolkitCourses.length, used)).forEach(x => toolkitCourses.push(x));
  const specialCourses = mark([...special.map(skillCourse).filter(Boolean).slice(0, 2), ...pickCourses(["Advanced", "Intermediate", "Mixed"], 2, used)].slice(0, 3));
  const unownedFound = ev.foundation.filter(s => !s.have).length;
  const stages = [
    { key: "foundations", title: "Lay the foundations", weeks: clamp(2 + unownedFound, 2, 8),
      summary: `The thinking skills and knowledge areas O*NET rates most important for ${c.name.toLowerCase()}s.`,
      skills: ev.foundation.slice(0, 7), courses: foundCourses, projects: [] },
    { key: "toolkit", title: "Build the core toolkit", weeks: clamp(3 * toolkit.length, 2, 12),
      summary: `The tools that show up most in real ${c.name} job postings. Start with the ones you are missing.`,
      skills: [...ev.owned.slice(0, 4), ...toolkit], courses: toolkitCourses,
      projects: c.tasks.slice(0, 1) },
    { key: "specialize", title: "Specialise and ship projects", weeks: clamp(2 * special.length + 3, 3, 12),
      summary: "Round out the stack and turn real day-to-day tasks from the role into portfolio projects.",
      skills: special, courses: specialCourses, projects: c.tasks.slice(1, 3) },
    { key: "launch", title: "Get job-ready", weeks: 4,
      summary: `Package your work and go where the ${num(c.market.postings)} matching postings in our sample are.`,
      skills: [], courses: [],
      projects: [
        `Publish a portfolio with 2–3 projects that each prove one of: ${c.technical.slice(0, 3).map(s => s.name).join(", ")}.`,
        `Tailor your résumé to the role's language — lead with ${c.technical[0]?.name || "your strongest tool"} and quantified results.`,
        c.market.top_companies.length ? `Target employers hiring most in this data: ${c.market.top_companies.slice(0, 3).map(x => x.name).join(", ")}.` : "Apply to 10 roles a week and track responses.",
      ] },
  ];
  return { ev, stages, totalWeeks: sum(stages.map(s => s.weeks)) };
}

/* ------------------------------------------------------------- helpers */
function photo(url, label, cls = "") {
  const initial = esc((label || "?").trim()[0] || "?");
  return `<div class="photo ${cls}" data-initial="${initial}"><img src="${esc(url)}" alt="${esc(label)}" loading="lazy" referrerpolicy="no-referrer"></div>`;
}
document.addEventListener("error", e => {
  const img = e.target;
  if (img.tagName === "IMG" && img.parentElement?.classList.contains("photo")) img.parentElement.classList.add("fallback");
}, true);

function toast(msg) {
  let t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2400);
}
function loadScript(src) {
  return new Promise((res, rej) => {
    if ($(`script[src="${src}"]`)) return res();
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Could not load " + src));
    document.head.appendChild(s);
  });
}
const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#1b2a41"/><path d="M16 7c-3.6 0-6.4 2.8-6.4 6.3 0 4.6 6.4 11.7 6.4 11.7s6.4-7.1 6.4-11.7C22.4 9.8 19.6 7 16 7z" fill="#f2a541"/><circle cx="16" cy="13.3" r="2.4" fill="#1b2a41"/></svg>`;

function renderNav() {
  const host = $("#nav"); if (!host) return;
  const s = Store.session();
  const links = [["dashboard.html", "Dashboard"], ["recommendation.html", "Careers"], ["roadmap.html", "Roadmap"], ["graphs/knowledge_graph.html", "Knowledge graph"]];
  const here = location.pathname.split("/").slice(-2).join("/");
  host.innerHTML = `<nav class="nav" aria-label="Main"><div class="wrap">
    <a class="brand" href="${BASE}index.html">${LOGO}Waypoint</a>
    <button class="nav-toggle" aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button>
    <div class="nav-links" id="navLinks">${links.map(([h, t]) => `<a href="${BASE}${h}" ${here.endsWith(h) ? 'aria-current="page"' : ""}>${t}</a>`).join("")}</div>
    <div class="nav-user">${s ? `<span class="who small muted">${esc(s.name)}</span><div class="avatar" aria-hidden="true">${esc((s.name || "?")[0].toUpperCase())}</div>
      <button class="btn btn-ghost btn-sm" id="signOut">Sign out</button>` : `<a class="btn btn-sm" href="${BASE}login.html">Sign in</a>`}</div>
  </div></nav>`;
  $("#signOut")?.addEventListener("click", () => Store.signOut());
  const tg = $(".nav-toggle", host);
  tg.addEventListener("click", () => { const o = $("#navLinks").classList.toggle("open"); tg.setAttribute("aria-expanded", o); });
}
function requireSession() {
  if (!Store.session()) { location.replace(BASE + "login.html?next=" + encodeURIComponent(location.pathname.split("/").pop())); return false; }
  return true;
}
function dataError(host, err) {
  console.error(err);
  host.innerHTML = `<div class="wrap"><div class="notice"><strong>The career data could not be loaded.</strong><br>
    Browsers block data files opened straight from disk. Start the server with <code>python backend/app.py</code> and open
    <code>http://localhost:5000</code> (or run <code>python -m http.server</code> in the project folder).</div></div>`;
}

/* ================================================================ PAGES */
const Pages = {};

/* ---------- Landing ---------- */
Pages.index = async () => {
  try {
    const db = await Data.load(); const a = db.analytics;
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set("#stPostings", num(a.total_postings)); set("#stCareers", db.careers.length);
    set("#stOcc", num(a.onet_occupations)); set("#stCourses", num(a.courses));
    const picks = ["data-scientist", "ux-designer", "registered-nurse", "software-developer", "civil-engineer", "financial-analyst", "video-editor", "robotics-engineer"];
    const shape = ["tall", "wide", "", "", "", "wide", "", ""];
    $("#mosaic").innerHTML = picks.map((id, i) => {
      const c = Data.byId[id]; if (!c) return "";
      return `<a class="tile ${shape[i]}" href="recommendation.html?career=${c.id}">${photo(c.image, c.name)}
        <div class="tile-body"><h3>${esc(c.name)}</h3><span>${money(c.market.salary_median)} median · ${num(c.market.postings)} postings</span></div></a>`;
    }).join("");
  } catch (e) { console.warn("Landing stats unavailable (open via a local server).", e); }
  const s = Store.session();
  $$("[data-start]").forEach(a => a.href = s ? "dashboard.html" : "login.html");
};

/* ---------- Login ---------- */
async function sha(s) {
  if (crypto?.subtle) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
  return btoa(unescape(encodeURIComponent(s)));
}
Pages.login = () => {
  const next = new URLSearchParams(location.search).get("next") || "dashboard.html";
  const go = () => location.href = /^[\w-]+\.html$/.test(next) ? next : "dashboard.html";
  let mode = "signin";
  const setMode = m => {
    mode = m; $$(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.mode === m));
    $("#nameField").hidden = m === "signin"; $("#submitBtn").textContent = m === "signin" ? "Sign in" : "Create account";
    $("#authTitle").textContent = m === "signin" ? "Welcome back" : "Start your route"; $("#err").textContent = "";
    $("#password").autocomplete = m === "signin" ? "current-password" : "new-password";
  };
  $$(".tabs button").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("#authForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("#email").value.trim().toLowerCase(), pw = $("#password").value, name = $("#name").value.trim();
    const err = $("#err");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return (err.textContent = "Enter a valid email address.");
    if (pw.length < 6) return (err.textContent = "Passwords need at least 6 characters.");
    const users = LS.get("wp_users", {}); const h = await sha(email + ":" + pw);
    if (mode === "signup") {
      if (!name) return (err.textContent = "Add your name so we can personalise your plan.");
      if (users[email]) return (err.textContent = "An account with this email already exists. Sign in instead.");
      users[email] = { name, email, h }; LS.set("wp_users", users); Store.signIn(users[email]); go();
    } else {
      if (!users[email] || users[email].h !== h) return (err.textContent = "Email or password doesn't match. Check both and try again.");
      Store.signIn(users[email]); go();
    }
  });
  $("#guestBtn").addEventListener("click", () => { Store.signIn({ name: "Guest", email: "guest", guest: true }); go(); });
  setMode(new URLSearchParams(location.search).get("mode") === "signup" ? "signup" : "signin");
};

/* ---------- Dashboard ---------- */
Pages.dashboard = async () => {
  if (!requireSession()) return;
  renderNav();
  const main = $("#main");
  let db; try { db = await Data.load(); } catch (e) { return dataError(main, e); }
  const profile = Store.profile();
  const vocab = [
    ...db.skill_vocab.technical.map(n => ({ n, t: "Tool" })),
    ...db.skill_vocab.core.map(n => ({ n, t: "Core skill" })),
    ...[...new Set(db.careers.flatMap(c => c.knowledge.map(k => k.name)))].filter(n => !db.skill_vocab.core.includes(n)).map(n => ({ n, t: "Knowledge" })),
  ];

  // --- profile form
  $("#pName").value = profile.name; $("#pHeadline").value = profile.headline || "";
  $("#pEdu").innerHTML = EDU_LEVELS.map((l, i) => `<option value="${i + 1}" ${+profile.education === i + 1 ? "selected" : ""}>${l}</option>`).join("");
  $("#pYears").value = profile.years || 0;
  $("#sliders").innerHTML = RIASEC.map(([k, d]) => `<div class="slider-row"><label for="r-${k}"><strong>${k}</strong><small>${d}</small></label>
     <input type="range" id="r-${k}" min="0" max="5" step="1" value="${profile.interests[k] ?? 3}" data-k="${k}"><output>${profile.interests[k] ?? 3}</output></div>`).join("");

  const renderChips = () => {
    $("#skillChips").innerHTML = profile.skills.length
      ? profile.skills.map(s => `<span class="chip have">${esc(s)}<button type="button" aria-label="Remove ${esc(s)}" data-rm="${esc(s)}">×</button></span>`).join("")
      : `<span class="muted small">No skills yet. Add a few below or upload your résumé.</span>`;
    $("#skillCount").textContent = profile.skills.length;
  };
  const addSkill = s => { if (s && !profile.skills.some(x => x.toLowerCase() === s.toLowerCase())) profile.skills.push(s); };
  $("#skillChips").addEventListener("click", e => { const b = e.target.closest("[data-rm]"); if (b) { profile.skills = profile.skills.filter(x => x !== b.dataset.rm); save(); } });

  // autocomplete
  const inp = $("#skillInput"), box = $("#suggest"); let active = -1, items = [];
  const close = () => { box.hidden = true; active = -1; };
  inp.addEventListener("input", () => {
    const q = inp.value.trim().toLowerCase(); if (!q) return close();
    items = vocab.filter(v => v.n.toLowerCase().includes(q) && !profile.skills.includes(v.n))
      .sort((a, b) => a.n.toLowerCase().indexOf(q) - b.n.toLowerCase().indexOf(q)).slice(0, 8);
    box.innerHTML = items.map((v, i) => `<button type="button" data-i="${i}">${esc(v.n)}<em>${v.t}</em></button>`).join("")
      + (items.some(v => v.n.toLowerCase() === q) ? "" : `<button type="button" data-custom="1">Add “${esc(inp.value.trim())}”<em>Custom</em></button>`);
    box.hidden = false; active = -1;
  });
  inp.addEventListener("keydown", e => {
    const btns = $$("button", box);
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, btns.length - 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); }
    else if (e.key === "Enter") { e.preventDefault(); (btns[active] || btns[0])?.click(); return; }
    else if (e.key === "Escape") return close();
    btns.forEach((b, i) => b.classList.toggle("active", i === active));
  });
  box.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    addSkill(b.dataset.custom ? inp.value.trim() : items[+b.dataset.i].n); inp.value = ""; close(); save();
  });
  document.addEventListener("click", e => { if (!e.target.closest(".autocomplete")) close(); });

  // --- résumé
  const dz = $("#dropzone"), file = $("#resumeFile");
  dz.addEventListener("click", () => file.click());
  dz.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
  ["dragenter", "dragover"].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", e => e.dataTransfer.files[0] && handleResume(e.dataTransfer.files[0]));
  file.addEventListener("change", () => file.files[0] && handleResume(file.files[0]));

  async function readResume(f) {
    const ext = f.name.split(".").pop().toLowerCase();
    if (ext === "pdf") {
      try {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        const pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise; let text = "";
        for (let i = 1; i <= pdf.numPages; i++) { const pg = await pdf.getPage(i); const tc = await pg.getTextContent(); text += tc.items.map(x => x.str + (x.hasEOL ? "\n" : " ")).join("") + "\n"; }
        return text;
      } catch (err) { return serverParse(f, err); }
    }
    if (ext === "docx") {
      try {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js");
        return (await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value;
      } catch (err) { return serverParse(f, err); }
    }
    if (["txt", "md", "rtf"].includes(ext)) return f.text();
    throw new Error("Upload a PDF, DOCX or TXT résumé.");
  }
  async function serverParse(f, cause) {
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch(BASE + "api/resume", { method: "POST", body: fd }).catch(() => null);
    if (!r || !r.ok) throw cause; return (await r.json()).text;
  }
  async function handleResume(f) {
    const st = $("#resumeStatus");
    if (f.size > 8 * 1024 * 1024) { st.innerHTML = `<p class="form-error">That file is over 8 MB. Export a smaller PDF and try again.</p>`; return; }
    st.innerHTML = `<p class="muted">Reading ${esc(f.name)}…</p>`;
    try {
      const text = await readResume(f);
      const r = extractFromText(text, db);
      const fresh = r.skills.filter(s => !profile.skills.some(x => x.toLowerCase() === s.toLowerCase()));
      profile.resume = { name: f.name, at: Date.now(), found: r.skills.length };
      st.innerHTML = `<div class="stack" style="gap:12px;margin-top:16px">
        <p><strong>${r.skills.length} skills found</strong> in ${esc(f.name)}${r.years ? ` · ${r.years} years' experience mentioned` : ""}${r.education ? ` · ${EDU_LEVELS[r.education - 1]}` : ""}</p>
        <div class="chips">${r.skills.map(s => `<span class="chip ${fresh.includes(s) ? "route" : "have"}">${esc(s)}</span>`).join("") || '<span class="muted">No known skills matched. Try adding them manually.</span>'}</div>
        ${fresh.length ? `<div><button class="btn btn-route btn-sm" id="addFound">Add ${fresh.length} new skill${fresh.length > 1 ? "s" : ""} to profile</button></div>` : `<p class="small muted">All of these are already on your profile.</p>`}
      </div>`;
      $("#addFound")?.addEventListener("click", () => {
        fresh.forEach(addSkill);
        if (r.years && !+profile.years) { profile.years = r.years; $("#pYears").value = r.years; }
        if (r.education && r.education > +profile.education) { profile.education = r.education; $("#pEdu").value = r.education; }
        if (!profile.name && r.name) { profile.name = r.name; $("#pName").value = r.name; }
        save(); toast(`Added ${fresh.length} skills from your résumé`);
        $("#addFound").replaceWith(Object.assign(document.createElement("p"), { className: "small muted", textContent: "Added to your profile." }));
      });
      save(true);
    } catch (err) {
      console.error(err);
      st.innerHTML = `<p class="form-error">Couldn't read that file. ${esc(err.message || "")} Upload a text-based PDF, DOCX or TXT.</p>`;
    }
  }

  // --- save + re-render
  let charts = {};
  function save(quiet) {
    profile.name = $("#pName").value.trim(); profile.headline = $("#pHeadline").value.trim();
    profile.education = +$("#pEdu").value; profile.years = +$("#pYears").value || 0;
    $$("#sliders input").forEach(i => profile.interests[i.dataset.k] = +i.value);
    Store.saveProfile(profile); renderChips(); renderInsights();
    if (!quiet) $("#savedAt").textContent = "Saved just now";
  }
  $("#profileForm").addEventListener("input", e => {
    if (e.target.type === "range") e.target.nextElementSibling.textContent = e.target.value;
    if (e.target.id !== "skillInput") { clearTimeout(save._t); save._t = setTimeout(() => save(), 300); }
  });
  $("#profileForm").addEventListener("submit", e => e.preventDefault());

  function renderInsights() {
    const ranked = rank(profile, db.careers);
    const top = ranked.slice(0, 4);
    const done = [profile.name, profile.skills.length >= 3, profile.skills.length >= 8, profile.resume, Object.values(profile.interests).some(v => v !== 3), profile.headline].filter(Boolean).length;
    const pct = Math.round(done / 6 * 100);
    $("#ring").style.setProperty("--p", pct); $("#ring span").textContent = pct + "%";
    $("#greet").textContent = profile.name ? `Hi ${profile.name.split(" ")[0]}, here's where you stand` : "Your career dashboard";
    $("#topMatches").innerHTML = top.map(r => `<a class="match-mini" href="recommendation.html?career=${r.career.id}">
      ${photo(r.career.image, r.career.name)}<div><h4>${esc(r.career.name)}</h4>
      <p class="small muted">${money(r.career.market.salary_median)} median · ${r.missing.length} skills to learn</p>
      <div class="bar"><i style="width:${r.score}%"></i></div></div><div class="score">${r.score}<small>%</small></div></a>`).join("");
    const a = db.analytics;
    $("#kpis").innerHTML = [
      [num(a.total_postings), "Job postings analysed"], [money(a.salary_median), "Median salary, matched roles"],
      [a.remote_pct + "%", "Allow remote work"], [num(a.courses), "Coursera courses mapped"],
    ].map(([v, l]) => `<div class="kpi"><strong>${v}</strong><span>${l}</span></div>`).join("");
    drawCharts(ranked);
  }

  function drawCharts(ranked) {
    if (!window.Chart) return;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily; Chart.defaults.color = "#5b7083";
    const has = skillSet(profile);
    const top = db.analytics.top_skills.slice(0, 12);
    const cfg = {
      skills: { type: "bar", data: { labels: top.map(s => s.name), datasets: [{ data: top.map(s => s.postings),
        backgroundColor: top.map(s => (has.has(s.name.toLowerCase()) ? "#1f7a74" : "#c9d5d0")), borderRadius: 6 }] },
        options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false },
          tooltip: { callbacks: { label: c => `${num(c.raw)} postings ask for it${has.has(c.label.toLowerCase()) ? " — you have it" : ""}` } } },
          scales: { x: { grid: { color: "#eef2f0" } }, y: { grid: { display: false } } } } },
      salary: (() => { const t = ranked.slice(0, 8); return { type: "bar", data: { labels: t.map(r => r.career.name),
        datasets: [{ label: "25th–75th percentile", data: t.map(r => [r.career.market.salary_p25, r.career.market.salary_p75]), backgroundColor: "#f2a541", borderRadius: 6, barThickness: 16 }] },
        options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false },
          tooltip: { callbacks: { label: c => `${money(c.raw[0])} – ${money(c.raw[1])} · median ${money(t[c.dataIndex].career.market.salary_median)}` } } },
          scales: { x: { ticks: { callback: v => "$" + v / 1000 + "k" }, grid: { color: "#eef2f0" } }, y: { grid: { display: false } } } } }; })(),
      exp: (() => { const e = Object.entries(db.analytics.experience); return { type: "doughnut",
        data: { labels: e.map(x => x[0]), datasets: [{ data: e.map(x => x[1]), backgroundColor: ["#1b2a41", "#f2a541", "#1f7a74", "#6c8ead", "#d1495b", "#c9d5d0"], borderWidth: 0 }] },
        options: { maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "right", labels: { boxWidth: 10, boxHeight: 10 } } } } }; })(),
      radar: (() => { const r = ranked[0]; const f = r.foundation.slice(0, 8); return { type: "radar",
        data: { labels: f.map(s => s.name.replace(" and ", " & ")), datasets: [
          { label: `${r.career.name} needs`, data: f.map(s => s.importance), borderColor: "#f2a541", backgroundColor: "rgba(242,165,65,.18)", pointRadius: 2 },
          { label: "You", data: f.map(s => (s.have ? s.importance : 8)), borderColor: "#1f7a74", backgroundColor: "rgba(31,122,116,.2)", pointRadius: 2 }] },
        options: { maintainAspectRatio: false, scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: "#e3e9e6" }, angleLines: { color: "#e3e9e6" }, pointLabels: { font: { size: 11 } } } },
          plugins: { legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10 } } } } }; })(),
    };
    $("#radarTitle").textContent = `Core skills vs ${ranked[0].career.name}`;
    for (const [k, c] of Object.entries(cfg)) { charts[k]?.destroy(); charts[k] = new Chart($("#ch-" + k), c); }
  }

  renderChips(); renderInsights();
  if (profile.updated) $("#savedAt").textContent = "Saved " + new Date(profile.updated).toLocaleDateString();
};

/* ---------- Recommendations ---------- */
Pages.recommendation = async () => {
  if (!requireSession()) return;
  renderNav();
  const main = $("#main");
  let db; try { db = await Data.load(); } catch (e) { return dataError(main, e); }
  const profile = Store.profile();
  const ranked = rank(profile, db.careers);
  const params = new URLSearchParams(location.search);
  let selected = params.get("career") || ranked[0].career.id, cat = "All", sort = "match";

  if (!profile.skills.length) $("#hint").innerHTML = `<div class="notice">You haven't added any skills yet, so matches are based on interests only. <a href="dashboard.html">Add skills or upload a résumé</a> for a real gap analysis.</div>`;
  const cats = ["All", ...new Set(db.careers.map(c => c.category))];
  $("#cats").innerHTML = cats.map(c => `<button class="pill" aria-pressed="${c === cat}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")
    + `<select class="input" id="sort" aria-label="Sort careers"><option value="match">Best match</option><option value="salary">Highest salary</option><option value="demand">Most postings</option><option value="gap">Fewest skills to learn</option></select>`;
  $("#cats").addEventListener("click", e => { const b = e.target.closest("[data-cat]"); if (!b) return; cat = b.dataset.cat; $$("#cats .pill").forEach(x => x.setAttribute("aria-pressed", x === b)); list(); });
  $("#sort").addEventListener("change", e => { sort = e.target.value; list(); });

  function list() {
    let r = ranked.filter(x => cat === "All" || x.career.category === cat);
    const by = { match: (a, b) => b.score - a.score, salary: (a, b) => (b.career.market.salary_median || 0) - (a.career.market.salary_median || 0),
      demand: (a, b) => b.career.market.postings - a.career.market.postings, gap: (a, b) => a.missing.length - b.missing.length || b.score - a.score };
    r = [...r].sort(by[sort]);
    $("#recList").innerHTML = r.map(x => `<button class="rec-card" role="option" aria-selected="${x.career.id === selected}" data-id="${x.career.id}">
      ${photo(x.career.image, x.career.name)}<div><div style="display:flex;justify-content:space-between;gap:8px"><h3>${esc(x.career.name)}</h3><span class="score" style="font-size:1.2rem">${x.score}%</span></div>
      <div class="bar"><i style="width:${x.score}%"></i></div>
      <div class="rec-meta"><span>${money(x.career.market.salary_median)} median</span><span>${x.owned.length}/${x.tech.length} tools</span></div></div></button>`).join("");
  }
  $("#recList").addEventListener("click", e => { const b = e.target.closest(".rec-card"); if (!b) return; selected = b.dataset.id; history.replaceState(null, "", "?career=" + selected); list(); detail(); if (innerWidth < 1080) $("#detail").scrollIntoView({ behavior: "smooth" }); });

  async function detail() {
    const r = ranked.find(x => x.career.id === selected) || ranked[0]; const c = r.career, m = c.market;
    const gapRow = s => `<div class="gap-row ${s.have ? "have" : "gap"}"><span class="name">${esc(s.name)}</span>
      <span class="track" role="img" aria-label="${esc(s.name)} importance ${s.importance} of 100"><i style="width:${s.importance}%"></i></span>
      <span class="val">${s.demand !== undefined ? s.demand + "%" : s.importance}</span></div>`;
    const courses = coursesFor(r, db, 6);
    $("#detail").innerHTML = `
      <div class="detail-hero">${photo(c.image, c.name)}<div><div><span class="chip route">${esc(c.category)}</span><h2 style="margin-top:10px">${esc(c.name)}</h2>
        <p>O*NET ${esc(c.onet_code)} · ${esc(c.onet_title)}</p></div><div class="big-score">${r.score}%<small>overall match</small></div></div></div>
      <div class="detail-body">
        <p>${esc(c.description)}</p>
        <div class="breakdown"><div><strong>${r.techScore}%</strong><span>Tool coverage</span></div><div><strong>${r.foundScore}%</strong><span>Core skills</span></div><div><strong>${r.interest}%</strong><span>Interest fit</span></div></div>
        <div class="facts"><div><strong>${money(m.salary_median)}</strong><span>Median salary</span></div><div><strong>${num(m.postings)}</strong><span>Postings in sample</span></div>
          <div><strong>${m.remote_pct}%</strong><span>Remote allowed</span></div><div><strong>${esc(c.education.replace(" degree", ""))}</strong><span>Typical education</span></div></div>
        <section><div class="panel-head"><h3>Skill gap: tools</h3><div class="legend"><span class="l-have">You have</span><span class="l-gap">To learn</span></div></div>
          <p class="small muted" style="margin:-8px 0 12px">Bar length = importance for the role. Right column = share of real job ads for this role that mention it.</p>
          ${r.tech.map(gapRow).join("")}</section>
        <section><div class="panel-head"><h3>Skill gap: core skills & knowledge</h3></div>${r.foundation.slice(0, 8).map(s => gapRow({ ...s, demand: undefined })).join("")}</section>
        <section><div class="panel-head"><h3>Courses to close the gap</h3><span class="small muted">From the Coursera catalog</span></div>
          ${courses.map(k => `<a class="course" href="${esc(k.url)}" target="_blank" rel="noopener"><div><h4>${esc(k.title)}</h4>
            <div class="meta">${esc(k.org)} · ${esc(k.level)} · ${esc(k.type)} · ${num(k.enrolled)} learners${k.why !== c.name ? ` · <span class="chip gap" style="padding:1px 8px">${esc(k.why)}</span>` : ""}</div></div>
            <span class="stars">★ ${k.rating.toFixed(1)}</span></a>`).join("")}</section>
        <section><div class="panel-head"><h3>Live examples from job postings</h3><span class="small muted">LinkedIn, ${esc(db.analytics.date_range.join(" to "))}</span></div><div class="jobs" id="jobs"><p class="muted">Loading postings…</p></div></section>
        <section class="grid-2"><div><h4 style="margin-bottom:10px">Who's hiring</h4><div class="chips">${m.top_companies.map(x => `<span class="chip sky">${esc(x.name)} · ${x.count}</span>`).join("")}</div></div>
          <div><h4 style="margin-bottom:10px">Related roles</h4><div class="chips">${c.related.map(x => `<span class="chip">${esc(x)}</span>`).join("")}</div></div></section>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-route" href="roadmap.html?career=${c.id}">Build my roadmap</a><a class="btn btn-ghost" href="graphs/knowledge_graph.html?focus=${c.id}">See it on the knowledge graph</a></div>
      </div>`;
    const jobs = (await Data.loadJobs()).filter(j => j.career_id === c.id).slice(0, 6);
    $("#jobs").innerHTML = jobs.length ? jobs.map(j => `<a class="job" href="${esc(j.url)}" target="_blank" rel="noopener"><div class="job-top"><strong>${esc(j.title)}</strong>${j.salary ? `<span class="pay">${money(+j.salary)}</span>` : ""}</div>
      <span class="meta">${esc(j.company)} · ${esc(j.location)}${+j.remote ? " · Remote" : ""}${j.experience ? " · " + esc(j.experience) : ""}</span>
      ${j.skills ? `<div class="chips" style="gap:5px;margin-top:6px">${j.skills.split("|").map(s => `<span class="chip ${skillSet(profile).has(s.toLowerCase()) ? "have" : ""}" style="padding:2px 9px;font-size:.78rem">${esc(s)}</span>`).join("")}</div>` : ""}</a>`).join("")
      : `<p class="muted">No sample postings for this role.</p>`;
  }
  list(); detail();
};

/* ---------- Roadmap ---------- */
Pages.roadmap = async () => {
  if (!requireSession()) return;
  renderNav();
  const main = $("#main");
  let db; try { db = await Data.load(); } catch (e) { return dataError(main, e); }
  const profile = Store.profile();
  const ranked = rank(profile, db.careers);
  let id = new URLSearchParams(location.search).get("career") || ranked[0].career.id;
  $("#careerPick").innerHTML = `<optgroup label="Your top matches">${ranked.slice(0, 6).map(r => `<option value="${r.career.id}">${esc(r.career.name)} (${r.score}%)</option>`).join("")}</optgroup>
    <optgroup label="All careers">${[...db.careers].sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</optgroup>`;
  $("#careerPick").value = id;
  $("#careerPick").addEventListener("change", e => { id = e.target.value; history.replaceState(null, "", "?career=" + id); draw(); });

  function draw() {
    const c = Data.byId[id]; const plan = buildRoadmap(profile, c, db); const prog = Store.progress(id);
    const items = [];
    const itemHtml = (key, label, owned, extra = "") => {
      items.push(key); const on = owned || prog[key];
      return `<label class="check ${owned ? "owned" : ""}"><input type="checkbox" data-key="${esc(key)}" ${on ? "checked" : ""} ${owned ? "disabled" : ""}>
        <span>${label}${owned ? '<span class="tag">you have this</span>' : ""}${extra}</span></label>`;
    };
    let week = 0;
    const stagesHtml = plan.stages.map((s, i) => {
      const from = week + 1; week += s.weeks;
      const sk = s.skills.map(x => itemHtml(`s:${x.name}`, esc(x.name), x.have, x.demand !== undefined && !x.have ? ` <span class="small muted">· in ${x.demand}% of ads</span>` : "")).join("");
      const co = s.courses.map(k => itemHtml(`c:${k.title}`, `<a href="${esc(k.url)}" target="_blank" rel="noopener">${esc(k.title)}</a> <span class="small muted">· ${esc(k.org)} · ${esc(k.level)} · ★ ${k.rating}</span>`, false)).join("");
      const pr = s.projects.map((t, j) => itemHtml(`p:${s.key}:${j}`, `<span class="project" style="display:block">${s.key === "launch" ? "" : "Project: "}${esc(t)}</span>`, false)).join("");
      return `<article class="stage panel" data-stage="${s.key}"><div class="stage-marker">${i + 1}</div>
        <div class="stage-head"><h3>${esc(s.title)}</h3><span class="when">Weeks ${from}–${week}</span></div>
        <p class="muted" style="margin-bottom:16px">${esc(s.summary)}</p>
        <div class="stage-cols">${sk || co ? `<div>${sk ? `<h4 style="margin-bottom:4px">Skills</h4>${sk}` : ""}${co ? `<h4 style="margin:14px 0 4px">Courses</h4>${co}` : ""}</div>` : ""}
          ${pr ? `<div><h4 style="margin-bottom:4px">${s.key === "launch" ? "Checklist" : "Portfolio work"}</h4>${pr}</div>` : ""}</div></article>`;
    }).join("");
    $("#roadHero").innerHTML = `${photo(c.image, c.name)}<div><span class="chip route" style="justify-self:start">${esc(c.category)} · ${esc(c.job_zone_label)}</span>
      <h1 style="font-size:clamp(2.2rem,5vw,3.8rem)">Your route to ${esc(c.name)}</h1>
      <p>${plan.ev.missing.length ? `You already cover ${plan.ev.owned.length} of the ${plan.ev.tech.length} most-requested tools. This plan fills the other ${plan.ev.missing.length}, in order of how often employers ask for them.` : "You already cover every top tool for this role. This plan focuses on depth, projects, and getting hired."}</p>
      <div class="road-stats"><div><strong>${plan.totalWeeks} wks</strong><span>at ~10 hrs/week</span></div><div><strong>${plan.ev.missing.length}</strong><span>tools to learn</span></div>
        <div><strong>${money(c.market.salary_median)}</strong><span>median salary</span></div><div><strong>${esc(c.education.replace(" degree", ""))}</strong><span>typical education</span></div></div>
      <div class="progress-line" aria-label="Plan progress"><i id="progBar"></i></div><span class="small" id="progText" style="color:#c3d0dc"></span></div>`;
    $("#timeline").innerHTML = stagesHtml;
    $("#tasks").innerHTML = c.tasks.map(t => `<li>${esc(t)}</li>`).join("");
    $("#related").innerHTML = c.related.map(x => `<span class="chip">${esc(x)}</span>`).join("");
    $("#where").innerHTML = c.market.top_locations.map(x => `<span class="chip sky">${esc(x.name)} · ${x.count}</span>`).join("");
    const update = () => {
      const boxes = $$("#timeline input"); const done = boxes.filter(b => b.checked).length;
      const pct = Math.round(100 * done / Math.max(boxes.length, 1));
      $("#progBar").style.width = pct + "%"; $("#progText").textContent = `${done} of ${boxes.length} steps complete (${pct}%)`;
      $$("#timeline .stage").forEach(st => { const b = $$("input", st); st.classList.toggle("done", b.length > 0 && b.every(x => x.checked)); });
    };
    $("#timeline").onchange = e => { const k = e.target.dataset.key; if (!k) return; const p = Store.progress(id); p[k] = e.target.checked; Store.saveProgress(id, p);
      if (e.target.checked && k.startsWith("s:")) { const name = k.slice(2); if (!profile.skills.includes(name)) { profile.skills.push(name); Store.saveProfile(profile); toast(`${name} added to your skills`); } }
      update(); };
    update();
  }
  draw();
};

/* ---------- Knowledge graph ---------- */
Pages.graph = async () => {
  if (!requireSession()) return;
  renderNav();
  const main = $("#main");
  let db; try { db = await Data.load(); } catch (e) { return dataError(main, e); }
  if (!window.d3) { main.innerHTML = `<div class="wrap"><div class="notice">The graph library (D3) didn't load. Check your internet connection and reload.</div></div>`; return; }
  const profile = Store.profile(); const has = skillSet(profile);
  const ranked = rank(profile, db.careers);
  const focus = new URLSearchParams(location.search).get("focus");
  const state = { count: 8, courses: true, core: false };

  const svg = d3.select("#graph"); const host = $("#graphHost");
  const g = svg.append("g");
  const defs = svg.append("defs");
  svg.call(d3.zoom().scaleExtent([.3, 3]).on("zoom", e => g.attr("transform", e.transform)));
  let sim;

  function build() {
    const W = host.clientWidth, H = host.clientHeight;
    svg.attr("viewBox", [0, 0, W, H]);
    g.selectAll("*").remove(); defs.selectAll("*").remove();
    let picks = ranked.slice(0, state.count);
    if (focus && !picks.some(r => r.career.id === focus)) picks = [ranked.find(r => r.career.id === focus), ...picks.slice(0, -1)];
    const nodes = [{ id: "you", label: profile.name || "You", type: "you", r: 30 }], links = [], idx = new Map([["you", nodes[0]]]);
    const add = n => { if (!idx.has(n.id)) { idx.set(n.id, n); nodes.push(n); } return idx.get(n.id); };
    picks.forEach(r => {
      const c = r.career;
      add({ id: "c:" + c.id, label: c.name, type: "career", r: 20 + r.score / 6, img: c.image, score: r.score, data: c });
      links.push({ source: "you", target: "c:" + c.id, w: r.score / 100, kind: "match" });
      r.tech.slice(0, 6).forEach(s => { add({ id: "s:" + s.name, label: s.name, type: s.have ? "have" : "gap", r: 7 }); links.push({ source: "c:" + c.id, target: "s:" + s.name, w: s.importance / 100 }); });
      if (state.core) r.foundation.slice(0, 3).forEach(s => { add({ id: "k:" + s.name, label: s.name, type: "core", r: 6 }); links.push({ source: "c:" + c.id, target: "k:" + s.name, w: .4 }); });
      if (state.courses) coursesFor(r, db, 2).forEach(k => { add({ id: "o:" + k.title, label: k.title, type: "course", r: 6, data: k }); links.push({ source: "c:" + c.id, target: "o:" + k.title, w: .3 }); });
    });
    // you → skills you own
    nodes.filter(n => n.type === "have").forEach(n => links.push({ source: "you", target: n.id, w: .15, kind: "own" }));
    nodes.forEach(n => { n.deg = links.filter(l => l.source === n.id || l.target === n.id).length; if (n.type === "have" || n.type === "gap") n.r = 5 + Math.min(n.deg, 8) * 1.4; });

    nodes.filter(n => n.img).forEach(n => defs.append("pattern").attr("id", "img-" + slug(n.id)).attr("width", 1).attr("height", 1).attr("patternContentUnits", "objectBoundingBox")
      .call(p => p.append("rect").attr("width", 1).attr("height", 1).attr("fill", "#324a5f"))
      .append("image").attr("href", n.img).attr("width", 1).attr("height", 1).attr("preserveAspectRatio", "xMidYMid slice"));
    const col = { you: "#1b2a41", career: "#f2a541", have: "#1f7a74", gap: "#d1495b", course: "#6c8ead", core: "#8a9aa8" };

    const link = g.append("g").selectAll("line").data(links).join("line")
      .attr("stroke", d => (d.kind === "match" ? "#f2a541" : d.kind === "own" ? "#1f7a74" : "#b9c7c1"))
      .attr("stroke-width", d => (d.kind === "match" ? 1 + d.w * 4 : 1)).attr("stroke-dasharray", d => (d.kind === "match" ? "6 5" : null)).attr("stroke-opacity", .75);
    const node = g.append("g").selectAll("g").data(nodes).join("g").attr("class", "gnode").style("cursor", "pointer")
      .call(d3.drag().on("start", (e, d) => { if (!e.active) sim.alphaTarget(.25).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; }).on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); if (d.type !== "career" && d.type !== "you") d.fx = d.fy = null; }));
    node.append("circle").attr("r", d => d.r)
      .attr("fill", d => (d.img ? `url(#img-${slug(d.id)})` : col[d.type]))
      .attr("stroke", d => (d.type === "career" ? "#f2a541" : "#fff")).attr("stroke-width", d => (d.type === "career" ? 3 : 1.5));
    node.filter(d => d.type === "you").append("text").text(d => (d.label[0] || "Y").toUpperCase()).attr("text-anchor", "middle").attr("dy", "0.35em")
      .attr("fill", "#f2a541").attr("font-family", "Bricolage Grotesque, sans-serif").attr("font-weight", 800).attr("font-size", 22);
    const label = node.filter(d => d.type !== "you").append("text").text(d => (d.label.length > 26 ? d.label.slice(0, 24) + "…" : d.label))
      .attr("x", d => d.r + 5).attr("dy", "0.35em").attr("font-size", d => (d.type === "career" ? 13 : 11)).attr("font-weight", d => (d.type === "career" ? 600 : 400))
      .attr("fill", "#1b2a41").attr("paint-order", "stroke").attr("stroke", "#eef2f0").attr("stroke-width", 3)
      .style("display", d => (d.type === "course" || d.type === "core" ? "none" : null));

    const neighbours = new Map(nodes.map(n => [n.id, new Set([n.id])]));
    const R = Math.min(W, H) * .25;
    sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(d => (d.kind === "match" ? R : d.kind === "own" ? R * 1.6 : 70)).strength(d => (d.kind === "own" ? .02 : d.kind === "match" ? .3 : .5)))
      .force("charge", d3.forceManyBody().strength(d => (d.type === "career" ? -700 : -120)))
      .force("collide", d3.forceCollide(d => d.r + (d.type === "career" ? 14 : 6))).force("radial", d3.forceRadial(d => (d.type === "you" ? 0 : R * 1.2), W / 2, H / 2).strength(d => (d.type === "have" ? .02 : .06)));
    nodes[0].fx = W / 2; nodes[0].fy = H / 2;
    // careers sit at even angles on a ring around you; everything else floats between them
    const cs = nodes.filter(n => n.type === "career");
    cs.forEach((n, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / cs.length;
      n.fx = n.x = W / 2 + R * Math.cos(a) * 1.12; n.fy = n.y = H / 2 + R * Math.sin(a); n.angle = a; });
    label.filter(d => d.type === "career").attr("x", d => (Math.cos(d.angle) < -0.2 ? -(d.r + 6) : d.r + 5)).attr("text-anchor", d => (Math.cos(d.angle) < -0.2 ? "end" : "start"));
    nodes.filter(n => n.type !== "career" && n.type !== "you").forEach(n => { n.x = W / 2 + (Math.random() - .5) * W * .8; n.y = H / 2 + (Math.random() - .5) * H * .8; });
    links.forEach(l => { const s = typeof l.source === "object" ? l.source.id : l.source, t = typeof l.target === "object" ? l.target.id : l.target; neighbours.get(s)?.add(t); neighbours.get(t)?.add(s); });
    sim.on("tick", () => {
      link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });
    const highlight = d => {
      const nb = d ? neighbours.get(d.id) : null;
      node.style("opacity", n => (!nb || nb.has(n.id) ? 1 : .15));
      link.style("opacity", l => (!nb || l.source.id === d.id || l.target.id === d.id ? 1 : .06));
      label.style("display", n => (nb && nb.has(n.id)) || (!nb && n.type !== "course" && n.type !== "core") ? null : "none");
    };
    node.on("mouseenter", (e, d) => highlight(d)).on("mouseleave", () => highlight(sticky));
    let sticky = null;
    node.on("click", (e, d) => { e.stopPropagation(); sticky = d; highlight(d); info(d, nodes, links); });
    svg.on("click", () => { sticky = null; highlight(null); info(null); });
    if (focus) { const f = idx.get("c:" + focus); if (f) setTimeout(() => { sticky = f; highlight(f); info(f, nodes, links); }, 600); }
    $("#graphSearch").oninput = e => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) { highlight(sticky); return; }
      const hit = nodes.find(n => n.label.toLowerCase().includes(q)); if (hit) highlight(hit);
    };
    $("#gStats").textContent = `${nodes.length} nodes · ${links.length} links`;
  }

  function info(d, nodes, links) {
    const box = $("#nodeInfo");
    if (!d) { box.innerHTML = `<h3>Explore the map</h3><p class="muted small" style="margin-top:6px">Click any node. Careers are sized by how well they match you; skills by how many of these careers need them. Drag to rearrange, scroll to zoom.</p>`; return; }
    const connected = links.filter(l => l.source.id === d.id || l.target.id === d.id).map(l => (l.source.id === d.id ? l.target : l.source));
    if (d.type === "career") {
      const r = ranked.find(x => x.career.id === d.data.id);
      box.innerHTML = `${photo(d.img, d.label, "")}<h3 style="margin-top:14px">${esc(d.label)}</h3><p class="score" style="margin:4px 0 8px">${r.score}% <small class="muted">match</small></p>
        <p class="small muted">${money(d.data.market.salary_median)} median · ${num(d.data.market.postings)} postings</p>
        <h4 style="margin:14px 0 8px">Tools</h4><div class="chips">${r.tech.slice(0, 6).map(s => `<span class="chip ${s.have ? "have" : "gap"}">${esc(s.name)}</span>`).join("")}</div>
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap"><a class="btn btn-sm" href="../recommendation.html?career=${d.data.id}">Details</a><a class="btn btn-sm btn-route" href="../roadmap.html?career=${d.data.id}">Roadmap</a></div>`;
      const ph = $(".photo", box); ph.style.height = "150px"; ph.style.borderRadius = "14px";
    } else if (d.type === "course") {
      box.innerHTML = `<span class="chip sky">Course</span><h3 style="margin-top:10px">${esc(d.data.title)}</h3><p class="small muted" style="margin-top:6px">${esc(d.data.org)} · ${esc(d.data.level)} · ★ ${d.data.rating} · ${num(d.data.enrolled)} learners</p>
        <a class="btn btn-sm" style="margin-top:14px" href="${esc(d.data.url)}" target="_blank" rel="noopener">Find on Coursera</a>`;
    } else if (d.type === "you") {
      box.innerHTML = `<h3>${esc(d.label)}</h3><p class="small muted" style="margin-top:6px">${profile.skills.length} skills on your profile. Teal lines connect you to the tools you already have.</p>
        <div class="chips" style="margin-top:12px">${profile.skills.slice(0, 18).map(s => `<span class="chip have">${esc(s)}</span>`).join("")}</div>`;
    } else {
      const careers = connected.filter(n => n.type === "career");
      const cs = db.skill_courses[d.label] || [];
      box.innerHTML = `<span class="chip ${d.type === "have" ? "have" : d.type === "gap" ? "gap" : ""}">${d.type === "have" ? "You have this" : d.type === "gap" ? "Skill to learn" : "Core skill"}</span>
        <h3 style="margin-top:10px">${esc(d.label)}</h3><p class="small muted" style="margin-top:6px">Needed by ${careers.length} of the careers shown:</p>
        <div class="chips" style="margin-top:8px">${careers.map(n => `<span class="chip route">${esc(n.label)}</span>`).join("")}</div>
        ${cs.length ? `<h4 style="margin:14px 0 4px">Learn it</h4>${cs.slice(0, 3).map(k => `<a class="course" href="${esc(k.url)}" target="_blank" rel="noopener"><div><h4>${esc(k.title)}</h4><div class="meta">${esc(k.org)}</div></div><span class="stars">★ ${k.rating}</span></a>`).join("")}` : ""}`;
    }
  }

  $("#gCount").addEventListener("input", e => { state.count = +e.target.value; $("#gCountOut").textContent = e.target.value; build(); });
  $("#gCourses").addEventListener("change", e => { state.courses = e.target.checked; build(); });
  $("#gCore").addEventListener("change", e => { state.core = e.target.checked; build(); });
  addEventListener("resize", () => { clearTimeout(build._t); build._t = setTimeout(build, 250); });
  build(); info(null);
};

/* ------------------------------------------------------------ boot */
const boot = { index: Pages.index, login: Pages.login, dashboard: Pages.dashboard, recommendation: Pages.recommendation, roadmap: Pages.roadmap, graph: Pages.graph };
if (boot[PAGE]) boot[PAGE]();

// expose for debugging / the backend docs
window.Waypoint = { Data, Store, evaluate, rank, buildRoadmap, extractFromText };
})();
