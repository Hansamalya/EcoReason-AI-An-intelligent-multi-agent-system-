"""
import warnings; warnings.filterwarnings("ignore")
build_data.py — turns the three raw datasets into the files in /data.

Inputs (put them in ./raw next to this project, or pass --raw):
  raw/db_31_0_excel/*.xlsx      O*NET 31.0 database (occupations, skills, tech, tasks)
  raw/postings.csv              LinkedIn job postings 2024 (~124k rows)
  raw/coursea_data.csv          Coursera course catalog (891 courses)

Outputs:
  data/jobs.csv                 sample of real postings matched to each career
  data/skills.csv               every career x skill with importance + market demand
  data/recommendations.json     everything the website needs in one file

Run:  python backend/build_data.py --raw ./raw
"""
import argparse, json, math, re
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# Career catalog: O*NET code, how we find it in the LinkedIn titles,
# how we find relevant Coursera courses, and a real photo (Unsplash).
# ---------------------------------------------------------------------------
U = "https://images.unsplash.com/photo-{}?auto=format&fit=crop&w=900&q=70"
CAREERS = [
 dict(id="software-developer", name="Software Developer", code="15-1252.00", cat="Technology",
      title=r"software (engineer|developer)|back[- ]?end (engineer|developer)|full[- ]?stack",
      kw=["programming", "software", "java", "python", "algorithms", "data structures", "git", "cloud"],
      img="1498050108023-c5249f4df085"),
 dict(id="data-scientist", name="Data Scientist", code="15-2051.00", cat="Data & AI",
      title=r"data scien|machine learning|\bml engineer|ai engineer",
      kw=["data science", "machine learning", "deep learning", "python", "statistics", "neural", "tensorflow"],
      img="1551288049-bebda4e38f71"),
 dict(id="bi-analyst", name="Data & BI Analyst", code="15-2051.01", cat="Data & AI",
      title=r"business intelligence|\bbi (analyst|developer)|data analyst",
      kw=["data analysis", "excel", "sql", "tableau", "visualization", "analytics", "power bi"],
      img="1460925895917-afdab827c52f"),
 dict(id="web-developer", name="Web Developer", code="15-1254.00", cat="Technology",
      title=r"web developer|front[- ]?end (engineer|developer)|react developer|wordpress developer",
      kw=["web", "html", "javascript", "react", "front-end", "responsive", "full-stack"],
      img="1461749280684-dccba630e2f6"),
 dict(id="security-analyst", name="Cybersecurity Analyst", code="15-1212.00", cat="Technology",
      title=r"security (analyst|engineer)|cyber ?security|soc analyst|penetration",
      kw=["security","cyber*","cryptography","hacking","sscp","privacy","it support"],
      img="1550751827-4bd374c3f58b"),
 dict(id="ux-designer", name="UX / UI Designer", code="15-1255.00", cat="Design",
      title=r"\bux\b|\bui\b.*designer|user experience|product designer|interaction designer",
      kw=["ux","user experience","ui","design thinking","interaction design","prototyp*","usability","user interface"],
      img="1561070791-2526d30994b5"),
 dict(id="cloud-network-architect", name="Cloud & Network Architect", code="15-1241.00", cat="Technology",
      title=r"network (architect|engineer)|cloud (architect|engineer)|solutions architect",
      kw=["cloud","aws","google cloud","azure","networking","devops","kubernetes","architecting"],
      img="1558494949-ef010cbdcc31"),
 dict(id="database-admin", name="Database Administrator", code="15-1242.00", cat="Technology",
      title=r"database (admin|engineer|developer)|\bdba\b|data engineer",
      kw=["database", "sql", "data engineering", "big data", "spark", "data warehouse", "etl"],
      img="1544197150-b99a580bb7a8"),
 dict(id="qa-engineer", name="QA & Test Engineer", code="15-1253.00", cat="Technology",
      title=r"\bqa\b|quality assurance (analyst|engineer|tester)|test (engineer|automation)|\bsdet\b",
      kw=["testing", "software testing", "quality", "automation", "agile", "java", "devops"],
      img="1517694712202-14dd9538aa97"),
 dict(id="it-manager", name="IT Manager", code="11-3021.00", cat="Technology",
      title=r"\bit manager|it director|director of (it|information technology)|information technology manager",
      kw=["it", "leadership", "management", "cloud", "project management", "security", "strategy"],
      img="1519389950473-47ba0277781c"),
 dict(id="research-scientist", name="AI Research Scientist", code="15-1221.00", cat="Data & AI",
      title=r"research scientist|applied scientist|research engineer",
      kw=["machine learning", "deep learning", "neural", "algorithms", "reinforcement", "ai", "probabilistic"],
      img="1485827404703-89b55fcc595e"),
 dict(id="statistician", name="Statistician", code="15-2041.00", cat="Data & AI",
      title=r"statistician|biostatistic",
      kw=["statistics", "statistical", "regression", "probability", "r programming", "bayesian", "inference"],
      img="1504868584819-f8e8b4b6d7e3"),
 dict(id="operations-research", name="Operations Research Analyst", code="15-2031.00", cat="Data & AI",
      title=r"operations research|supply chain analyst|operations analyst",
      kw=["supply chain","operations","operations research","excel","decision","business analytics","modeling"],
      img="1507925921958-8a62f3d1a50d"),
 dict(id="blockchain-engineer", name="Blockchain Engineer", code="15-1299.07", cat="Technology",
      title=r"blockchain|web3|solidity|smart contract",
      kw=["blockchain", "bitcoin", "cryptocurrency", "crypto", "fintech", "cryptography", "decentralized"],
      img="1639762681485-074b7f938ba0"),
 dict(id="game-designer", name="Video Game Designer", code="15-1255.01", cat="Design",
      title=r"game (designer|developer|programmer)|level designer|unity developer",
      kw=["game", "unity", "3d", "c#", "interactive", "virtual reality", "storytelling"],
      img="1511512578047-dfb367046420"),
 dict(id="graphic-designer", name="Graphic Designer", code="27-1024.00", cat="Design",
      title=r"graphic designer|visual designer|brand designer",
      kw=["graphic design","design","typography","photoshop","brand*","illustrat*","visual"],
      img="1626785774573-4b799315345d"),
 dict(id="video-editor", name="Film & Video Editor", code="27-4032.00", cat="Media",
      title=r"video editor|film editor|post[- ]production|motion graphics",
      kw=["film", "video", "storytelling", "photography", "music production", "media", "animation"],
      img="1574717024653-61fd2cf4d44d"),
 dict(id="technical-writer", name="Technical Writer", code="27-3042.00", cat="Media",
      title=r"technical writer|documentation specialist|content developer",
      kw=["writing","writer","grammar","editing","technical writing","english","communication"],
      img="1455390582262-044cdead277a"),
 dict(id="project-manager", name="Project Manager", code="13-1082.00", cat="Business",
      title=r"project manager|program manager|scrum master",
      kw=["project management", "agile", "scrum", "leadership", "planning", "pmp", "management"],
      img="1552664730-d307ca884978"),
 dict(id="management-consultant", name="Management Consultant", code="13-1111.00", cat="Business",
      title=r"management (consultant|analyst)|strategy (consultant|analyst)|business analyst",
      kw=["strategy", "business", "consulting", "management", "leadership", "negotiation", "analytics"],
      img="1542744173-8e7e53415bb0"),
 dict(id="financial-analyst", name="Financial Analyst", code="13-2051.00", cat="Finance",
      title=r"financial analyst|investment analyst|fp&a|equity research",
      kw=["finance", "financial", "investment", "valuation", "excel", "accounting", "markets"],
      img="1611974789855-9c2a0a7236a3"),
 dict(id="accountant", name="Accountant & Auditor", code="13-2011.00", cat="Finance",
      title=r"\baccountant|auditor|staff accountant|tax (associate|accountant)",
      kw=["accounting","tax","audit*","bookkeeping","financial accounting","excel","finance"],
      img="1554224155-6726b3ff858f"),
 dict(id="actuary", name="Actuary", code="15-2011.00", cat="Finance",
      title=r"actuar",
      kw=["risk","probability","statistics","insurance","actuarial","calculus","econometrics"],
      img="1590283603385-17ffb3a7f29f"),
 dict(id="marketing-specialist", name="Marketing Specialist", code="13-1161.00", cat="Business",
      title=r"marketing (specialist|coordinator|analyst)|market research",
      kw=["marketing", "digital marketing", "social media", "brand", "consumer", "content", "analytics"],
      img="1432888498266-38ffec3eaf0a"),
 dict(id="seo-strategist", name="SEO & Search Strategist", code="13-1161.01", cat="Business",
      title=r"\bseo\b|\bsem\b|search engine|\bppc\b|paid search|paid media",
      kw=["seo","search engine","digital marketing","content marketing","social media","marketing analytics"],
      img="1571677208775-50b3bd2e5f96"),
 dict(id="marketing-manager", name="Marketing Manager", code="11-2021.00", cat="Business",
      title=r"marketing manager|head of marketing|marketing director|brand manager",
      kw=["marketing","brand*","digital marketing","marketing strategy","social media","consumer","leadership"],
      img="1553877522-43269d4ea984"),
 dict(id="hr-specialist", name="HR Specialist", code="13-1071.00", cat="Business",
      title=r"human resources (specialist|generalist|coordinator)|\bhr (generalist|specialist|coordinator)|recruiter|talent acquisition",
      kw=["human resources", "hr", "people", "recruit", "leadership", "negotiation", "psychology"],
      img="1600880292203-757bb62b4baf"),
 dict(id="registered-nurse", name="Registered Nurse", code="29-1141.00", cat="Healthcare",
      title=r"registered nurse|\brn\b|nurse (manager|educator)",
      kw=["health","medical","nursing","patient*","anatomy","clinical","healthcare","medicine","covid*"],
      img="1576091160399-112ba8d25d1d"),
 dict(id="mechanical-engineer", name="Mechanical Engineer", code="17-2141.00", cat="Engineering",
      title=r"mechanical engineer|mechanical design engineer",
      kw=["mechanical","mechanics","cad","thermodynamics","manufacturing","matlab","materials"],
      img="1581091226825-a6a2a5aee158"),
 dict(id="civil-engineer", name="Civil Engineer", code="17-2051.00", cat="Engineering",
      title=r"civil engineer|structural engineer|transportation engineer",
      kw=["civil","construction","structural","infrastructure","gis","sustainab*","geospatial","cities"],
      img="1541888946425-d81bb19240f5"),
 dict(id="electrical-engineer", name="Electrical Engineer", code="17-2071.00", cat="Engineering",
      title=r"electrical engineer|electronics engineer|hardware engineer",
      kw=["electrical","electronics","circuit*","embedded","arduino","semiconductor*","internet of things","iot","raspberry"],
      img="1518770660439-4636190af475"),
 dict(id="robotics-engineer", name="Robotics Engineer", code="17-2199.08", cat="Engineering",
      title=r"robotics|automation engineer|controls engineer",
      kw=["robotics","robot*","control","automation","self-driving","embedded","mechanics"],
      img="1581092160562-40aa08e78837"),
]

# Friendly display names for noisy O*NET tech names
NAME_FIX = {
 "Amazon Web Services AWS software": "AWS", "Microsoft Azure software": "Azure", "Google Cloud software": "Google Cloud",
 "Microsoft Power BI": "Power BI", "Microsoft Excel": "Excel", "Microsoft SQL Server": "SQL Server",
 "Oracle Java": "Java", "The MathWorks MATLAB": "MATLAB", "Dassault Systemes SolidWorks": "SolidWorks",
 "Autodesk AutoCAD": "AutoCAD", "Autodesk AutoCAD Civil 3D": "Civil 3D", "Autodesk Revit": "Revit",
 "Adobe Photoshop": "Photoshop", "Adobe Illustrator": "Illustrator", "Adobe InDesign": "InDesign",
 "Adobe After Effects": "After Effects", "Adobe Premiere Pro": "Premiere Pro", "Adobe Creative Cloud software": "Adobe Creative Cloud",
 "Atlassian JIRA": "Jira", "Atlassian Confluence": "Confluence", "Apache Spark": "Spark", "Apache Kafka": "Kafka",
 "Apache Hadoop": "Hadoop", "Apache Airflow": "Airflow", "Salesforce software": "Salesforce", "SAP software": "SAP",
 "Workday software": "Workday", "HubSpot software": "HubSpot", "Intuit QuickBooks": "QuickBooks", "Epic Systems": "Epic EHR",
 "IBM SPSS Statistics": "SPSS", "Google Analytics": "Google Analytics", "Microsoft PowerPoint": "PowerPoint",
 "Microsoft Project": "MS Project", "Microsoft Visio": "Visio", "Microsoft Word": "MS Word", "Microsoft Access": "MS Access",
 "Microsoft Office software": "MS Office", "Microsoft Outlook": "Outlook", "Microsoft SharePoint": "SharePoint",
 "Microsoft Visual Basic for Applications VBA": "VBA", "Google Angular": "Angular", "Google Android": "Android",
 "Apple iOS": "iOS", "Unity Technologies Unity": "Unity", "Epic Games Unreal Engine": "Unreal Engine",
 "Amazon Elastic Compute Cloud EC2": "AWS EC2", "Amazon Redshift": "Redshift", "Microsoft .NET Framework": ".NET",
 "Microsoft Dynamics": "MS Dynamics", "Oracle Database": "Oracle DB", "Microsoft Teams": "MS Teams",
 "ESRI ArcGIS software": "ArcGIS", "Google Looker Analytics": "Looker", "Marketo Marketing Automation": "Marketo",
 "Trimble SketchUp Pro": "SketchUp", "Bentley MicroStation": "MicroStation", "Snowflake": "Snowflake",
 "Ansible software": "Ansible", "Alteryx software": "Alteryx", "Red Hat Enterprise Linux": "RHEL",
 "Node.js": "Node.js", "React": "React", "Facebook": "Facebook Ads", "Wireshark": "Wireshark", "Splunk Enterprise": "Splunk",
}
# Regexes for names that are ambiguous as plain words
SPECIAL = {
 "R": r"(?<![\w-])R(?=[,/)]| programming| language| studio)", "C": r"(?<![\w#+-])C(?=[,/)]| programming| language)",
 "Go": r"\bGolang\b|(?<![\w-])Go(?=[,/)]| programming| language)", "MS Word": r"\bMS Word\b|\bMicrosoft Word\b",
 "MS Access": r"\bMS Access\b|\bMicrosoft Access\b", "MS Project": r"\bMS Project\b|\bMicrosoft Project\b",
 "MS Office": r"\bMS Office\b|\bMicrosoft Office\b|\bOffice 365\b|\bMicrosoft 365\b", "Chef": r"\bChef (?:Infra|automation)\b|, Chef\b",
 "Swift": r"\bSwift(?:UI)?\b(?! Transportation)", "Excel": r"\bExcel\b", "AWS": r"\bAWS\b|Amazon Web Services",
 "Azure": r"\bAzure\b", "SQL": r"\bSQL\b", "Epic EHR": r"\bEpic\b(?: Systems| EHR| EMR)?", "Java": r"\bJava\b(?!Script)",
 "Facebook Ads": r"\bFacebook Ads\b|\bMeta Ads\b",
}

# O*NET examples that are too generic to count as a learnable tool
GENERIC = {"Cloud","COM","Reporting","Reports","Database","Statistical","BASIC","Google","Analytics","Email","Tax",
           "Testing","Pricing","LinkedIn","Optimization","Simulation","Debugging","Deployment","Mathematical",
           "Windows","Exchange","Instagram","Facebook","BI","Business intelligence","Spreadsheet","Word processing",
           "Scheduling","Data entry","Presentation","Graphics","Internet","Web browser","Calendar","Accounting",
           "Inventory","Payroll","Works","Assessment","Job posting","Billing","YouTube","Budgeting","Compliance","Document management","Project management"}

def display_name(raw):
    if raw in NAME_FIX: return NAME_FIX[raw]
    s = re.sub(r"\s+software$", "", raw).strip()
    parts = s.split()
    if len(parts) > 1:
        acr = parts[-1]
        if re.fullmatch(r"[A-Z]{2,6}", acr):
            words = parts[:-1][-len(acr):]
            if len(words) == len(acr) and "".join(w[0] for w in words).upper() == acr:
                return acr
    for v in ("Microsoft ", "Apache ", "Oracle ", "Atlassian ", "Adobe "):
        if s.startswith(v) and len(s) - len(v) > 3: return s[len(v):]
    return s

def term_regex(name):
    if name in SPECIAL: return re.compile(SPECIAL[name])
    return re.compile(r"(?<![\w])" + re.escape(name) + r"(?![\w])", re.I)

def enrolled(v):
    v = str(v).lower().strip()
    m = 1000 if v.endswith("k") else 1_000_000 if v.endswith("m") else 1
    try: return int(float(v.rstrip("km")) * m)
    except ValueError: return 0

EDU = {1:"Less than high school",2:"High school diploma",3:"Post-secondary certificate",4:"Some college",
       5:"Associate's degree",6:"Bachelor's degree",7:"Post-baccalaureate certificate",8:"Master's degree",
       9:"Post-master's certificate",10:"First professional degree",11:"Doctoral degree",12:"Post-doctoral training"}
ZONE = {1:"Little or no preparation",2:"Some preparation",3:"Medium preparation",4:"Considerable preparation",5:"Extensive preparation"}

def main(raw: Path):
    on = raw / "db_31_0_excel"
    X = lambda f: pd.read_excel(on / f"{f}.xlsx")
    codes = [c["code"] for c in CAREERS]
    print("Loading O*NET …")
    occ   = X("Occupation Data").set_index("O*NET-SOC Code")
    tech  = X("Software Skills");  tech = tech[tech["O*NET-SOC Code"].isin(codes)]
    ess   = X("Essential Skills"); trn = X("Transferable Skills")
    know  = X("Knowledge"); zones = X("Job Zones").set_index("O*NET-SOC Code")
    ints  = X("Career Interest Types"); rel = X("Related Occupations"); tasks = X("Task Statements")
    edu   = X("Education")

    print("Loading postings …")
    P = pd.read_csv(raw / "postings.csv", usecols=["job_id","company_name","title","description","skills_desc",
        "normalized_salary","location","formatted_work_type","formatted_experience_level","remote_allowed",
        "job_posting_url","listed_time","views","applies"])
    P["text"] = (P["title"].fillna("") + " \n " + P["description"].fillna("") + " \n " + P["skills_desc"].fillna(""))
    P.loc[~P.normalized_salary.between(15_000, 600_000), "normalized_salary"] = None

    C = pd.read_csv(raw / "coursea_data.csv").drop(columns=["Unnamed: 0"], errors="ignore")
    C["enrolled"] = C.course_students_enrolled.map(enrolled)
    C["score"] = C.course_rating * C.enrolled.map(lambda e: math.log10(e + 10))
    C = C.sort_values("score", ascending=False)
    def course_rec(r):
        return dict(title=r.course_title.strip(), org=r.course_organization, type=r.course_Certificate_type.title(),
                    rating=float(r.course_rating), level=r.course_difficulty, enrolled=int(r.enrolled),
                    url="https://www.coursera.org/search?query=" + re.sub(r"\s+", "+", r.course_title.strip()))
    def find_courses(words, n):
        # whole-word match by default; a trailing * means prefix match ("illustrat*")
        pats = [re.compile(r"\b" + re.escape(w.rstrip("*").strip()) + ("" if w.endswith("*") else r"\b"), re.I) for w in words]
        hits = C.course_title.map(lambda t: sum(1 for p in pats if p.search(t)))
        pick = C.assign(hits=hits)[hits > 0].sort_values(["hits", "score"], ascending=False)
        return [course_rec(r) for r in pick.head(n).itertuples()]

    careers_out, skill_rows, job_rows = [], [], []
    tech_vocab = {}
    for c in CAREERS:
        code = c["code"]; print("  ·", c["name"])
        sub = P[P.title.str.contains(c["title"], case=False, regex=True, na=False)]
        docs = sub.text.head(5000).tolist()
        n = max(len(docs), 1)

        # --- technical skills: O*NET tech list ranked by real posting demand
        t = tech[tech["O*NET-SOC Code"] == code].drop_duplicates("Workplace Example")
        techs = []
        for r in t.itertuples():
            name = display_name(r._3)
            rx = term_regex(name)
            hits = sum(1 for d in docs if rx.search(d))
            techs.append(dict(name=name, demand=round(100 * hits / n, 1), hot=r._6 == "Y", in_demand=r._7 == "Y",
                              group=r._5))
        techs = [x for x in techs if (x["demand"] > 0 or x["in_demand"]) and x["name"] not in GENERIC]
        seen, uniq = set(), []
        for x in sorted(techs, key=lambda x: (-x["demand"], -x["in_demand"])):
            if x["name"] not in seen: seen.add(x["name"]); uniq.append(x)
        techs = uniq[:14]
        top = max((x["demand"] for x in techs), default=1) or 1
        for x in techs:
            x["importance"] = round(35 + 65 * x["demand"] / top + (8 if x["in_demand"] else 0))
            x["importance"] = min(x["importance"], 100)
            tech_vocab.setdefault(x["name"], set()).add(c["id"])

        # --- core skills & knowledge (O*NET importance 1-5 → 0-100, level 0-7 → 0-100)
        def ranked(df, k):
            d = df[df["O*NET-SOC Code"] == code]
            im = d[d["Scale ID"] == "IM"].set_index("Element Name")["Data Value"]
            lv = d[d["Scale ID"] == "LV"].set_index("Element Name")["Data Value"]
            out = []
            for name, v in im.sort_values(ascending=False).head(k).items():
                out.append(dict(name=name, importance=round((v - 1) / 4 * 100), level=round(lv.get(name, 0) / 7 * 100)))
            return out
        core = ranked(pd.concat([ess, trn]), 8)
        knowledge = ranked(know, 6)

        # --- interests (RIASEC), education, zone, tasks, related
        it = ints[(ints["O*NET-SOC Code"] == code)].set_index("Element Name")["Data Value"]
        riasec = {k: round(float(it.get(k, 0)), 2) for k in ["Realistic","Investigative","Artistic","Social","Enterprising","Conventional"]}
        e = edu[(edu["O*NET-SOC Code"] == code) & (edu["Scale ID"] == "RL")]
        edu_lbl = EDU.get(int(e.sort_values("Data Value").iloc[-1]["Category"]), "") if len(e) else ""
        z = int(zones.loc[code, "Job Zone"]) if code in zones.index else 4
        if not edu_lbl:  # O*NET has no survey data for a few new occupations → infer from job zone
            edu_lbl = {3: "Associate's degree", 4: "Bachelor's degree", 5: "Master's degree"}.get(z, "High school diploma")
        tk = tasks[(tasks["O*NET-SOC Code"] == code) & (tasks["Task Type"] == "Core")].sort_values("Incumbents Responding", ascending=False)
        rl = rel[rel["O*NET-SOC Code"] == code].sort_values("Index")
        related = [x for x in rl["Related Title"].tolist()][:6]

        # --- market stats from postings
        sal = sub.normalized_salary.dropna()
        exp = sub.formatted_experience_level.value_counts()
        loc = sub.location.value_counts().head(5)
        comp = sub.company_name.value_counts().head(5)
        market = dict(postings=int(len(sub)),
                      salary_median=int(sal.median()) if len(sal) else None,
                      salary_p25=int(sal.quantile(.25)) if len(sal) else None,
                      salary_p75=int(sal.quantile(.75)) if len(sal) else None,
                      remote_pct=round(100 * sub.remote_allowed.fillna(0).astype(bool).mean(), 1) if len(sub) else 0,
                      experience={k: int(v) for k, v in exp.items()},
                      top_locations=[dict(name=k, count=int(v)) for k, v in loc.items()],
                      top_companies=[dict(name=k, count=int(v)) for k, v in comp.items()],
                      avg_applies=round(float(sub.applies.dropna().mean()), 1) if sub.applies.notna().any() else None)

        # --- job samples (prefer ones with salary)
        js = sub.assign(has=sub.normalized_salary.notna()).sort_values(["has", "views"], ascending=False).head(40)
        for r in js.itertuples():
            matched = [x["name"] for x in techs if term_regex(x["name"]).search(r.text)][:6]
            job_rows.append(dict(job_id=r.job_id, career_id=c["id"], title=r.title, company=r.company_name,
                                 location=r.location, salary=int(r.normalized_salary) if pd.notna(r.normalized_salary) else "",
                                 work_type=r.formatted_work_type, experience=r.formatted_experience_level or "",
                                 remote=int(bool(r.remote_allowed == 1)), url=r.job_posting_url, skills="|".join(matched)))

        courses = find_courses(c["kw"], 12)
        for x in techs:
            skill_rows.append(dict(career_id=c["id"], career=c["name"], skill=x["name"], type="technical",
                                   importance=x["importance"], demand_pct=x["demand"], hot=int(x["hot"]), in_demand=int(x["in_demand"])))
        for x in core:
            skill_rows.append(dict(career_id=c["id"], career=c["name"], skill=x["name"], type="core",
                                   importance=x["importance"], demand_pct="", hot=0, in_demand=0))
        for x in knowledge:
            skill_rows.append(dict(career_id=c["id"], career=c["name"], skill=x["name"], type="knowledge",
                                   importance=x["importance"], demand_pct="", hot=0, in_demand=0))

        careers_out.append(dict(id=c["id"], name=c["name"], onet_code=code, onet_title=occ.loc[code, "Title"],
            category=c["cat"], description=occ.loc[code, "Description"], image=U.format(c["img"]),
            job_zone=z, job_zone_label=ZONE[z], education=edu_lbl, riasec=riasec,
            tasks=tk.Task.head(6).tolist(), related=related, technical=techs, core=core, knowledge=knowledge,
            market=market, courses=courses))

    # --- skill → course map for gap filling
    skill_courses = {}
    for s in sorted(tech_vocab):
        words = [s] if len(s) > 2 else []
        extra = {"Excel": ["excel", "spreadsheet"], "SQL": ["sql", "database"], "AWS": ["aws", "cloud"],
                 "Azure": ["azure", "cloud"], "Google Cloud": ["google cloud", "gcp"], "Python": ["python"],
                 "R": ["r programming", "data analysis with r", " in r"], "Tableau": ["tableau", "visualization"],
                 "Power BI": ["power bi", "visualization"], "Photoshop": ["photoshop", "graphic design"],
                 "Git": ["git", "version control"], "Jira": ["agile", "scrum"], "Java": ["java"],
                 "JavaScript": ["javascript", "web"], "HTML": ["html", "web"], "CSS": ["css", "web"],
                 "React": ["react", "front-end"], "MATLAB": ["matlab"], "Spark": ["spark", "big data"],
                 "Hadoop": ["hadoop", "big data"], "Linux": ["linux", "operating system"],
                 "Docker": ["docker", "container", "devops"], "Kubernetes": ["kubernetes", "container"],
                 "TensorFlow": ["tensorflow", "deep learning"], "PyTorch": ["pytorch", "deep learning"],
                 "AutoCAD": ["autocad", "cad"], "SolidWorks": ["cad", "3d"], "Salesforce": ["salesforce", "crm"],
                 "Google Analytics": ["google analytics", "digital marketing"], "Unity": ["unity", "game"]}.get(s, [])
        found = find_courses(list({*words, *extra}), 4) if (words or extra) else []
        if found: skill_courses[s] = found

    # --- global analytics
    all_matched = pd.concat([P[P.title.str.contains(c["title"], case=False, regex=True, na=False)].assign(cid=c["id"]) for c in CAREERS])
    overall_sal = all_matched.normalized_salary.dropna()
    tech_counter = {}
    for c in careers_out:
        for x in c["technical"]:
            tech_counter[x["name"]] = tech_counter.get(x["name"], 0) + x["demand"] * c["market"]["postings"] / 100
    top_skills = sorted(tech_counter.items(), key=lambda kv: -kv[1])[:15]
    analytics = dict(
        total_postings=int(len(P)), matched_postings=int(len(all_matched)),
        onet_occupations=int(len(occ)), courses=int(len(C)),
        salary_median=int(overall_sal.median()),
        remote_pct=round(100 * all_matched.remote_allowed.fillna(0).astype(bool).mean(), 1),
        date_range=[str(pd.to_datetime(P.listed_time.min(), unit="ms").date()), str(pd.to_datetime(P.listed_time.max(), unit="ms").date())],
        experience={k: int(v) for k, v in all_matched.formatted_experience_level.value_counts().items()},
        top_skills=[dict(name=k, postings=int(v)) for k, v in top_skills],
        course_levels={k: int(v) for k, v in C.course_difficulty.value_counts().items()},
        top_orgs=[dict(name=k, count=int(v)) for k, v in C.course_organization.value_counts().head(8).items()],
    )
    # soft/core skill vocabulary for the profile picker
    core_vocab = sorted({x["name"] for c in careers_out for x in c["core"]})
    out = dict(generated="O*NET 31.0 · LinkedIn postings 2024 · Coursera catalog", analytics=analytics,
               careers=careers_out, skill_vocab=dict(technical=sorted(tech_vocab), core=core_vocab),
               skill_courses=skill_courses)

    d = ROOT / "data"; d.mkdir(exist_ok=True)
    (d / "recommendations.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    pd.DataFrame(skill_rows).to_csv(d / "skills.csv", index=False)
    pd.DataFrame(job_rows).to_csv(d / "jobs.csv", index=False)
    print(f"Done: {len(careers_out)} careers, {len(skill_rows)} skill rows, {len(job_rows)} jobs")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--raw", default=str(ROOT / "raw"))
    main(Path(ap.parse_args().raw))
