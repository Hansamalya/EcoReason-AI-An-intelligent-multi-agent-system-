# Waypoint — Career Recommendation System

Career matching built on three real datasets:
- **O*NET 31.0** – skills, knowledge, tasks, education and RIASEC interests for 1,016 occupations
- **LinkedIn job postings 2024** – 123,849 postings → salaries, remote share, employers, tool demand
- **Coursera catalog** – 891 courses matched to careers and to individual missing skills

## Run it
```bash
pip install flask pypdf python-docx
python backend/app.py
# open http://localhost:5000
```
Pages need a local server (browsers block `fetch()` of files opened from disk).
`python -m http.server` in this folder also works for the front end alone.

## Pages
| Page | What it does |
|---|---|
| `index.html` | Landing page |
| `login.html` | Sign in / create account / guest (stored in the browser) |
| `dashboard.html` | Profile, interest sliders, skill picker, résumé upload (PDF/DOCX/TXT), market analytics |
| `recommendation.html` | Ranked careers, skill-gap bars, courses per missing skill, real job postings |
| `roadmap.html` | 4-stage week-by-week plan with saved progress |
| `graphs/knowledge_graph.html` | D3 graph: you → careers → skills → courses |

## Matching
`score = 0.45·tool coverage + 0.20·core-skill coverage + 0.27·interest fit + 0.08·education fit`
Tool importance is weighted by how often each tool appears in real postings for that role.
Interest fit is the correlation between your RIASEC sliders and O*NET's profile for the role.
Same logic in `js/app.js` (browser) and `backend/recommendation_engine.py` (API).

## API (backend/app.py)
`GET /api/careers` · `GET /api/careers/<id>` · `POST /api/recommend` · `POST /api/skill-gap`
`POST /api/roadmap` · `GET /api/jobs?career=<id>` · `POST /api/resume` (multipart `file`)

## Rebuilding the data
Put the raw files in `raw/` (`db_31_0_excel/`, `postings.csv`, `coursea_data.csv`) and run
`python backend/build_data.py --raw raw` (needs pandas + openpyxl). Takes ~2 minutes.

## Credits
O*NET 31.0 (CC BY 4.0, U.S. DOL/ETA) · Photos from Unsplash · Charts: Chart.js · Graph: D3
