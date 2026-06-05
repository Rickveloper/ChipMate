# ChipMate v0.1

ChipMate is an offline-first machinist assistant. This first version includes a guided Reamer RPM Assistant backed by FastAPI, SQLite, and a mobile-friendly PWA shell.

The assistant can parse prompts like:

```text
how fast should I spin a .503 reamer
```

It extracts the `0.503 in` diameter, treats the operation as reaming, asks for missing setup details, and calculates:

```text
RPM = SFM * 3.82 / diameter
```

All v0.1 SFM values are conservative placeholder seed data. They are stored in SQLite with a local source record and are cited in every answer. Replace them with verified manufacturer or shop-approved data before using ChipMate for production decisions.

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

- `GET /` serves the mobile UI
- `POST /api/assistant` parses input, asks follow-up questions, and returns RPM answers
- `GET /api/search?q=aluminum+hss` searches the SQLite FTS5 index
- `GET /api/sources` lists local source records
- `GET /api/health` returns app status

Example assistant request:

```bash
curl -X POST http://localhost:8095/api/assistant \
  -H 'Content-Type: application/json' \
  -d '{"message":"how fast should I spin a .503 reamer","state":{}}'
```

Then answer the returned follow-up fields with values such as:

```json
{
  "diameter_in": 0.503,
  "operation": "reaming",
  "machine": "mill",
  "material": "mild steel",
  "tool_material": "hss",
  "coolant": true
}
```

## Project Layout

```text
app/
  assistant.py        Reamer parsing, follow-up state, RPM calculation, FTS search
  database.py         SQLite schema, placeholder SFM seed data, search indexing
  main.py             FastAPI app and routes
  static/             Mobile-first frontend and PWA files
requirements.txt
README.md
```
