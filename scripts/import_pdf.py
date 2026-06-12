from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "app" / "chipmate.sqlite3"
PDF_PATH = ROOT / "reference" / "machinery-handbook-32-pocket.pdf"


def chunk_text(text: str, max_chars: int = 1800) -> list[str]:
    words = text.split()
    chunks = []
    current = []

    for word in words:
        current.append(word)
        if len(" ".join(current)) >= max_chars:
            chunks.append(" ".join(current))
            current = []

    if current:
        chunks.append(" ".join(current))

    return chunks


def main() -> None:
    if not PDF_PATH.exists():
        raise FileNotFoundError(f"Missing PDF: {PDF_PATH}")

    reader = PdfReader(str(PDF_PATH))

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS handbook_chunks (
                id INTEGER PRIMARY KEY,
                source TEXT NOT NULL,
                page INTEGER NOT NULL,
                chunk INTEGER NOT NULL,
                text TEXT NOT NULL
            )
            """
        )

        conn.execute("DELETE FROM handbook_chunks WHERE source = ?", (PDF_PATH.name,))
        conn.execute("DELETE FROM search_index WHERE kind = 'handbook'")

        count = 0

        for page_num, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            text = " ".join(text.split())

            if not text:
                continue

            for chunk_num, chunk in enumerate(chunk_text(text), start=1):
                conn.execute(
                    """
                    INSERT INTO handbook_chunks (source, page, chunk, text)
                    VALUES (?, ?, ?, ?)
                    """,
                    (PDF_PATH.name, page_num, chunk_num, chunk),
                )

                conn.execute(
                    """
                    INSERT INTO search_index (kind, ref_id, title, body)
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        "handbook",
                        f"{page_num}:{chunk_num}",
                        f"{PDF_PATH.name} page {page_num}",
                        chunk,
                    ),
                )

                count += 1

        conn.commit()

    print(f"Imported {count} handbook chunks from {PDF_PATH.name}")


if __name__ == "__main__":
    main()
