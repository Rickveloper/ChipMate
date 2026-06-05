from __future__ import annotations

import math
import re
import sqlite3
from typing import Any


REQUIRED_FIELDS = ("diameter_in", "machine", "material", "tool_material", "coolant")

MATERIAL_ALIASES = [
    ("stainless steel", ("stainless steel", "stainless", "304", "316", "17-4")),
    ("mild steel", ("mild steel", "low carbon", "1018", "1020", "a36", "steel")),
    ("tool steel", ("tool steel", "d2", "a2", "o1")),
    ("cast iron", ("cast iron", "gray iron", "grey iron", "iron")),
    ("aluminum", ("aluminum", "aluminium", "6061", "7075", "alu")),
    ("brass", ("brass", "bronze")),
]

TOOL_ALIASES = [
    ("carbide", ("carbide", "solid carbide")),
    ("cobalt", ("cobalt", "m42", "m35")),
    ("hss", ("hss", "high speed steel", "high-speed steel")),
]

MACHINE_ALIASES = [
    ("lathe", ("lathe", "turning", "turn", "engine lathe")),
    ("mill", ("mill", "milling", "bridgeport", "machining center", "cnc mill")),
]

QUESTION_COPY = {
    "diameter_in": {
        "question": "What reamer diameter in inches?",
        "options": [],
        "input_type": "number",
    },
    "machine": {
        "question": "Is this on a lathe or a mill?",
        "options": [
            {"label": "Lathe", "value": "lathe"},
            {"label": "Mill", "value": "mill"},
        ],
        "input_type": "choice",
    },
    "material": {
        "question": "What material are you reaming?",
        "options": [
            {"label": "Mild steel", "value": "mild steel"},
            {"label": "Stainless", "value": "stainless steel"},
            {"label": "Aluminum", "value": "aluminum"},
            {"label": "Brass", "value": "brass"},
            {"label": "Cast iron", "value": "cast iron"},
            {"label": "Tool steel", "value": "tool steel"},
        ],
        "input_type": "choice",
    },
    "tool_material": {
        "question": "What is the reamer material?",
        "options": [
            {"label": "HSS", "value": "hss"},
            {"label": "Cobalt", "value": "cobalt"},
            {"label": "Carbide", "value": "carbide"},
        ],
        "input_type": "choice",
    },
    "coolant": {
        "question": "Are you using coolant?",
        "options": [
            {"label": "Yes", "value": True},
            {"label": "No", "value": False},
        ],
        "input_type": "choice",
    },
}


def build_assistant_response(
    conn: sqlite3.Connection, message: str, prior_state: dict[str, Any] | None = None
) -> dict[str, Any]:
    state = normalize_state(prior_state or {})
    detected = parse_message(message)
    state.update({key: value for key, value in detected.items() if value is not None})
    state["operation"] = "reaming"

    missing = missing_questions(state)
    if missing:
        return {
            "status": "needs_input",
            "state": public_state(state),
            "detected": detected,
            "missing": missing,
            "prompt": missing[0]["question"],
            "answer": None,
        }

    recommendation = lookup_sfm(conn, state)
    rpm = recommendation["sfm"] * 3.82 / state["diameter_in"]
    rounded_rpm = max(1, int(round(rpm)))
    formula = (
        f"RPM = {format_number(recommendation['sfm'])} SFM * 3.82 / "
        f"{format_number(state['diameter_in'])} in"
    )
    source = {
        "id": recommendation["source_id"],
        "title": recommendation["source_title"],
        "publisher": recommendation["source_publisher"],
        "url": recommendation["source_url"],
        "note": recommendation["source_note"],
        "is_placeholder": bool(recommendation["is_placeholder"]),
    }
    citation = f"{source['title']} ({source['publisher']})"
    answer_text = (
        f"Use about {rounded_rpm} RPM for a {format_number(state['diameter_in'])} in "
        f"{state['tool_material'].upper()} reamer in {state['material']} on a {state['machine']} "
        f"with coolant {'on' if state['coolant'] else 'off'}. This uses "
        f"{format_number(recommendation['sfm'])} SFM from {citation}."
    )

    return {
        "status": "answer",
        "state": public_state(state),
        "detected": detected,
        "missing": [],
        "prompt": None,
        "answer": {
            "rpm": rounded_rpm,
            "raw_rpm": rpm,
            "sfm": recommendation["sfm"],
            "diameter_in": state["diameter_in"],
            "operation": "reaming",
            "machine": state["machine"],
            "material": state["material"],
            "tool_material": state["tool_material"],
            "coolant": state["coolant"],
            "formula": formula,
            "citation": citation,
            "source": source,
            "placeholder_warning": (
                "ChipMate v0.1 uses safe placeholder SFM data only. Verify against "
                "tooling manufacturer data and shop standards before cutting parts."
            ),
            "text": answer_text,
        },
    }


def normalize_state(raw_state: dict[str, Any]) -> dict[str, Any]:
    state: dict[str, Any] = {}

    diameter = raw_state.get("diameter_in")
    if diameter is not None:
        try:
            diameter_value = float(diameter)
            if 0.01 <= diameter_value <= 6:
                state["diameter_in"] = diameter_value
        except (TypeError, ValueError):
            pass

    machine = normalize_alias(str(raw_state.get("machine", "")), MACHINE_ALIASES)
    if machine:
        state["machine"] = machine

    material = normalize_alias(str(raw_state.get("material", "")), MATERIAL_ALIASES)
    if material:
        state["material"] = material

    tool_material = normalize_alias(str(raw_state.get("tool_material", "")), TOOL_ALIASES)
    if tool_material:
        state["tool_material"] = tool_material

    coolant = normalize_coolant(raw_state.get("coolant"))
    if coolant is not None:
        state["coolant"] = coolant

    state["operation"] = "reaming"
    return state


def parse_message(message: str) -> dict[str, Any]:
    text = (message or "").strip()
    lowered = text.lower()
    detected: dict[str, Any] = {
        "diameter_in": extract_diameter(lowered),
        "operation": "reaming" if re.search(r"\bream(?:er|ing|ed)?\b", lowered) else None,
        "machine": normalize_alias(lowered, MACHINE_ALIASES),
        "material": normalize_alias(lowered, MATERIAL_ALIASES),
        "tool_material": normalize_alias(lowered, TOOL_ALIASES),
        "coolant": normalize_coolant(lowered),
    }
    return detected


def normalize_alias(text: str, aliases: list[tuple[str, tuple[str, ...]]]) -> str | None:
    lowered = text.lower()
    for canonical, names in aliases:
        for name in names:
            if re.search(rf"(?<![a-z0-9]){re.escape(name)}(?![a-z0-9])", lowered):
                return canonical
    return None


def normalize_coolant(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    text = str(value).strip().lower()
    if not text:
        return None
    false_patterns = (
        "no coolant",
        "without coolant",
        "dry",
        "no flood",
        "no mist",
        "no oil",
        "no",
        "false",
        "off",
    )
    true_patterns = ("with coolant", "coolant", "flood", "mist", "oil", "yes", "true", "on")
    if any(re.search(rf"(?<![a-z0-9]){re.escape(pattern)}(?![a-z0-9])", text) for pattern in false_patterns):
        return False
    if any(re.search(rf"(?<![a-z0-9]){re.escape(pattern)}(?![a-z0-9])", text) for pattern in true_patterns):
        return True
    return None


def extract_diameter(text: str) -> float | None:
    decimal_patterns = [
        r"(?<![a-z0-9.])(?P<value>\d+\.\d+|\.\d+)\s*(?:in(?:ch(?:es)?)?|[\"”])?",
        r"\b(?:diameter|dia|size)\s*(?P<value>\d+)\s*(?:in(?:ch(?:es)?)?|[\"”])",
        r"(?<![a-z0-9.])(?P<value>\d+)\s*(?:in(?:ch(?:es)?)|[\"”])",
    ]
    for pattern in decimal_patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            value = safe_float(match.group("value"))
            if value is not None and 0.01 <= value <= 6:
                return value

    fraction_match = re.search(r"(?<!\d)(?P<num>\d{1,2})\s*/\s*(?P<den>\d{1,2})(?!\d)", text)
    if fraction_match:
        num = int(fraction_match.group("num"))
        den = int(fraction_match.group("den"))
        if den and 0.01 <= num / den <= 6:
            return num / den
    return None


def safe_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def missing_questions(state: dict[str, Any]) -> list[dict[str, Any]]:
    missing = []
    for field in REQUIRED_FIELDS:
        if field not in state:
            missing.append({"field": field, **QUESTION_COPY[field]})
    return missing


def lookup_sfm(conn: sqlite3.Connection, state: dict[str, Any]) -> sqlite3.Row:
    row = conn.execute(
        """
        SELECT r.sfm, r.source_id, s.title AS source_title, s.publisher AS source_publisher,
               s.url AS source_url, s.note AS source_note, s.is_placeholder
        FROM sfm_recommendations r
        JOIN sources s ON s.id = r.source_id
        WHERE r.operation = ?
          AND r.material = ?
          AND r.tool_material = ?
          AND r.coolant = ?
          AND r.machine = ?
        """,
        (
            "reaming",
            state["material"],
            state["tool_material"],
            1 if state["coolant"] else 0,
            state["machine"],
        ),
    ).fetchone()
    if row is None:
        raise ValueError("No placeholder SFM row matches the selected inputs.")
    return row


def public_state(state: dict[str, Any]) -> dict[str, Any]:
    clean = {key: state[key] for key in REQUIRED_FIELDS if key in state}
    clean["operation"] = "reaming"
    return clean


def format_number(value: float) -> str:
    if math.isclose(value, round(value)):
        return str(int(round(value)))
    return f"{value:.4f}".rstrip("0").rstrip(".")


def search_index(conn: sqlite3.Connection, query: str, limit: int = 10) -> list[dict[str, Any]]:
    tokens = re.findall(r"[a-zA-Z0-9]+", query or "")
    if not tokens:
        return []
    match_query = " OR ".join(tokens[:8])
    try:
        rows = conn.execute(
            """
            SELECT kind, ref_id, title,
                   snippet(search_index, -1, '<mark>', '</mark>', '...', 16) AS snippet,
                   bm25(search_index) AS rank
            FROM search_index
            WHERE search_index MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (match_query, limit),
        ).fetchall()
    except sqlite3.OperationalError:
        return []
    return [
        {
            "kind": row["kind"],
            "ref_id": row["ref_id"],
            "title": row["title"],
            "snippet": row["snippet"],
        }
        for row in rows
    ]
