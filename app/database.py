from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Iterable

DB_PATH = Path(__file__).resolve().parent / "chipmate.sqlite3"


MATERIAL_SFM = {
    "aluminum": {"hss": (45, 60), "cobalt": (55, 70), "carbide": (90, 120)},
    "brass": {"hss": (45, 50), "cobalt": (50, 60), "carbide": (85, 100)},
    "cast iron": {"hss": (35, 35), "cobalt": (45, 45), "carbide": (75, 75)},
    "mild steel": {"hss": (18, 25), "cobalt": (22, 30), "carbide": (40, 50)},
    "stainless steel": {"hss": (8, 12), "cobalt": (10, 15), "carbide": (22, 30)},
    "tool steel": {"hss": (8, 10), "cobalt": (10, 12), "carbide": (20, 25)},
}


def get_connection(db_path: Path | str = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path: Path | str = DB_PATH) -> None:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with get_connection(db_path) as conn:
        create_schema(conn)
        seed_placeholder_data(conn)


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS sources (
            id INTEGER PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            publisher TEXT NOT NULL,
            url TEXT,
            note TEXT NOT NULL,
            is_placeholder INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sfm_recommendations (
            id INTEGER PRIMARY KEY,
            operation TEXT NOT NULL,
            material TEXT NOT NULL,
            tool_material TEXT NOT NULL,
            coolant INTEGER NOT NULL CHECK (coolant IN (0, 1)),
            machine TEXT NOT NULL,
            sfm REAL NOT NULL CHECK (sfm > 0),
            source_id INTEGER NOT NULL REFERENCES sources(id),
            note TEXT NOT NULL,
            UNIQUE (operation, material, tool_material, coolant, machine)
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
            kind UNINDEXED,
            ref_id UNINDEXED,
            title,
            body,
            tokenize='porter unicode61'
        );
        """
    )


def seed_placeholder_data(conn: sqlite3.Connection) -> None:
    source = {
        "slug": "chipmate-placeholder-reaming-sfm-v0-1",
        "title": "ChipMate v0.1 Placeholder Reaming SFM Table",
        "publisher": "ChipMate local seed data",
        "url": "local://chipmate/placeholder-reaming-sfm-v0.1",
        "note": (
            "Conservative placeholder SFM values for prototype reaming calculations. "
            "Replace with verified tooling manufacturer data, shop standards, and setup-specific "
            "judgment before production use."
        ),
    }
    conn.execute(
        """
        INSERT INTO sources (slug, title, publisher, url, note, is_placeholder)
        VALUES (:slug, :title, :publisher, :url, :note, 1)
        ON CONFLICT(slug) DO UPDATE SET
            title = excluded.title,
            publisher = excluded.publisher,
            url = excluded.url,
            note = excluded.note,
            is_placeholder = excluded.is_placeholder
        """,
        source,
    )
    source_id = conn.execute(
        "SELECT id FROM sources WHERE slug = ?", (source["slug"],)
    ).fetchone()["id"]

    rows = list(_placeholder_sfm_rows(source_id))
    conn.executemany(
        """
        INSERT INTO sfm_recommendations (
            operation, material, tool_material, coolant, machine, sfm, source_id, note
        )
        VALUES (
            :operation, :material, :tool_material, :coolant, :machine, :sfm, :source_id, :note
        )
        ON CONFLICT(operation, material, tool_material, coolant, machine) DO UPDATE SET
            sfm = excluded.sfm,
            source_id = excluded.source_id,
            note = excluded.note
        """,
        rows,
    )
    rebuild_search_index(conn)


def _placeholder_sfm_rows(source_id: int) -> Iterable[dict[str, object]]:
    for material, tool_values in MATERIAL_SFM.items():
        for tool_material, (dry_sfm, coolant_sfm) in tool_values.items():
            for coolant, sfm in ((0, dry_sfm), (1, coolant_sfm)):
                for machine in ("lathe", "mill"):
                    yield {
                        "operation": "reaming",
                        "material": material,
                        "tool_material": tool_material,
                        "coolant": coolant,
                        "machine": machine,
                        "sfm": sfm,
                        "source_id": source_id,
                        "note": (
                            "Placeholder reaming SFM. Coolant and machine are captured for "
                            "guided workflow context in v0.1."
                        ),
                    }


def rebuild_search_index(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM search_index")
    source_rows = conn.execute(
        "SELECT id, title, publisher, url, note FROM sources ORDER BY id"
    ).fetchall()
    conn.executemany(
        """
        INSERT INTO search_index (kind, ref_id, title, body)
        VALUES ('source', :id, :title, :body)
        """,
        [
            {
                "id": row["id"],
                "title": row["title"],
                "body": f"{row['publisher']} {row['url'] or ''} {row['note']}",
            }
            for row in source_rows
        ],
    )

    sfm_rows = conn.execute(
        """
        SELECT r.id, r.operation, r.material, r.tool_material, r.coolant, r.machine,
               r.sfm, r.note, s.title AS source_title
        FROM sfm_recommendations r
        JOIN sources s ON s.id = r.source_id
        ORDER BY r.id
        """
    ).fetchall()
    conn.executemany(
        """
        INSERT INTO search_index (kind, ref_id, title, body)
        VALUES ('sfm', :id, :title, :body)
        """,
        [
            {
                "id": row["id"],
                "title": (
                    f"{row['material']} {row['tool_material'].upper()} "
                    f"{row['operation']} on {row['machine']}"
                ),
                "body": (
                    f"operation {row['operation']} material {row['material']} "
                    f"tool {row['tool_material']} coolant {'yes' if row['coolant'] else 'no'} "
                    f"sfm {row['sfm']} source {row['source_title']} {row['note']}"
                ),
            }
            for row in sfm_rows
        ],
    )
