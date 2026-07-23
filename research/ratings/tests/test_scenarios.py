from __future__ import annotations

from dataclasses import replace

import pandas as pd
import pytest

from valorant_ratings.agent_selection import AgentSelectionModel
from valorant_ratings.contracts import PlayerRatingQuery, TeammateAssignment
from valorant_ratings.player import HierarchicalPlayerModel
from valorant_ratings.scenario import ScenarioEngine
from valorant_ratings.synthetic import generate_synthetic_player_data


@pytest.fixture(scope="module")
def scenario_fixture():
    synthetic = generate_synthetic_player_data(n_maps=130, random_state=83)
    player_model = HierarchicalPlayerModel(backfit_iterations=2).fit(synthetic.frame)
    selection_model = AgentSelectionModel(random_state=3).fit(synthetic.frame)
    maps = tuple(synthetic.frame["map_name"].drop_duplicates().iloc[:3])
    engine = ScenarioEngine(
        player_model,
        selection_model,
        active_maps=maps,
        current_patch=str(synthetic.frame.iloc[-1]["patch"]),
        composition_samples=0,
    )
    latest = synthetic.frame["timestamp"].max()
    as_of = pd.Timestamp(latest.value + 86_400_000_000_000, unit="ns", tz="UTC").to_pydatetime()
    player_id = int(synthetic.frame.iloc[-1]["player_id"])
    return synthetic, player_model, selection_model, engine, as_of, player_id


def test_standardized_rating_equals_equal_active_map_marginalization(scenario_fixture):
    _, _, _, engine, as_of, player_id = scenario_fixture
    overall_query = PlayerRatingQuery(as_of=as_of, player_id=player_id)
    overall = engine.standardize(overall_query)
    map_ratings = [engine.rate(replace(overall_query, map_name=map_name)) for map_name in engine.active_maps]

    assert overall.performance_mean == pytest.approx(
        sum(item.performance_mean for item in map_ratings) / len(map_ratings),
        abs=1e-10,
    )


def test_identical_scenario_has_exact_zero_delta(scenario_fixture):
    _, _, _, engine, as_of, player_id = scenario_fixture
    query = PlayerRatingQuery(as_of=as_of, player_id=player_id, map_name=engine.active_maps[0])
    comparison = engine.compare(query, query)
    assert comparison.performance_delta == 0.0
    assert comparison.contribution_delta == 0.0
    assert comparison.team_win_probability_delta == 0.0
    assert comparison.uncertainty_of_delta == 0.0


def test_teammate_order_does_not_change_composition_prediction(scenario_fixture):
    synthetic, _, _, engine, as_of, _ = scenario_fixture
    final_map = int(synthetic.frame["map_id"].max())
    side = synthetic.frame.loc[synthetic.frame["map_id"] == final_map].groupby("team_id").head(5)
    team_id = int(side.iloc[0]["team_id"])
    side = side.loc[side["team_id"] == team_id]
    focal = side.iloc[0]
    teammates = tuple(
        TeammateAssignment(player_id=int(row.player_id), agent=row.agent)
        for row in side.iloc[1:].itertuples(index=False)
    )
    first = PlayerRatingQuery(
        as_of=as_of,
        player_id=int(focal["player_id"]),
        team_id=team_id,
        map_name=str(focal["map_name"]),
        agent=str(focal["agent"]),
        teammate_assignments=teammates,
    )
    second = replace(first, teammate_assignments=tuple(reversed(teammates)))

    assert engine.rate(first).performance_mean == pytest.approx(engine.rate(second).performance_mean, abs=1e-12)


def test_agent_swap_changes_only_the_requested_input(scenario_fixture):
    synthetic, _, _, engine, as_of, _ = scenario_fixture
    final_map = int(synthetic.frame["map_id"].max())
    side = synthetic.frame.loc[synthetic.frame["map_id"] == final_map].groupby("team_id").head(5)
    team_id = int(side.iloc[0]["team_id"])
    side = side.loc[side["team_id"] == team_id]
    focal = side.iloc[0]
    teammates = tuple(
        TeammateAssignment(player_id=int(row.player_id), agent=row.agent)
        for row in side.iloc[1:].itertuples(index=False)
    )
    query = PlayerRatingQuery(
        as_of=as_of,
        player_id=int(focal["player_id"]),
        team_id=team_id,
        map_name=str(focal["map_name"]),
        agent=str(focal["agent"]),
        teammate_assignments=teammates,
    )
    unused_agent = next(
        agent
        for agent in engine.agent_selection_model.agents_
        if agent.casefold() not in {item.agent.casefold() for item in teammates}
        and agent.casefold() != query.agent.casefold()
    )
    changed = engine.with_agent_swap(query, player_id=query.player_id, new_agent=unused_agent)

    before = query.to_dict()
    after = changed.to_dict()
    changed_fields = {key for key in before if before[key] != after[key]}
    assert changed_fields == {"agent"}


def test_sampled_compositions_always_have_five_unique_agents(scenario_fixture):
    _, player_model, selection_model, engine, _, player_id = scenario_fixture
    team_id = player_model.player_last_team_[player_id]
    roster = player_model.roster_for_team(team_id)
    samples = selection_model.sample_compositions(roster, engine.active_maps[0], n=60)
    assert samples
    assert all(selection_model.is_legal_composition(sample.assignments) for sample in samples)


def test_declared_agent_casing_preserves_historical_selection_signal(scenario_fixture):
    synthetic, _, _, _, _, player_id = scenario_fixture
    observed = tuple(str(agent) for agent in synthetic.frame["agent"].unique())
    declared = tuple(agent.title() for agent in observed)
    model = AgentSelectionModel(legal_agents=declared).fit(synthetic.frame)
    history = synthetic.frame.loc[synthetic.frame["player_id"] == player_id]
    most_used = str(history["agent"].value_counts().index[0])
    probabilities = model.predict_proba(
        player_id,
        str(history.iloc[-1]["map_name"]),
    )

    assert set(probabilities) == set(declared)
    assert probabilities[most_used.title()] > min(probabilities.values())
    assert sum(probabilities.values()) == pytest.approx(1.0)


def test_agent_alias_punctuation_uses_declared_canonical_name(scenario_fixture):
    synthetic, _, _, _, _, _ = scenario_fixture
    variant = synthetic.frame.copy()
    variant.loc[variant["agent"] == "KAY/O", "agent"] = "kayo"
    declared = tuple(str(agent) for agent in synthetic.frame["agent"].unique())
    model = AgentSelectionModel(legal_agents=declared).fit(variant)

    assert "KAY/O" in model.global_counts_
    assert "kayo" not in model.global_counts_
    assert model.global_counts_["KAY/O"] == int((variant["agent"] == "kayo").sum())


def test_forced_duplicate_agents_are_rejected(scenario_fixture):
    _, player_model, selection_model, engine, _, player_id = scenario_fixture
    roster = player_model.roster_for_team(player_model.player_last_team_[player_id])
    with pytest.raises(ValueError, match="duplicate agents"):
        selection_model.sample_compositions(
            roster,
            engine.active_maps[0],
            n=1,
            forced_assignments={roster[0]: "Jett", roster[1]: "Jett"},
        )
