#!/usr/bin/env python3
"""
Saarthi Campus Survey CSV -> Graph JSON Converter.

Converts physical campus survey spreadsheets into schema-validated JSON graphs
without fabricating or hallucinating spatial data.
"""

import csv
import json
import os
import sys
from typing import Any, Dict, List, Tuple


VALID_NODE_TYPES = {
    "entrance",
    "room",
    "junction",
    "elevator",
    "stairs",
    "landmark",
    "restroom",
}


def parse_survey_csv(csv_path: str, campus_name: str = "Surveyed University Campus") -> Dict[str, Any]:
    """Parse a campus survey CSV containing NODES and EDGES sections."""
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Survey CSV file not found: {csv_path}")

    current_section = None
    node_rows: List[Dict[str, str]] = []
    edge_rows: List[Dict[str, str]] = []

    with open(csv_path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row or not any(field.strip() for field in row):
                continue

            first_col = row[0].strip()
            if first_col.startswith("#"):
                continue

            if first_col == "SECTION: NODES":
                current_section = "NODES"
                continue
            elif first_col == "SECTION: EDGES":
                current_section = "EDGES"
                continue

            if current_section == "NODES":
                if first_col.lower() == "id":  # header row
                    headers_nodes = [c.strip() for c in row]
                    continue
                node_rows.append(dict(zip(headers_nodes, [c.strip() for c in row])))

            elif current_section == "EDGES":
                if first_col.lower() == "from":  # header row
                    headers_edges = [c.strip() for c in row]
                    continue
                edge_rows.append(dict(zip(headers_edges, [c.strip() for c in row])))

    if not node_rows:
        raise ValueError("No valid node entries found in survey CSV.")

    # 1. Validate & structure nodes
    nodes: List[Dict[str, Any]] = []
    node_id_set = set()

    for r in node_rows:
        nid = r.get("id", "").strip()
        if not nid:
            continue
        if nid in node_id_set:
            raise ValueError(f"Duplicate node ID detected: '{nid}'")
        node_id_set.add(nid)

        ntype = r.get("type", "room").strip().lower()
        if ntype not in VALID_NODE_TYPES:
            raise ValueError(f"Invalid node type '{ntype}' for node '{nid}'. Valid types: {VALID_NODE_TYPES}")

        floor = int(r.get("floor", "0"))
        raw_aliases = r.get("ocr_aliases", "")
        aliases = [a.strip() for a in raw_aliases.split(";") if a.strip()]

        node_obj = {
            "id": nid,
            "label": r.get("label", nid),
            "type": ntype,
            "building": r.get("building", "Main Campus"),
            "floor": floor,
            "ocr_aliases": aliases,
            "tactile_cue": r.get("tactile_cue", ""),
        }
        nodes.append(node_obj)

    # 2. Validate & structure edges
    edges: List[Dict[str, Any]] = []
    for r in edge_rows:
        src = r.get("from", "").strip()
        dst = r.get("to", "").strip()
        if not src or not dst:
            continue

        if src not in node_id_set:
            raise ValueError(f"Edge 'from' node '{src}' does not exist in NODES section.")
        if dst not in node_id_set:
            raise ValueError(f"Edge 'to' node '{dst}' does not exist in NODES section.")

        dist = float(r.get("distance_meters", "1.0"))
        has_stairs = r.get("has_stairs", "false").strip().lower() in ("true", "1", "yes")

        raw_hazards = r.get("hazards", "")
        hazards = [h.strip() for h in raw_hazards.split(";") if h.strip()]

        edge_obj = {
            "from": src,
            "to": dst,
            "distance_meters": dist,
            "has_stairs": has_stairs,
            "spoken_instruction": r.get("spoken_instruction", f"Walk to {dst}."),
            "tactile_guidance": r.get("tactile_guidance", ""),
            "hazards": hazards,
        }
        edges.append(edge_obj)

    return {
        "version": "1.0.0",
        "campus_name": campus_name,
        "is_sample_demo_data": False,
        "nodes": nodes,
        "edges": edges,
    }


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: python scripts/csv_to_campus_graph.py <input_survey.csv> <output_graph.json> [campus_name]")
        sys.exit(1)

    csv_in = sys.argv[1]
    json_out = sys.argv[2]
    name = sys.argv[3] if len(sys.argv) > 3 else "Surveyed Campus"

    try:
        graph = parse_survey_csv(csv_in, campus_name=name)
        os.makedirs(os.path.dirname(os.path.abspath(json_out)), exist_ok=True)
        with open(json_out, "w", encoding="utf-8") as f:
            json.dump(graph, f, indent=2)
        print(f"Successfully generated campus graph at '{json_out}' with {len(graph['nodes'])} nodes and {len(graph['edges'])} edges.")
    except Exception as exc:
        print(f"Error parsing survey CSV: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
