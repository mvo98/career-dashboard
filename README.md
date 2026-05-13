# Career Intelligence Dashboard

**AI-powered job search automation built with Python, React, and Gemini API**

[**Live Demo →**](https://career-dashboard-nu.vercel.app)

> Note: Live demo is password-protected (personal tool). Clone locally and add your own API keys to explore.

---

## What It Does

The Career Intelligence Dashboard replaces manual job searching with an automated pipeline: it discovers roles across multiple job boards, scores each one against a custom 5-dimension AI rubric, generates tailored resume summaries and cover letters on demand, and tracks every application in Airtable. Built to automate my own job search — and as a practical demonstration of full-stack AI integration from API design through production deployment.

---

## Features

- **Multi-source job discovery** — fans out async searches across Adzuna, Remotive, and RemoteOK simultaneously, with salary filtering, flag detection, and deduplication
- **AI fit scoring** — Gemini 2.5 Flash evaluates each role across five weighted dimensions (skill fit, compensation, strategic fit, domain fit, level fit) using a custom rubric with hard-skip conditions
- **Materials generation** — produces a tailored 3-sentence resume summary and 3-paragraph cover letter per role, grounded in the candidate's actual work history rather than JD paraphrasing
- **Application tracking** — full pipeline dashboard backed by Airtable: Pending → Applied → Responded → Scheduled → Interviewing → Offer, with context-aware action buttons and timestamped notes
- **JWT authentication** — password-protected single-user access with 30-day tokens, no third-party auth dependency
- **Smart pre-filtering** — skip rules for compensation floors, onsite location penalties, role tier classification, and red flag detection run before any AI call

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 6, deployed on Vercel |
| Backend | Python 3, FastAPI, deployed on Railway |
| AI | Google Gemini 2.5 Flash (`gemini-2.5-flash`) |
| Storage | Airtable REST API |
| Job data | Adzuna API, Remotive API, RemoteOK API |
| Auth | JWT via `python-jose`, password against `APP_SECRET` |
| CI/CD | GitHub — Vercel auto-deploys on push to `main` |

---

## Architecture

```
Browser
  │
  ▼
Vercel (React + Vite)
  │  /api/* → VITE_API_URL
  ▼
Railway (FastAPI)
  ├── JWT middleware (all routes)
  ├── POST /api/evaluate          → Gemini 2.5 Flash (fit scoring)
  ├── POST /api/materials/generate → Gemini 2.5 Flash (resume + cover letter)
  ├── POST /api/jobs/search       → Adzuna + Remotive + RemoteOK (parallel)
  └── /api/airtable/*             → Airtable REST API (tracking)
```

The Vite dev server proxies `/api/*` to `http://localhost:8000` in development. In production, `VITE_API_URL` points the frontend directly at the Railway backend.

---

## Local Development

### Prerequisites

- Python 3.9+
- Node.js 18+
- API keys for Gemini, Adzuna, and Airtable (see [Environment Variables](#environment-variables))

### Setup

```bash
git clone https://github.com/mvo98/career-dashboard.git
cd career-dashboard

# Create .env at repo root (see Environment Variables section below)
```

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Run from repo root
source backend/.venv/bin/activate
PYTHONPATH=backend uvicorn backend.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # starts at http://localhost:5173
```

Both servers must be running. The Vite dev server proxies `/api/*` to `localhost:8000` automatically — no CORS configuration needed in development.

---

## Environment Variables

Create a `.env` file at the repo root.

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio API key for Gemini 2.5 Flash |
| `ADZUNA_APP_ID` | Adzuna API application ID |
| `ADZUNA_APP_KEY` | Adzuna API key |
| `AIRTABLE_TOKEN` | Airtable personal access token |
| `AIRTABLE_BASE_ID` | ID of the Airtable base used for tracking (`appXXXXXXXXXXXXXX`) |
| `AIRTABLE_TABLE_ID` | ID of the Applications table within that base (`tblXXXXXXXXXXXXXX`) |
| `APP_SECRET` | Login password + JWT signing secret (use a long random string) |

For Vercel deployment, also set:

| Variable | Description |
|---|---|
| `VITE_API_URL` | Full URL of the Railway backend, e.g. `https://your-api.railway.app` |

The backend reads `.env` via `python-dotenv`. The frontend reads `VITE_*` variables at build time via Vite's `import.meta.env`.

---

## Project Structure

```
career-dashboard/
├── backend/
│   ├── main.py                   # FastAPI app, JWT middleware, router registration
│   ├── routers/
│   │   ├── auth.py               # POST /api/auth — login and JWT issuance
│   │   ├── job_fit.py            # POST /api/evaluate — AI fit scoring
│   │   ├── job_search.py         # POST /api/jobs/search — multi-source discovery
│   │   ├── airtable.py           # /api/airtable/* — application tracking CRUD
│   │   └── materials.py          # POST /api/materials/generate
│   ├── services/
│   │   ├── gemini.py             # Fit scoring prompt + Gemini call
│   │   ├── materials.py          # Materials generation prompt + Gemini call
│   │   ├── job_apis.py           # Async fan-out to Adzuna, Remotive, RemoteOK
│   │   └── airtable.py           # Airtable read/write helpers
│   └── models/                   # Pydantic request/response models
└── frontend/
    └── src/
        ├── App.jsx               # Tab state, auth gate, cross-tab JD lifting
        ├── api.js                # apiFetch — Bearer token + API_URL prefixing
        └── components/
            ├── Login.jsx         # Password screen, JWT storage
            ├── RoleDiscovery.jsx # Job search form and results grid
            ├── JobCard.jsx       # Result card with inline Evaluate button
            ├── JobFitEvaluator.jsx # JD input and fit evaluation
            ├── FitResult.jsx     # Score circle, dimension scorecard, talking points
            ├── Dashboard.jsx     # Application tracker, filter bar, action buttons
            └── MaterialsModal.jsx # Resume summary and cover letter generator
```

---

## License

MIT
