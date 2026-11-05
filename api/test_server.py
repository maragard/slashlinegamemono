import sqlite3
import unittest

from fastapi import HTTPException
from server import (
    GAME_MODES,
    _connect_db,
    _player_hints,
    _player_info,
    _pool_predicate,
    get_revealed_player,
    init_db,
    load_current_player,
    select_new_player,
)


class PlayerHintsTests(unittest.TestCase):
    def test_player_info_includes_unique_id_and_disambiguating_details(self):
        player = (
            "Bill Hallman",
            "MLA,CHW,PIT",
            "Outfielder",
            "1901",
            "1907",
            "1315",
            "0.235",
            "0.311",
            "0.303",
        )

        self.assertEqual(
            _player_info(1695, player),
            {
                "id": 1695,
                "name": "Bill Hallman",
                "team": "MLA,CHW,PIT",
                "position": "Outfielder",
                "debut_year": "1901",
                "retirement_year": "1907",
                "plate_apps": "1315",
                "avg": "0.235",
                "obp": "0.311",
                "slg": "0.303",
            },
        )

    def test_exact_years_and_full_position_and_team_matches(self):
        target = ("Target", "NYY, BOS", "Catcher and First Baseman", "1998", "2008")
        guess = ("Guess", "BOS,NYY", "First Baseman, Catcher", "1998", "2008")

        self.assertEqual(
            _player_hints(guess, target),
            {
                "debut_year": "correct",
                "retirement_year": "correct",
                "position": "correct",
                "team": "correct",
            },
        )

    def test_decade_and_partial_position_and_team_matches(self):
        target = ("Target", "NYY,BOS", "Catcher and First Baseman", "1998", "2008")
        guess = ("Guess", "BOS,CHW", "First Baseman and Shortstop", "1993", "2015")

        self.assertEqual(
            _player_hints(guess, target),
            {
                "debut_year": "decade",
                "retirement_year": None,
                "position": "partial",
                "team": "partial",
            },
        )


class GameModeTests(unittest.TestCase):
    def test_modes_define_expected_debut_year_ranges(self):
        self.assertEqual(GAME_MODES["all-time"]["years"], "1871–Present (all players)")
        self.assertEqual(GAME_MODES["post-integration"]["years"], "1950–Present")
        self.assertEqual(GAME_MODES["30-team-era"]["years"], "1998–Present")

    def test_pool_filters_include_the_starting_year(self):
        connection = sqlite3.connect(":memory:")
        connection.execute("CREATE TABLE players (debut_year TEXT)")
        connection.executemany(
            "INSERT INTO players (debut_year) VALUES (?)",
            [("1949",), ("1950",), ("1997",), ("1998",)],
        )

        for mode, expected in (
            ("all-time", ["1949", "1950", "1997", "1998"]),
            ("post-integration", ["1950", "1997", "1998"]),
            ("30-team-era", ["1998"]),
        ):
            predicate, parameters = _pool_predicate(mode)
            rows = connection.execute(
                f"SELECT debut_year FROM players WHERE {predicate} ORDER BY debut_year",
                parameters,
            ).fetchall()
            self.assertEqual([row[0] for row in rows], expected)
        connection.close()

    def test_unknown_mode_is_rejected(self):
        with self.assertRaises(HTTPException):
            _pool_predicate("unknown")

    def test_modes_have_distinct_players_and_reset_independently(self):
        database = _connect_db()
        try:
            init_db()
            for mode in GAME_MODES:
                select_new_player(mode)
            initial_players = {
                mode: load_current_player(mode)[0]
                for mode in GAME_MODES
            }
            self.assertEqual(len(set(initial_players.values())), len(GAME_MODES))
            for mode, player_id in initial_players.items():
                revealed = get_revealed_player(mode)
                self.assertEqual(revealed["id"], player_id)
                self.assertTrue(revealed["name"])
                self.assertIn("avg", revealed)
                self.assertIn("plate_apps", revealed)

            select_new_player("post-integration")
            reset_players = {
                mode: load_current_player(mode)[0]
                for mode in GAME_MODES
            }

            self.assertNotEqual(
                initial_players["post-integration"],
                reset_players["post-integration"],
            )
            self.assertEqual(initial_players["all-time"], reset_players["all-time"])
            self.assertEqual(
                initial_players["30-team-era"],
                reset_players["30-team-era"],
            )
        finally:
            database.close()
