# ChipMate

ChipMate is an offline-first Machinist Copilot backed by FastAPI, SQLite, and a mobile-friendly PWA shell. It answers general machining questions with a direct answer, practical steps, formulas, sources, and contextual after-answer refinements.

The assistant covers:

- Speeds and feeds
- Tooling
- Materials
- GD&T
- Inspection
- Blueprint reading
- Manual machining
- CNC
- Formulas
- Tap drill charts
- Reamers
- Threading

The local reaming RPM calculator remains available as an internal helper. When a question includes enough setup detail, ChipMate can calculate spindle speed from:

```text
RPM = SFM * 3.82 / diameter
```

Local SFM values are conservative seed data stored in SQLite with source records. Replace them with verified tooling manufacturer or shop-approved data before using them for production decisions.

v0.3 adds typing suggestions, recent searches, favorites, and refinement buttons that resubmit the current question with extra context. Recent searches and favorites are stored in browser localStorage.

The local source list includes `reference/machinery-handbook-27th.pdf` as Machinery's Handbook 27th Edition, 2004. ChipMate uses that handbook as a local source label and curated lookup reference; generated answers should not quote large handbook sections.

## Requirements

- Ubuntu with Python 3
- SQLite build with FTS5 enabled, which is included in typical Ubuntu Python builds

## Setup

Run from the repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8095
```

Open:

```text
http://localhost:8095
```

The SQLite database is created automatically at `app/chipmate.sqlite3` on startup.

## API

- `GET /` serves the UI
- `GET /api/categories` lists machining categories
- `POST /api/assistant` returns a structured machining answer
- `GET /api/search?q=aluminum+hss` searches the SQLite FTS5 index
- `GET /api/sources` lists local source records
- `GET /api/health` returns app status

Example assistant request:

```bash
curl -X POST http://localhost:8095/api/assistant \
  -H 'Content-Type: application/json' \
  -d '{"message":"what tap drill for 1/4-20 in mild steel?","state":{}}'
```

## Project Layout

```text
app/
  assistant.py        Question routing, answer composition, formulas, and local calculation helpers
  database.py         SQLite schema, source seed data, SFM seed data, and search indexing
  main.py             FastAPI app and routes
  static/             Frontend and PWA files
requirements.txt
README.md
```
