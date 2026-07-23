from __future__ import annotations

from pathlib import Path

import nbformat

from valorant_ratings.notebooks import NOTEBOOK_NAMES, build_notebook_documents


def test_notebook_suite_is_generated_with_valid_nbformat(tmp_path: Path) -> None:
    documents = build_notebook_documents(
        snapshot=tmp_path / "snapshot",
        development=tmp_path / "development",
    )

    assert tuple(documents) == NOTEBOOK_NAMES
    for notebook in documents.values():
        nbformat.validate(notebook)
        assert notebook.nbformat == 4
        assert notebook.cells[0].cell_type == "markdown"
        assert any(cell.cell_type == "code" for cell in notebook.cells)


def test_rating_explorer_exposes_requested_ranking_and_lookup_helpers(tmp_path: Path) -> None:
    documents = build_notebook_documents(
        snapshot=tmp_path / "snapshot",
        development=tmp_path / "development",
    )
    explorer = documents["07_rating_explorer.ipynb"]
    source = "\n".join(cell.source for cell in explorer.cells)

    for index, cell in enumerate(explorer.cells):
        if cell.cell_type == "code":
            compile(cell.source, f"07_rating_explorer.ipynb:{index}", "exec")

    for helper in (
        "top_teams_global",
        "top_teams_by_map",
        "top_players_by_map",
        "top_players_by_agent",
        "show_player_map_ratings",
        "show_player_agent_ratings",
        "show_player_ratings",
    ):
        assert f"def {helper}" in source
    assert "TOP_N = 10" in source
    assert "PLAYER_QUERY" in source
    assert "ALLOWED_SUPPORT" in source
    assert 'PLAYER_AGENT_VIEW = "demonstrated"' in source
    assert "PLAYER_UNCERTAINTY_PENALTY = 0.5" in source
    assert "MIN_AGENT_USE_PROBABILITY" in source
    assert "SCORING_V5" in source
    assert source.index("SCORING_V5") < source.index("SCORING_V4")
    assert 'PLAYER_METRIC = "performance_z_score"' in source
    assert "def _bridge_legacy_vpm_units" in source
    assert "* 24.0" in source
    assert '"performance_rounds_per_24"' in source
    assert '"performance_z_score"' in source
    assert 'player_agent_ratings_demonstrated.parquet' in source
    assert 'player_agent_ratings_forced_counterfactual.parquet' in source
    assert "def _player_agent_view" in source
    assert "agent_view=None" in source
    assert 'print("Active player-agent view:"' in source
    assert '"maps_played"' in source
    assert '"predicted_agent_use_probability"' in source
    assert '"publication_view"' in source
    assert '"unique demonstrated player-agent cells"' in source
    assert '"unique forced-counterfactual player-agent cells"' in source
    assert '"unique player-agent publication cells"' in source
    assert '"forced-counterfactual cells are explicitly flagged"' in source
    assert "sys.path.insert(0, str(SOURCE_ROOT))" in source
    assert "sys.version_info[:2] != (3, 12)" in source
    assert explorer.metadata.kernelspec.name == "valorant-ratings"
    assert explorer.metadata.kernelspec.display_name == "Python 3.12 (Valorant Ratings)"
