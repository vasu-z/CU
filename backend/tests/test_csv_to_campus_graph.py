import os
import sys
import tempfile
import pytest

# Add repository root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from scripts.csv_to_campus_graph import parse_survey_csv


def test_parse_campus_survey_template() -> None:
    """Verifies that the canonical survey template parses cleanly without errors."""
    template_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "docs", "campus_survey_template.csv")
    )
    assert os.path.exists(template_path)

    graph = parse_survey_csv(template_path, campus_name="Test University")
    assert graph["campus_name"] == "Test University"
    assert len(graph["nodes"]) >= 8
    assert len(graph["edges"]) >= 10

    # Verify node fields
    node_ids = {n["id"] for n in graph["nodes"]}
    assert "entrance_main" in node_ids
    assert "elevator_gf" in node_ids
    assert "room_201" in node_ids

    # Verify edge connections and stairs flags
    stair_edges = [e for e in graph["edges"] if e["has_stairs"]]
    assert len(stair_edges) >= 2


def test_reject_duplicate_node_ids() -> None:
    """Raises ValueError when duplicate node IDs are detected."""
    csv_content = """SECTION: NODES
id,label,type,building,floor,ocr_aliases,tactile_cue
room_101,Room 101,room,Building A,0,"",None
room_101,Duplicate 101,room,Building A,0,"",None

SECTION: EDGES
from,to,distance_meters,has_stairs,spoken_instruction,tactile_guidance,hazards
"""
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".csv") as tf:
        tf.write(csv_content)
        tf_path = tf.name

    try:
        with pytest.raises(ValueError, match="Duplicate node ID detected"):
            parse_survey_csv(tf_path)
    finally:
        os.unlink(tf_path)


def test_reject_invalid_edge_references() -> None:
    """Raises ValueError when an edge points to a non-existent node."""
    csv_content = """SECTION: NODES
id,label,type,building,floor,ocr_aliases,tactile_cue
room_101,Room 101,room,Building A,0,"",None

SECTION: EDGES
from,to,distance_meters,has_stairs,spoken_instruction,tactile_guidance,hazards
room_101,ghost_room,10.0,false,"Walk to ghost room.","",""
"""
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".csv") as tf:
        tf.write(csv_content)
        tf_path = tf.name

    try:
        with pytest.raises(ValueError, match="does not exist in NODES section"):
            parse_survey_csv(tf_path)
    finally:
        os.unlink(tf_path)
