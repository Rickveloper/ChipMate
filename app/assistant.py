from __future__ import annotations

import math
import re
import sqlite3
from typing import Any

CATEGORIES = [
    {"name": "Speeds & Feeds", "slug": "speeds-feeds"},
    {"name": "Tooling", "slug": "tooling"},
    {"name": "Materials", "slug": "materials"},
    {"name": "GD&T", "slug": "gdt"},
    {"name": "Inspection", "slug": "inspection"},
    {"name": "Blueprint Reading", "slug": "blueprint-reading"},
    {"name": "Manual Machining", "slug": "manual-machining"},
    {"name": "CNC", "slug": "cnc"},
    {"name": "Formulas", "slug": "formulas"},
    {"name": "Calculator", "slug": "calculator"},
    {"name": "Tap Drill Charts", "slug": "tap-drill-charts"},
    {"name": "Reamers", "slug": "reamers"},
    {"name": "Threading", "slug": "threading"},
]

CATEGORY_KEYWORDS = {
    "speeds-feeds": ("rpm", "sfm", "surface speed", "feed", "feeds", "speed", "chip load", "ipt", "ipr", "spindle", "flute"),
    "tooling": ("tooling", "holder", "insert", "end mill", "drill", "coating", "carbide", "hss", "cobalt", "boring bar", "collet"),
    "materials": ("material", "aluminum", "steel", "stainless", "brass", "bronze", "cast iron", "tool steel", "titanium", "hardness", "heat treat"),
    "gdt": ("gd&t", "gdt", "true position", "position", "datum", "flatness", "parallelism", "perpendicularity", "profile", "runout", "mmc", "lmc"),
    "inspection": ("inspect", "inspection", "measure", "micrometer", "caliper", "bore gage", "bore gauge", "cmm", "indicator", "dial indicator", "runout", "gage", "gauge", "surface plate"),
    "blueprint-reading": ("blueprint", "drawing", "print", "title block", "revision", "tolerance", "section view", "detail view", "notes", "symbol"),
    "manual-machining": ("manual", "bridgeport", "knee mill", "engine lathe", "handwheel", "tailstock", "compound", "manual mill", "manual lathe", "indicate", "indicating", "dial in", "dialing in", "center", "centering", "chuck", "chuck setup", "4 jaw", "4-jaw", "four jaw", "four-jaw"),
    "cnc": ("cnc", "g-code", "gcode", "g54", "g55", "work offset", "tool length", "fixture offset", "cutter comp", "macro", "post", "program"),
    "formulas": ("formula", "calculate", "calculation", "convert", "conversion", "trig", "sine", "cosine", "radius", "diameter"),
    "calculator": ("calculator", "machinist calculator", "offline calculator"),
    "tap-drill-charts": ("tap drill", "tap chart", "drill chart", "thread percent", "percent thread", "minor diameter", "tap size"),
    "reamers": ("reamer", "reaming", "ream", "chucking reamer", "reamed hole", "undersize", "oversize"),
    "threading": ("thread", "threading", "tpi", "pitch", "unc", "unf", "tap", "die", "single point", "thread mill"),
}

MATERIAL_ALIASES = [
    ("stainless steel", ("stainless steel", "stainless", "304", "316", "17-4")),
    ("mild steel", ("mild steel", "low carbon", "1018", "1020", "a36", "steel")),
    ("tool steel", ("tool steel", "d2", "a2", "o1")),
    ("cast iron", ("cast iron", "gray iron", "grey iron", "iron")),
    ("aluminum", ("aluminum", "aluminium", "6061", "7075", "alu")),
    ("brass", ("brass", "bronze")),
]
TOOL_ALIASES = [("carbide", ("carbide", "solid carbide")), ("cobalt", ("cobalt", "m42", "m35")), ("hss", ("hss", "high speed steel", "high-speed steel"))]
MACHINE_ALIASES = [("lathe", ("lathe", "turning", "turn", "engine lathe")), ("mill", ("mill", "milling", "bridgeport", "machining center", "cnc mill"))]
OPERATION_ALIASES = [("reaming", ("reamer", "reaming", "ream")), ("threading", ("threading", "thread", "tap", "tapping", "die")), ("drilling", ("drilling", "drill")), ("milling", ("milling", "mill", "end mill")), ("turning", ("turning", "turn", "lathe"))]
REQUIRED_SFM_FIELDS = ("diameter_in", "machine", "material", "tool_material", "coolant")

CUTTING_DATA_TERMS = (
    "rpm",
    "sfm",
    "surface speed",
    "spindle speed",
    "feed",
    "feeds",
    "feed rate",
    "chip load",
    "ipt",
    "ipr",
    "cutter",
    "drill",
    "drilling",
    "milling",
    "turning speed",
    "how fast",
    "spin",
)

FOUR_JAW_INDICATING_TERMS = (
    "indicate",
    "indicating",
    "dial in",
    "dialing in",
    "runout",
    "dial indicator",
    "chuck setup",
    "chuck set up",
    "setup a chuck",
    "set up a chuck",
)

SCREW_MAJOR_DIAMETERS = {"#0": 0.060, "#1": 0.073, "#2": 0.086, "#3": 0.099, "#4": 0.112, "#5": 0.125, "#6": 0.138, "#8": 0.164, "#10": 0.190, "#12": 0.216}
COMMON_TAP_DRILLS = {
    "4-40": {"drill": "#43", "diameter": "0.0890 in"}, "6-32": {"drill": "#36", "diameter": "0.1065 in"},
    "8-32": {"drill": "#29", "diameter": "0.1360 in"}, "10-24": {"drill": "#25", "diameter": "0.1495 in"},
    "10-32": {"drill": "#21", "diameter": "0.1590 in"}, "1/4-20": {"drill": "#7", "diameter": "0.2010 in"},
    "1/4-28": {"drill": "#3", "diameter": "0.2130 in"}, "5/16-18": {"drill": "F", "diameter": "0.2570 in"},
    "5/16-24": {"drill": "I", "diameter": "0.2720 in"}, "3/8-16": {"drill": "5/16", "diameter": "0.3125 in"},
    "3/8-24": {"drill": "Q", "diameter": "0.3320 in"}, "1/2-13": {"drill": "27/64", "diameter": "0.4219 in"},
    "1/2-20": {"drill": "29/64", "diameter": "0.4531 in"}, "M3X0.5": {"drill": "2.5 mm", "diameter": "2.5 mm"},
    "M4X0.7": {"drill": "3.3 mm", "diameter": "3.3 mm"}, "M5X0.8": {"drill": "4.2 mm", "diameter": "4.2 mm"},
    "M6X1": {"drill": "5.0 mm", "diameter": "5.0 mm"}, "M8X1.25": {"drill": "6.8 mm", "diameter": "6.8 mm"},
    "M10X1.5": {"drill": "8.5 mm", "diameter": "8.5 mm"}, "M12X1.75": {"drill": "10.2 mm", "diameter": "10.2 mm"},
}

RESPONSE_TEMPLATES = {
    "speeds-feeds": {
        "direct": "Start from the tool maker's SFM and chip-load range for the exact cutter, material, stickout, and machine. Convert that data into RPM and feed, then tune from chip color, sound, finish, and tool wear.",
        "steps": ["Identify operation, tool diameter, tool material, flute count, material grade, and setup rigidity.", "Select a conservative SFM and chip load from the tool manufacturer or shop standard.", "Calculate RPM from SFM and diameter, then calculate feed rate from RPM, flute count, and chip load.", "Reduce the starting point for long stickout, light machines, poor workholding, interrupted cuts, or deep engagement.", "Verify chips, spindle load, finish, size, and tool wear before committing to production."],
        "formulas": [{"label": "Spindle speed", "expression": "RPM = (SFM x 3.82) / tool diameter in inches"}, {"label": "Milling feed", "expression": "IPM = RPM x chip load per tooth x flute count"}, {"label": "Turning feed", "expression": "IPM = RPM x feed per revolution"}, {"label": "Surface speed", "expression": "SFM = (RPM x tool diameter in inches) / 3.82"}],
        "sources": ["tooling-manufacturer-data", "machinery-handbook", "chipmate-placeholder-reaming-sfm-v0-1"], "related": ["Chip load", "SFM", "Tool wear", "Coolant", "Workholding rigidity"],
    },
    "tooling": {
        "direct": "Choose tooling by matching geometry, substrate, coating, holder rigidity, and chip evacuation to the material and operation. Geometry usually matters before coating: edge prep, rake, flute space, and relief determine whether the tool cuts freely or rubs.",
        "steps": ["Define the operation, tolerance, finish requirement, reach, and machine limits.", "Choose the tool style and geometry for the material and chip shape you need.", "Select holder and stickout to maximize rigidity while clearing the part and fixture.", "Use manufacturer speeds and feeds, then adjust for engagement and setup stiffness.", "Inspect wear mode after the first cuts: flank wear, chipping, built-up edge, or heat checking point to different fixes."],
        "formulas": [], "sources": ["tooling-manufacturer-data", "machinery-handbook"], "related": ["Tool coatings", "Holder runout", "Chip evacuation", "Insert grades", "Tool life"],
    },
    "materials": {
        "direct": "Material behavior drives tool choice and cutting data. Confirm the alloy and condition first; the same nominal material can machine very differently depending on heat treat, hardness, and form.",
        "steps": ["Confirm alloy, hardness, heat treatment, and whether the stock is cast, rolled, forged, or welded.", "Pick tooling geometry for the dominant problem: gummy chips, work hardening, abrasion, or interrupted scale.", "Start with conservative cutting data and adjust after checking chips, finish, size, and temperature.", "Control heat with coolant, air, oil, or dry cutting based on tool coating and material."],
        "formulas": [], "sources": ["machinery-handbook", "tooling-manufacturer-data"], "related": ["Work hardening", "Built-up edge", "Hardness", "Coolant strategy", "Material condition"],
    },
    "gdt": {
        "direct": "Read GD&T from the feature control frame outward: symbol, tolerance value, modifiers, and datums. The datums define the inspection reference frame; the symbol defines the allowed tolerance zone.",
        "steps": ["Identify the controlled feature and the GD&T symbol.", "Read the tolerance value and any diameter, MMC, LMC, projected tolerance, or free-state modifier.", "Establish datum features in the order shown in the feature control frame.", "Determine the tolerance zone shape and orientation from the symbol and datum references.", "Choose an inspection method that recreates the datum reference frame closely enough for the tolerance."],
        "formulas": [{"label": "Hole position error from X/Y deviation", "expression": "Position error = 2 x sqrt(X error^2 + Y error^2)"}],
        "sources": ["asme-y14-5", "nist-dimensional-metrology"], "related": ["Datums", "True position", "MMC bonus tolerance", "Profile tolerance", "Runout"],
    },
    "inspection": {
        "direct": "Choose the inspection method from the tolerance, feature geometry, access, and required uncertainty. The gage should be meaningfully more capable than the tolerance you are trying to verify.",
        "steps": ["Read the feature, tolerance, datum requirements, and surface finish requirement.", "Select a measuring tool with enough resolution, range, and access for the feature.", "Clean the part and gage, stabilize temperature when tolerances are tight, and zero against a traceable standard.", "Measure in a repeatable datum setup and record actual values when troubleshooting.", "Confirm borderline results with a more capable method or a second setup."],
        "formulas": [], "sources": ["nist-dimensional-metrology", "machinery-handbook"], "related": ["Gage R&R", "Micrometers", "Bore gages", "CMM setup", "Thermal growth"],
    },
    "blueprint-reading": {
        "direct": "Read the drawing in order: title block, revision, general notes, material, units, views, dimensions, tolerances, GD&T, finish, and inspection notes. Do not machine from a single view until the related views and notes agree.",
        "steps": ["Check part number, revision, units, scale, projection, material, and finish notes.", "Find the datum scheme or functional locating features before planning setups.", "Read dimensions with their local or block tolerances and note any inspection-critical characteristics.", "Resolve section views, detail views, hidden lines, and auxiliary views before programming or machining.", "Flag missing dimensions, conflicting notes, or impossible tolerances before cutting material."],
        "formulas": [], "sources": ["asme-y14-5", "machinery-handbook"], "related": ["Title block", "Datums", "Revision control", "Surface finish", "Tolerance stackup"],
    },
    "manual-machining": {
        "direct": "For manual machining, prioritize layout, rigidity, backlash control, and measurement at each step. Leave stock for finishing cuts and approach final size from a consistent direction.",
        "steps": ["Plan the setup from the most stable locating faces and clamp without distorting the work.", "Indicate the work, tram or align the machine as needed, and verify tool clearance.", "Rough with enough stock left for a stable finishing pass.", "Account for backlash by approaching final coordinates from the same handwheel direction.", "Deburr and measure between critical operations so errors are found while they can still be corrected."],
        "formulas": [{"label": "Dial movement", "expression": "Table travel = dial divisions x feed per division"}], "sources": ["machinery-handbook", "tooling-manufacturer-data"], "related": ["Backlash", "Indicating", "Tramming", "Boring heads", "Lathe compounds"],
    },
    "cnc": {
        "direct": "For CNC work, separate geometry, workholding, tools, offsets, and code verification. Most crashes come from wrong offsets, wrong tool data, bad clearance assumptions, or unverified setup changes.",
        "steps": ["Verify work offset, tool length offsets, cutter compensation values, and active plane before running.", "Backplot or simulate the program and check stock, fixtures, clamps, and toolholder clearance.", "Run a controlled first piece with optional stops, single block where useful, and reduced rapid override.", "Inspect critical features before removing the setup.", "Lock down proven offsets, tool numbers, revisions, and setup notes for repeat work."],
        "formulas": [{"label": "Milling feed", "expression": "IPM = RPM x chip load per tooth x flute count"}, {"label": "Constant surface speed", "expression": "RPM = (SFM x 3.82) / diameter in inches"}], "sources": ["tooling-manufacturer-data", "machinery-handbook"], "related": ["G54 work offsets", "Tool length offsets", "Cutter compensation", "Probing", "Dry run"],
    },
    "formulas": {
        "direct": "Use machining formulas as a check on manufacturer data and shop standards. Keep units explicit; most mistakes come from mixing inch and metric values or confusing feed per tooth with feed per revolution.",
        "steps": ["Write down the known values with units.", "Choose the formula for the operation and unit system.", "Solve once, then sanity-check the result against typical shop ranges.", "Adjust the final cutting data for rigidity, tool engagement, coolant, and material condition."],
        "formulas": [{"label": "RPM", "expression": "RPM = (SFM x 3.82) / diameter in inches"}, {"label": "Milling feed", "expression": "IPM = RPM x chip load per tooth x flute count"}, {"label": "Metric RPM", "expression": "RPM = (1000 x m/min) / (pi x diameter in mm)"}, {"label": "Tap drill, inch approximation", "expression": "Drill diameter = major diameter - (1 / TPI)"}, {"label": "Tap drill, metric approximation", "expression": "Drill diameter = major diameter - pitch"}],
        "sources": ["machinery-handbook", "tooling-manufacturer-data"], "related": ["Speeds & feeds", "Tap drill charts", "Thread pitch", "Unit conversion", "SFM"],
    },
    "calculator": {
        "direct": "Use the offline calculator card in the ChipMate interface for quick shop math without a network request. Keep units consistent, especially for true position where X and Y error must use the same units.",
        "steps": ["Open the Calculator category.", "Enter the known values in the matching calculator.", "Check the result units before using the value at the machine or inspection bench."],
        "formulas": [{"label": "RPM", "expression": "RPM = (SFM x 3.82) / diameter in inches"}, {"label": "Surface speed", "expression": "SFM = (RPM x diameter in inches) / 3.82"}, {"label": "Milling feed", "expression": "IPM = RPM x chip load per tooth x flute count"}, {"label": "Inch tap drill approximation", "expression": "Drill diameter = major diameter - (1 / TPI)"}, {"label": "Metric tap drill approximation", "expression": "Drill diameter = major diameter - pitch"}, {"label": "Decimal inch to mm", "expression": "mm = inch x 25.4"}, {"label": "True position", "expression": "TP = 2 x sqrt(X error^2 + Y error^2)"}],
        "sources": ["machinery-handbook", "tooling-manufacturer-data"], "related": ["Speeds & feeds", "Tap drill charts", "Unit conversion", "True position", "SFM"],
    },
    "tap-drill-charts": {
        "direct": "For common taps, use a tap drill chart first. The quick approximation is major diameter minus pitch, but standard drill sizes are chosen to hit a practical thread percentage rather than a perfect formula value.",
        "steps": ["Identify the thread system, major diameter, pitch or TPI, and class of fit.", "Choose the thread percentage required for the material and application.", "Select the nearest standard drill from a chart, then verify enough thread engagement remains.", "Use cutting fluid and chip-clearing strategy appropriate to the material and tap style."],
        "formulas": [{"label": "Inch tap drill approximation", "expression": "Drill diameter = major diameter - (1 / TPI)"}, {"label": "Metric tap drill approximation", "expression": "Drill diameter = major diameter - pitch"}], "sources": ["machinery-handbook", "ansi-asme-b1-1", "tooling-manufacturer-data"], "related": ["Thread percentage", "UNC", "UNF", "Metric threads", "Tapping fluid"],
    },
    "reamers": {
        "direct": "Reamers are finishing tools, not roughing tools. Drill or bore undersize, leave controlled stock, keep the reamer aligned, feed positively, and avoid dwelling at the bottom of the hole.",
        "steps": ["Make the pre-hole straight, round, and slightly undersize for the reamer and material.", "Use a rigid, well-aligned holder; floating holders can help when the machine and hole are not perfectly aligned.", "Run conservative SFM, feed steadily, and use suitable cutting fluid unless the tool maker says otherwise.", "Do not stop or dwell in the cut; feed through and withdraw cleanly.", "Measure size, roundness, taper, and finish before adjusting speed or stock allowance."],
        "formulas": [{"label": "Reaming RPM", "expression": "RPM = (SFM x 3.82) / reamer diameter in inches"}], "sources": ["tooling-manufacturer-data", "machinery-handbook", "chipmate-placeholder-reaming-sfm-v0-1"], "related": ["Pre-hole size", "Floating holders", "Coolant", "Bellmouth", "Hole finish"],
    },
    "threading": {
        "direct": "For threading, identify the thread form, pitch, class of fit, material, and method first. Tapping, single-point threading, thread milling, and dies all need different setup checks.",
        "steps": ["Confirm thread standard, major diameter, pitch or TPI, handedness, depth, and class of fit.", "Prepare the correct tap drill or turned blank diameter and add chamfer relief.", "Choose tap, die, single-point insert, or thread mill based on material, depth, tolerance, and machine.", "Use cutting data from the tool maker and verify synchronization or pitch feed before cutting.", "Check with go/no-go gages, thread wires, or a mating part as required by the print."],
        "formulas": [{"label": "Pitch from TPI", "expression": "Pitch in inches = 1 / TPI"}, {"label": "Inch tap drill approximation", "expression": "Drill diameter = major diameter - (1 / TPI)"}, {"label": "Metric tap drill approximation", "expression": "Drill diameter = major diameter - pitch"}], "sources": ["machinery-handbook", "ansi-asme-b1-1", "tooling-manufacturer-data"], "related": ["Tap drill charts", "Thread pitch", "Go/no-go gages", "Thread milling", "Single-point threading"],
    },
}

REFINEMENT_LABELS = {
    "material-context": "Material Context",
    "topic-focus": "Focused Follow-up",
    "math-check": "Math Check",
    "inspection-checks": "Inspection Checks",
    "troubleshooting": "Troubleshooting",
    "shop-checklist": "Shop Checklist",
    "plain-english": "Plain English",
}

TAP_THREAD_MATERIAL_ACTIONS = [
    {"label": "Aluminum", "material": "aluminum", "context": "Use aluminum as the material context for this tap drill or threading question."},
    {"label": "Mild Steel", "material": "mild steel", "context": "Use mild steel as the material context for this tap drill or threading question."},
    {"label": "Stainless", "material": "stainless steel", "context": "Use stainless steel as the material context for this tap drill or threading question."},
    {"label": "Brass", "material": "brass", "context": "Use brass as the material context for this tap drill or threading question."},
    {"label": "Cast Iron", "material": "cast iron", "context": "Use cast iron as the material context for this tap drill or threading question."},
]


def build_assistant_response(conn: sqlite3.Connection, message: str, prior_state: dict[str, Any] | None = None, refinement_context: str | None = None) -> dict[str, Any]:
    query = (message or "").strip()
    if not query:
        return {"status": "ready", "categories": CATEGORIES, "answer": None, "query": ""}

    state = normalize_state(prior_state or {})
    refinement = normalize_refinement_context(refinement_context)
    detected = parse_message(query)
    context_detected = parse_message(refinement["context"]) if refinement else {}
    state.update({key: value for key, value in detected.items() if value is not None})
    state.update({key: value for key, value in context_detected.items() if value is not None})
    category = classify_query(query)
    tool_results = run_calculation_tools(conn, query, state)
    answer = compose_answer(conn, query, category, tool_results, refinement)
    return {
        "status": "answer",
        "query": query,
        "refinement_context": refinement,
        "category": category,
        "categories": CATEGORIES,
        "detected": {**detected, **{key: value for key, value in context_detected.items() if value is not None}},
        "state": public_state(state),
        "tool_results": tool_results,
        "answer": answer,
        "related_results": search_index(conn, query, 5),
    }


def get_categories() -> list[dict[str, str]]:
    return CATEGORIES


def classify_query(query: str) -> dict[str, str]:
    lowered = query.lower()
    if has_four_jaw_indicating_intent(lowered) and not has_cutting_data_intent(lowered):
        return category_by_slug("manual-machining")
    if "tap drill" in lowered or "tap chart" in lowered:
        return category_by_slug("tap-drill-charts")
    if re.search(r"\bm\s*\d+(?:\.\d+)?\s*(?:x|-)\s*\d+(?:\.\d+)?\b", lowered):
        return category_by_slug("tap-drill-charts")
    if re.search(r"\b(?:#?\d+|\d+/\d+|\d+\.\d+)\s*-\s*\d{2,3}\b", lowered) and any(word in lowered for word in ("tap", "thread", "drill")):
        return category_by_slug("tap-drill-charts")

    scores: dict[str, int] = {}
    for slug, keywords in CATEGORY_KEYWORDS.items():
        score = 0
        for keyword in keywords:
            if re.search(rf"(?<![a-z0-9]){re.escape(keyword)}(?![a-z0-9])", lowered):
                score += 3 if " " in keyword or "&" in keyword else 1
        if score:
            scores[slug] = score
    if not scores:
        return category_by_slug("manual-machining")
    if has_cutting_data_intent(lowered):
        scores["speeds-feeds"] = scores.get("speeds-feeds", 0) + 2
    elif max(scores, key=scores.get) == "speeds-feeds":
        scores.pop("speeds-feeds")
        if not scores:
            return category_by_slug("manual-machining")
    return category_by_slug(max(scores, key=scores.get))


def category_by_slug(slug: str) -> dict[str, str]:
    return next((category for category in CATEGORIES if category["slug"] == slug), CATEGORIES[0])


def compose_answer(conn: sqlite3.Connection, query: str, category: dict[str, str], tool_results: list[dict[str, Any]], refinement: dict[str, str] | None = None) -> dict[str, Any]:
    template = RESPONSE_TEMPLATES[category["slug"]]
    override = specialized_answer_override(query, category)
    direct_answer = override.get("direct_answer") if override else specialized_direct_answer(query, category, tool_results) or template["direct"]
    base_formulas = list(override.get("formulas", template["formulas"]) if override else template["formulas"])
    formulas = merge_formulas(base_formulas, tool_results)
    source_slugs = list(override.get("sources", template["sources"]) if override else template["sources"])
    for result in tool_results:
        source = result.get("source")
        if source and source.get("slug"):
            source_slugs.append(source["slug"])
    answer = {
        "title": override.get("title", category["name"]) if override else category["name"],
        "direct_answer": direct_answer,
        "steps": list(override.get("steps", template["steps"]) if override else template["steps"]),
        "formulas": formulas,
        "sources": lookup_sources(conn, source_slugs),
        "related_topics": list(override.get("related_topics", template["related"]) if override else template["related"]),
        "refinement_actions": build_refinement_actions(category, tool_results),
        "note": "Use this as shop guidance, then verify against the current print, tooling data, machine limits, and inspection requirements before cutting production parts.",
    }
    return apply_refinement(answer, refinement)


def build_refinement_actions(category: dict[str, str], tool_results: list[dict[str, Any]]) -> list[dict[str, str]]:
    has_tap_drill_result = any(result.get("type") == "tap_drill" for result in tool_results)
    if category["slug"] not in {"tap-drill-charts", "threading"} and not has_tap_drill_result:
        return []
    return [
        {
            "label": action["label"],
            "context": action["context"],
            "type": "material",
            "material": action["material"],
        }
        for action in TAP_THREAD_MATERIAL_ACTIONS
    ]


def normalize_refinement_context(context: str | None) -> dict[str, str] | None:
    text = (context or "").strip()
    if not text:
        return None
    lowered = text.lower()
    material = normalize_alias(text, MATERIAL_ALIASES)
    if material:
        key = "material-context"
    elif any(term in lowered for term in ("formula", "calculate", "calculation", "math", "rpm", "sfm", "feed")):
        key = "math-check"
    elif any(term in lowered for term in ("inspect", "inspection", "measure", "gage", "gauge", "first-piece", "first piece")):
        key = "inspection-checks"
    elif any(term in lowered for term in ("troubleshoot", "problem", "chatter", "wear", "finish", "bellmouth", "mistake")):
        key = "troubleshooting"
    elif any(term in lowered for term in ("plain english", "simple", "explain")):
        key = "plain-english"
    elif any(term in lowered for term in ("setup", "checklist", "dry run", "offset", "datum", "workholding")):
        key = "shop-checklist"
    else:
        key = "topic-focus"
    label = material_display_name(material) if material else REFINEMENT_LABELS[key]
    refinement = {"key": key, "label": label, "context": text}
    if material:
        refinement["material"] = material
    return refinement


def material_display_name(material: str) -> str:
    return {
        "aluminum": "Aluminum",
        "mild steel": "Mild Steel",
        "stainless steel": "Stainless",
        "brass": "Brass",
        "cast iron": "Cast Iron",
        "tool steel": "Tool Steel",
    }.get(material, material.title())


def apply_refinement(answer: dict[str, Any], refinement: dict[str, str] | None) -> dict[str, Any]:
    if not refinement:
        return answer

    key = refinement["key"]
    context = refinement["context"]
    answer["refinement"] = refinement
    answer["title"] = f"{answer['title']} - {refinement['label']}"

    if key == "material-context":
        material = refinement.get("material", context)
        answer["direct_answer"] = f"{answer['direct_answer']} For {material}, keep the handbook or chart drill size as the starting point, then tune tapping fluid, chip clearing, and thread percentage to the material and required fit."
        answer["steps"] = [
            f"Treat the selected material as {material} for this follow-up.",
            *material_threading_steps(material),
            *answer["steps"],
        ]
    elif key == "math-check":
        answer["direct_answer"] = f"{answer['direct_answer']} This pass emphasizes the arithmetic, units, and assumptions behind the recommendation."
        answer["steps"] = [
            "Write each known value with units before choosing a formula.",
            "Run the calculation and round to a practical machine setting.",
            "Compare the result with tooling manufacturer data or a shop standard before cutting.",
            *answer["steps"],
        ]
    elif key == "inspection-checks":
        answer["direct_answer"] = f"{answer['direct_answer']} This pass emphasizes how to verify the result at the machine or bench."
        answer["steps"] = [
            "Identify the print requirement, datum reference, tolerance, and finish requirement that prove the operation worked.",
            "Choose a measuring method with enough resolution and access for the feature.",
            "Inspect the first piece before removing the setup or changing offsets.",
            *answer["steps"],
        ]
    elif key == "troubleshooting":
        answer["direct_answer"] = f"{answer['direct_answer']} This pass emphasizes what to check when the result is noisy, oversized, undersized, worn, or unstable."
        answer["steps"] = [
            "Look for the symptom first: chatter, rubbing, heat, poor finish, size drift, chip packing, or rapid tool wear.",
            "Change one variable at a time so the cause is visible.",
            "Recheck workholding, tool runout, stickout, cutting data, coolant, and measurement setup before blaming the material.",
            *answer["steps"],
        ]
    elif key == "shop-checklist":
        answer["direct_answer"] = f"{answer['direct_answer']} This pass turns the answer into a setup checklist."
        answer["steps"] = [
            "Confirm the current print revision, material, units, tolerance, and finish requirement.",
            "Verify the setup, tool, holder, offsets, clearance, and measuring method before starting.",
            "Make the first cut conservatively and inspect before committing to the rest of the job.",
            *answer["steps"],
        ]
    elif key == "plain-english":
        answer["direct_answer"] = f"{answer['direct_answer']} In plain terms: decide what feature matters, choose a conservative method, make one controlled change, then verify it with the right gage or calculation."
    else:
        answer["direct_answer"] = f"{answer['direct_answer']} This pass keeps the answer focused on: {context}"
        answer["steps"] = [
            f"Use {context} as the lens for the same question.",
            "Keep the original print, material, tooling, and machine limits in view while narrowing the answer.",
            *answer["steps"],
        ]

    return answer


def material_threading_steps(material: str) -> list[str]:
    if material == "aluminum":
        return [
            "Use a sharp tap and suitable cutting fluid or mist to reduce built-up edge.",
            "Clear chips often in blind holes because aluminum can pack flutes quickly.",
        ]
    if material == "mild steel":
        return [
            "Use cutting oil and a steady feed so the tap cuts instead of rubbing.",
            "Back out or use a spiral-point or spiral-flute tap based on whether the hole is through or blind.",
        ]
    if material == "stainless steel":
        return [
            "Use a sharp tap, positive feed, and strong cutting fluid to avoid work hardening.",
            "Avoid dwelling or repeated partial starts that rub the thread instead of cutting it.",
        ]
    if material == "brass":
        return [
            "Use a tap geometry that will not grab in free-machining brass.",
            "Keep chips clear, but avoid excessive lubrication if the shop standard calls for tapping brass dry.",
        ]
    if material == "cast iron":
        return [
            "Expect powdery chips and keep abrasive dust away from slides, ways, and measuring tools.",
            "Use the shop standard for dry tapping or light lubricant based on the iron grade and tap style.",
        ]
    return ["Adjust tapping fluid, chip clearing, and tap geometry for the selected material."]


def specialized_answer_override(query: str, category: dict[str, str]) -> dict[str, Any] | None:
    if category["slug"] == "manual-machining" and has_four_jaw_indicating_intent(query):
        return {
            "title": "Manual Machining",
            "direct_answer": "To indicate a part in a 4-jaw chuck, mount the part loosely, put a dial indicator on the OD or the feature you care about, rotate the chuck by hand, find the high and low spots, and adjust opposing jaws by moving half the indicated error. Repeat until the runout is acceptable, then snug the jaws evenly and recheck after tightening.",
            "steps": [
                "Mount the part loosely in the 4-jaw chuck so it is held but still adjustable.",
                "Put a dial indicator on the OD or the feature that needs to run true.",
                "Rotate the chuck by hand and watch the indicator through a full revolution.",
                "Find the high and low spots and note the total indicated error.",
                "Adjust the opposing jaws that control that direction.",
                "Move half the indicated error, because moving the part toward center changes both the high and low readings.",
                "Repeat the rotate, read, and adjust cycle until runout is acceptable.",
                "Snug the jaws evenly without shifting the part.",
                "Recheck the indicator after tightening and make a final small correction if needed.",
            ],
            "formulas": [{"label": "4-jaw correction", "expression": "Jaw correction move = total indicated error / 2"}],
            "sources": ["machinery-handbook", "nist-dimensional-metrology"],
            "related_topics": ["4-jaw chucks", "Dial indicators", "Runout", "Lathe setup", "Inspection"],
        }
    return None


def specialized_direct_answer(query: str, category: dict[str, str], tool_results: list[dict[str, Any]]) -> str | None:
    for result_type in ("tap_drill", "feed_rate", "rpm", "rpm_factor"):
        for result in tool_results:
            if result["type"] == result_type:
                return result["summary"]
    lowered = query.lower()
    if category["slug"] == "gdt" and "true position" in lowered:
        return "True position controls how far a feature's actual location may deviate from its theoretically exact location relative to the stated datums. For holes with a diameter symbol, the tolerance zone is usually cylindrical."
    if category["slug"] == "cnc" and re.search(r"\bg5[4-9]\b", lowered):
        return "G54 through G59 are work coordinate offsets. They shift the program coordinate system from machine zero to the part setup zero, so the same program geometry can run in a defined fixture location."
    if category["slug"] == "inspection" and "bore" in lowered and ("gage" in lowered or "gauge" in lowered):
        return "Set a dial bore gage with a calibrated ring or micrometer near nominal size, rock through the bore to find the minimum reading, and compare that deviation to the set size."
    return None


def merge_formulas(base_formulas: list[dict[str, str]], tool_results: list[dict[str, Any]]) -> list[dict[str, str]]:
    formulas: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for result in tool_results:
        formula = result.get("formula")
        if formula:
            key = (formula.get("label", ""), formula.get("expression", ""))
            if key not in seen:
                formulas.append(formula)
                seen.add(key)
    for formula in base_formulas:
        key = (formula.get("label", ""), formula.get("expression", ""))
        if key not in seen:
            formulas.append(formula)
            seen.add(key)
    return formulas


def run_calculation_tools(conn: sqlite3.Connection, query: str, state: dict[str, Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    tap_drill = calculate_tap_drill(query)
    if tap_drill:
        results.append(tap_drill)
    speed_result = calculate_rpm(conn, query, state)
    if speed_result:
        results.append(speed_result)
    feed_result = calculate_feed_rate(query, speed_result)
    if feed_result:
        results.append(feed_result)
    return results


def calculate_rpm(conn: sqlite3.Connection, query: str, state: dict[str, Any]) -> dict[str, Any] | None:
    diameter = state.get("diameter_in") or extract_diameter(query.lower())
    sfm = extract_sfm(query)
    if not diameter:
        return None
    if sfm:
        rpm = sfm * 3.82 / diameter
        rounded_rpm = max(1, int(round(rpm)))
        return {"type": "rpm", "label": "RPM helper", "value": rounded_rpm, "unit": "RPM", "summary": f"At {format_number(sfm)} SFM with a {format_number(diameter)} in tool, run about {rounded_rpm} RPM.", "formula": {"label": "Calculated spindle speed", "expression": f"RPM = ({format_number(sfm)} SFM x 3.82) / {format_number(diameter)} in = {rounded_rpm} RPM"}, "source": {"slug": "machinery-handbook"}}
    if state.get("operation") == "reaming" and all(field in state for field in REQUIRED_SFM_FIELDS):
        try:
            recommendation = lookup_sfm(conn, state)
        except ValueError:
            recommendation = None
        if recommendation:
            rpm = recommendation["sfm"] * 3.82 / diameter
            rounded_rpm = max(1, int(round(rpm)))
            return {"type": "rpm", "label": "RPM helper", "value": rounded_rpm, "unit": "RPM", "summary": f"For a {format_number(diameter)} in {state['tool_material'].upper()} reamer in {state['material']} on a {state['machine']}, start around {rounded_rpm} RPM using {format_number(recommendation['sfm'])} SFM.", "formula": {"label": "Calculated spindle speed", "expression": f"RPM = ({format_number(recommendation['sfm'])} SFM x 3.82) / {format_number(diameter)} in = {rounded_rpm} RPM"}, "source": {"slug": recommendation["source_slug"]}}
    if has_speed_intent(query):
        factor = 3.82 / diameter
        return {"type": "rpm_factor", "label": "RPM helper", "summary": f"First choose an SFM for the tool and material. For a {format_number(diameter)} in tool, RPM = SFM x {format_number(factor)}. For example, 50 SFM is about {max(1, int(round(50 * factor)))} RPM.", "formula": {"label": "Spindle speed setup", "expression": f"RPM = SFM x {format_number(factor)} for a {format_number(diameter)} in tool"}, "source": {"slug": "machinery-handbook"}}
    return None


def calculate_feed_rate(query: str, rpm_result: dict[str, Any] | None) -> dict[str, Any] | None:
    rpm = extract_rpm(query)
    if rpm is None and rpm_result and rpm_result.get("type") == "rpm":
        rpm = float(rpm_result["value"])
    if rpm is None:
        return None
    chip_load = extract_chip_load(query)
    flutes = extract_flutes(query)
    if chip_load is not None and flutes is not None:
        ipm = rpm * chip_load * flutes
        return {"type": "feed_rate", "label": "Feed helper", "value": round(ipm, 3), "unit": "IPM", "summary": f"With {format_number(rpm)} RPM, {format_number(chip_load)} in/tooth, and {flutes} flutes, feed about {format_number(ipm)} IPM.", "formula": {"label": "Calculated milling feed", "expression": f"IPM = {format_number(rpm)} RPM x {format_number(chip_load)} in/tooth x {flutes} flutes = {format_number(ipm)} IPM"}, "source": {"slug": "tooling-manufacturer-data"}}
    ipr = extract_ipr(query)
    if ipr is not None:
        ipm = rpm * ipr
        return {"type": "feed_rate", "label": "Feed helper", "value": round(ipm, 3), "unit": "IPM", "summary": f"With {format_number(rpm)} RPM and {format_number(ipr)} IPR, feed about {format_number(ipm)} IPM.", "formula": {"label": "Calculated turning feed", "expression": f"IPM = {format_number(rpm)} RPM x {format_number(ipr)} IPR = {format_number(ipm)} IPM"}, "source": {"slug": "machinery-handbook"}}
    return None


def calculate_tap_drill(query: str) -> dict[str, Any] | None:
    metric = parse_metric_thread(query)
    if metric:
        chart = COMMON_TAP_DRILLS.get(metric["key"])
        if chart:
            drill, diameter = chart["drill"], chart["diameter"]
            expression = f"Metric approximation: {format_number(metric['major_mm'])} - {format_number(metric['pitch_mm'])}"
        else:
            drill_value = metric["major_mm"] - metric["pitch_mm"]
            drill = diameter = f"{format_number(drill_value)} mm"
            expression = f"Drill diameter = {format_number(metric['major_mm'])} mm - {format_number(metric['pitch_mm'])} mm = {format_number(drill_value)} mm"
        return {"type": "tap_drill", "label": "Tap drill helper", "value": drill, "unit": "drill", "summary": f"For {metric['display']}, use a {drill} tap drill ({diameter}) as a normal starting point.", "formula": {"label": "Metric tap drill", "expression": expression}, "source": {"slug": "machinery-handbook"}}
    inch = parse_inch_thread(query)
    if inch:
        chart = COMMON_TAP_DRILLS.get(inch["key"])
        if chart:
            drill, diameter = chart["drill"], chart["diameter"]
            expression = f"Inch approximation: {format_number(inch['major_in'])} - 1/{inch['tpi']}"
        else:
            drill_value = inch["major_in"] - (1 / inch["tpi"])
            drill = diameter = f"{format_number(drill_value)} in"
            expression = f"Drill diameter = {format_number(inch['major_in'])} in - (1 / {inch['tpi']}) = {format_number(drill_value)} in"
        return {"type": "tap_drill", "label": "Tap drill helper", "value": drill, "unit": "drill", "summary": f"For {inch['display']}, use a {drill} tap drill ({diameter}) as a normal starting point.", "formula": {"label": "Inch tap drill", "expression": expression}, "source": {"slug": "machinery-handbook"}}
    return None


def parse_metric_thread(query: str) -> dict[str, Any] | None:
    match = re.search(r"\bm\s*(?P<major>\d+(?:\.\d+)?)\s*(?:x|-)\s*(?P<pitch>\d+(?:\.\d+)?)\b", query, flags=re.IGNORECASE)
    if not match:
        return None
    major = float(match.group("major"))
    pitch = float(match.group("pitch"))
    if major <= 0 or pitch <= 0:
        return None
    return {"major_mm": major, "pitch_mm": pitch, "display": f"M{format_number(major)}x{format_number(pitch)}", "key": f"M{format_number(major)}X{format_number(pitch)}".upper()}


def parse_inch_thread(query: str) -> dict[str, Any] | None:
    match = re.search(r"(?<![a-z0-9#])(?P<size>#?\d+|\d+/\d+|\d+\.\d+)\s*-\s*(?P<tpi>\d{2,3})(?![a-z0-9])", query, flags=re.IGNORECASE)
    if not match:
        return None
    raw_size = match.group("size")
    tpi = int(match.group("tpi"))
    major = major_diameter_from_thread_size(raw_size)
    if major is None or tpi <= 0:
        return None
    display_size = raw_size.upper() if raw_size.startswith("#") else raw_size
    key = f"{display_size}-{tpi}"
    if key.startswith("#"):
        key = key[1:]
    return {"major_in": major, "tpi": tpi, "display": f"{display_size}-{tpi}", "key": key}


def major_diameter_from_thread_size(raw_size: str) -> float | None:
    size = raw_size.upper()
    if size.startswith("#"):
        return SCREW_MAJOR_DIAMETERS.get(size)
    if "/" in size:
        return parse_fraction(size)
    value = safe_float(size)
    if value is None:
        return None
    if value.is_integer() and f"#{int(value)}" in SCREW_MAJOR_DIAMETERS:
        return SCREW_MAJOR_DIAMETERS[f"#{int(value)}"]
    return value


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
    for field, aliases in (("machine", MACHINE_ALIASES), ("material", MATERIAL_ALIASES), ("tool_material", TOOL_ALIASES), ("operation", OPERATION_ALIASES)):
        value = normalize_alias(str(raw_state.get(field, "")), aliases)
        if value:
            state[field] = value
    coolant = normalize_coolant(raw_state.get("coolant"))
    if coolant is not None:
        state["coolant"] = coolant
    return state


def parse_message(message: str) -> dict[str, Any]:
    lowered = (message or "").strip().lower()
    return {"diameter_in": extract_diameter(lowered), "operation": normalize_alias(lowered, OPERATION_ALIASES), "machine": normalize_alias(lowered, MACHINE_ALIASES), "material": normalize_alias(lowered, MATERIAL_ALIASES), "tool_material": normalize_alias(lowered, TOOL_ALIASES), "coolant": normalize_coolant(lowered), "sfm": extract_sfm(lowered), "rpm": extract_rpm(lowered), "flutes": extract_flutes(lowered), "chip_load": extract_chip_load(lowered)}


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
    false_patterns = ("no coolant", "without coolant", "dry", "no flood", "no mist", "no oil", "no", "false", "off")
    true_patterns = ("with coolant", "coolant", "flood", "mist", "oil", "yes", "true", "on")
    if any(re.search(rf"(?<![a-z0-9]){re.escape(pattern)}(?![a-z0-9])", text) for pattern in false_patterns):
        return False
    if any(re.search(rf"(?<![a-z0-9]){re.escape(pattern)}(?![a-z0-9])", text) for pattern in true_patterns):
        return True
    return None


def extract_diameter(text: str) -> float | None:
    patterns = [r"(?<![a-z0-9.])(?P<value>\d+\.\d+|\.\d+)\s*(?:in(?:ch(?:es)?)?|\")?", r"\b(?:diameter|dia|size)\s*(?P<value>\d+)\s*(?:in(?:ch(?:es)?)?|\")", r"(?<![a-z0-9.])(?P<value>\d+)\s*(?:in(?:ch(?:es)?)|\")"]
    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            value = safe_float(match.group("value"))
            if value is not None and 0.01 <= value <= 6:
                return value
    fraction_match = re.search(r"(?<!\d)(?P<num>\d{1,2})\s*/\s*(?P<den>\d{1,2})(?!\d)", text)
    if fraction_match:
        value = parse_fraction(f"{fraction_match.group('num')}/{fraction_match.group('den')}")
        if value is not None and 0.01 <= value <= 6:
            return value
    return None


def extract_sfm(text: str) -> float | None:
    match = re.search(r"(?P<value>\d+(?:\.\d+)?)\s*(?:sfm|surface\s+feet)", text, flags=re.IGNORECASE)
    value = safe_float(match.group("value")) if match else None
    return value if value is not None and 1 <= value <= 5000 else None


def extract_rpm(text: str) -> float | None:
    match = re.search(r"(?P<value>\d+(?:\.\d+)?)\s*(?:rpm|rev/min)", text, flags=re.IGNORECASE)
    value = safe_float(match.group("value")) if match else None
    return value if value is not None and 1 <= value <= 100000 else None


def extract_flutes(text: str) -> int | None:
    match = re.search(r"(?P<value>\d+)\s*(?:flute|flutes|fl\b)", text, flags=re.IGNORECASE)
    if not match:
        return None
    value = int(match.group("value"))
    return value if 1 <= value <= 20 else None


def extract_chip_load(text: str) -> float | None:
    match = re.search(r"(?P<value>\d*\.\d+|\d+\.\d+)\s*(?:ipt|in/tooth|inch/tooth|chip\s*load)", text, flags=re.IGNORECASE)
    value = safe_float(match.group("value")) if match else None
    return value if value is not None and 0 < value <= 0.25 else None


def extract_ipr(text: str) -> float | None:
    match = re.search(r"(?P<value>\d*\.\d+|\d+\.\d+)\s*(?:ipr|in/rev|inch/rev|feed\s*per\s*rev)", text, flags=re.IGNORECASE)
    value = safe_float(match.group("value")) if match else None
    return value if value is not None and 0 < value <= 0.25 else None


def has_speed_intent(query: str) -> bool:
    return any(term in query.lower() for term in ("rpm", "sfm", "speed", "spin", "feed", "chip load"))


def has_cutting_data_intent(query: str) -> bool:
    lowered = query.lower()
    return any(re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", lowered) for term in CUTTING_DATA_TERMS)


def has_four_jaw_indicating_intent(query: str) -> bool:
    lowered = query.lower()
    has_four_jaw = re.search(r"(?<![a-z0-9])(?:4|four)\s*-?\s*jaw(?![a-z0-9])", lowered) is not None
    has_chuck = re.search(r"(?<![a-z0-9])chuck(?:s|ing)?(?![a-z0-9])", lowered) is not None
    has_centering = any(term in lowered for term in ("centering", "center a", "center the", "center my", "center this"))
    has_setup_term = any(term in lowered for term in FOUR_JAW_INDICATING_TERMS)
    return has_four_jaw or has_setup_term or has_centering or (has_chuck and (has_setup_term or has_centering))


def lookup_sfm(conn: sqlite3.Connection, state: dict[str, Any]) -> sqlite3.Row:
    row = conn.execute(
        """
        SELECT r.sfm, r.source_id, s.slug AS source_slug, s.title AS source_title,
               s.publisher AS source_publisher, s.url AS source_url, s.note AS source_note,
               s.is_placeholder
        FROM sfm_recommendations r
        JOIN sources s ON s.id = r.source_id
        WHERE r.operation = ? AND r.material = ? AND r.tool_material = ? AND r.coolant = ? AND r.machine = ?
        """,
        ("reaming", state["material"], state["tool_material"], 1 if state["coolant"] else 0, state["machine"]),
    ).fetchone()
    if row is None:
        raise ValueError("No local SFM row matches the selected inputs.")
    return row


def lookup_sources(conn: sqlite3.Connection, slugs: list[str]) -> list[dict[str, Any]]:
    ordered_slugs = list(dict.fromkeys(slug for slug in slugs if slug))
    if not ordered_slugs:
        return []
    placeholders = ",".join("?" for _ in ordered_slugs)
    rows = conn.execute(f"SELECT slug, title, publisher, url, note, is_placeholder FROM sources WHERE slug IN ({placeholders})", ordered_slugs).fetchall()
    by_slug = {row["slug"]: row for row in rows}
    return [{"slug": slug, "title": by_slug[slug]["title"], "publisher": by_slug[slug]["publisher"], "url": by_slug[slug]["url"], "note": by_slug[slug]["note"], "is_placeholder": bool(by_slug[slug]["is_placeholder"])} for slug in ordered_slugs if slug in by_slug]


def public_state(state: dict[str, Any]) -> dict[str, Any]:
    allowed = {"diameter_in", "machine", "material", "tool_material", "coolant", "operation", "sfm", "rpm", "flutes", "chip_load"}
    return {key: value for key, value in state.items() if key in allowed}


def format_number(value: float) -> str:
    if math.isclose(value, round(value)):
        return str(int(round(value)))
    return f"{value:.4f}".rstrip("0").rstrip(".")


def parse_fraction(value: str) -> float | None:
    parts = value.split("/")
    if len(parts) != 2:
        return None
    try:
        numerator = int(parts[0])
        denominator = int(parts[1])
    except ValueError:
        return None
    return numerator / denominator if denominator else None


def safe_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


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
    return [{"kind": row["kind"], "ref_id": row["ref_id"], "title": row["title"], "snippet": row["snippet"]} for row in rows]
