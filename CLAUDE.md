# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Backend
```bash
# Install dependencies (one-time)
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt

# Run dev server (from repo root)
source backend/.venv/bin/activate && PYTHONPATH=backend uvicorn backend.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend && npm install   # one-time
cd frontend && npm run dev   # starts at :5173 (or next available port)
```

### Environment
Copy `.env.example` (or create `.env` at repo root) with:
```
GEMINI_API_KEY=
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
```

Both `profile.md` and `writing_guide.md` are gitignored and must exist at the repo root:
- `profile.md` — candidate background, skills, work history. Required for the fit evaluator and job search filters.
- `writing_guide.md` — resume summary formula, cover letter structure, signal mapping table, voice guide, and banned phrases list. Required for the materials generator (`/api/materials/generate`).

## Architecture

This is a two-process app: a FastAPI backend (`backend/`) and a React+Vite frontend (`frontend/`). The Vite dev server proxies `/api/*` to `http://localhost:8000`, so the frontend always calls `/api/...` with no hardcoded port.

### Backend layout

```
backend/
  main.py          # FastAPI app, CORS, router registration
  routers/
    job_fit.py     # POST /api/evaluate
    job_search.py  # POST /api/jobs/search
  services/
    gemini.py      # Calls Gemini 2.5 Flash with the full rubric prompt
    job_apis.py    # Adzuna + Remotive search, salary filtering, flag detection, dedup
  models/
    job_fit.py     # Pydantic models for evaluate request/response
    job_search.py  # Pydantic models for job search request/response
```

`main.py` loads `.env` from the repo root via `python-dotenv` before importing routers, so env vars are available everywhere.

`PYTHONPATH=backend` is required when running from the repo root — the routers import `from models.` and `from services.` as top-level packages.

### Fit evaluator (`/api/evaluate`)

`services/gemini.py` reads `profile.md` and inlines it with a large structured rubric prompt, then calls Gemini with `response_mime_type="application/json"`. The overall score and action ("Apply"/"Explore"/"Skip") are **recomputed server-side** from the raw dimension scores — do not rely on the model's own weighted calculation. Hard-skip conditions (comp below $80k, Tier 4 role, 3+ Category C skill gaps) always force action = "Skip" regardless of score.

### Job search (`/api/jobs/search`)

`services/job_apis.py` fans out async `httpx` requests: one Adzuna call + one Remotive call per title, all gathered in parallel. Post-fetch pipeline:

1. **Salary ceiling filter** — drops jobs where `salary_max` is set and below $80k
2. **Flag detection** — regex scan of description+title for: US citizen, security clearance, Series A/B, fast-paced startup, 30%/50% travel
3. **Dedup** — normalizes `company+title` to lowercase alphanumeric; keeps first occurrence across all batches

Adzuna returns `salary_min`/`salary_max` as floats. Remotive returns salary as a free-text string; `_parse_salary_string()` extracts numeric values (handles `$90k`, `90,000`, `$90k-$120k` formats).

### Frontend layout

```
frontend/src/
  App.jsx                    # Tab state, evaluator key/JD lifting
  App.css                    # All styles (single file, CSS custom properties)
  components/
    RoleDiscovery.jsx        # Search form (chip title selector) + job grid
    JobCard.jsx              # Individual result card with Evaluate button
    JobFitEvaluator.jsx      # JD textarea + evaluate trigger; accepts initialJD prop
    FitResult.jsx            # Score circle, dimension scorecard, talking points
```

**Cross-tab state flow**: `App.jsx` owns `evaluatorKey` (int) and `initialJD` (string). Clicking "Evaluate Fit" on a `JobCard` calls `onEvaluate(jdText)` → App increments the key and sets `initialJD` → `JobFitEvaluator` remounts (via `key=`) with the new JD pre-filled. Both tab panels are always mounted in the DOM (toggled via `display: none`) so discovery search results survive tab switches.
