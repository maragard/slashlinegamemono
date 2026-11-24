import asyncio
import json
import os
import unittest
import uuid
from unittest.mock import patch

from fastapi import HTTPException

from fastapi import HTTPException

import server


class StubRequest:
    def __init__(self, headers=None, payload=None):
        self.headers = headers or {}
        self.payload = payload

    async def json(self):
        return self.payload


class PlayerSuggestionTests(unittest.TestCase):
    def setUp(self):
        self.original_db_uri = server.DB_URI
        self.original_names_cache = server.GLOBAL_NAMES_CACHE
        server.DB_URI = f"file:test_players_{uuid.uuid4().hex}?mode=memory&cache=shared"
        self.connection = server._connect_db()
        with patch.dict(os.environ, {"PLAYERS_CSV_BLOB_URL": ""}):
            asyncio.run(server.init_db(csv_path=os.devnull))
        self.connection.executemany(
            """
            INSERT INTO players
            (id, name, team, position, debut_year, retirement_year, plate_apps, avg, obp, slg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (101, "Sam Same", "TEAM A", "Outfielder", "1948", "1970", "1200", ".300", ".400", ".500"),
                (102, "Sam Same", "TEAM B", "Outfielder", "1980", "1990", "1200", ".250", ".350", ".450"),
                (103, "Recent Player", "TEAM C", "Pitcher", "2000", "Not Found", "1200", ".200", ".300", ".400"),
                (104, "Era Spanning Player", "TEAM D", "Shortstop", "1995", "2014", "1200", ".300", ".400", ".500"),
                (105, "Pre Era Player", "TEAM E", "Catcher", "1985", "1997", "1200", ".250", ".350", ".450"),
            ],
        )
        self.connection.execute(
            """
            INSERT INTO todays_players
            (mode, player_id, name, team, position, debut_year, retirement_year, avg, obp, slg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            ("all-time", 101, "Sam Same", "TEAM A", "Outfielder", "1948", "1970", "0.300", "0.400", "0.500"),
        )
        self.connection.commit()
        server.get_eligible_names()
        server.get_eligible_names("30-team-era")

    def tearDown(self):
        self.connection.close()
        server.DB_URI = self.original_db_uri
        server.GLOBAL_NAMES_CACHE = self.original_names_cache

    def test_suggestions_distinguish_players_with_identical_names(self):
        response = server.suggest_names(StubRequest(), q="Sam", mode="all-time")
        suggestions = json.loads(response.body)

        self.assertEqual(
            [suggestion["id"] for suggestion in suggestions],
            [101, 102],
        )

    def test_year_hints_distinguish_close_decade_and_exact_matches(self):
        target = ("Target", "TEAM A", "Shortstop", "1998", "2005")
        guess = ("Guess", "TEAM B", "Outfielder", "2001", "2008")

        hints = server._player_hints(guess, target)

        self.assertEqual(hints["debut_year"], "close")
        self.assertEqual(hints["retirement_year"], "close")
        self.assertEqual(server._player_hints(
            ("Guess", "TEAM B", "Outfielder", "1994", "2015"),
            target,
        )["debut_year"], "decade")
        self.assertEqual(server._player_hints(
            ("Guess", "TEAM B", "Outfielder", "1998", "2005"),
            target,
        )["debut_year"], "correct")

    def test_team_overlap_ignores_multi_team_summary_markers(self):
        target = ("Target", "NYY,2TM", "Shortstop", "1998", "2005")
        same_team_set = ("Guess", "2TM,NYY", "Outfielder", "2001", "2008")
        shared_summary_only = ("Guess", "2TM,BOS", "Outfielder", "2001", "2008")

        self.assertEqual(server._player_hints(same_team_set, target)["team"], "correct")
        self.assertIsNone(server._player_hints(shared_summary_only, target)["team"])

    def test_position_hint_ignores_hidden_pinch_hitter_label(self):
        target = ("Russ Nixon", "MIN,2TM,BOS,CLE", "Catcher and Pinch Hitter", "1957", "1968")
        catcher_guesses = [
            ("Jim Pagliaroni", "SEP,OAK,BOS,PIT,2TM", "Catcher", "1955", "1969"),
            ("Sammy White", "PHI,BOS,MLN", "Catcher", "1951", "1962"),
            ("Tom Haller", "SFG,DET,LAD", "Catcher", "1961", "1972"),
        ]

        for guess in catcher_guesses:
            with self.subTest(player=guess[0]):
                self.assertEqual(server._player_hints(guess, target)["position"], "correct")

    def test_difficulty_rating_is_returned_for_the_selected_target(self):
        response = asyncio.run(server.starting_info("all-time"))
        start_data = json.loads(response.body)
        expected_rating = server._difficulty_ratings("all-time")[101]

        self.assertEqual(start_data["hint"], ".300/.400/.500")
        self.assertEqual(start_data["difficulty_rating"], expected_rating)
        self.assertGreaterEqual(start_data["difficulty_rating"], 1)
        self.assertLessEqual(start_data["difficulty_rating"], 10)

    def test_recent_player_with_strong_stats_is_not_penalized_for_shorter_career(self):
        self.connection.executemany(
            """
            INSERT INTO players
            (id, name, team, position, debut_year, retirement_year,
             plate_apps, avg, obp, slg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (106, "Strong Recent Player", "TEAM F", "Outfielder", "2022", "Not Found", "5000", ".310", ".400", ".600"),
                (107, "Old Low-PA Player", "TEAM G", "Catcher", "1880", "1885", "500", ".150", ".200", ".250"),
            ],
        )
        self.connection.commit()

        ratings = server._difficulty_ratings("all-time", current_year=2026)

        self.assertLess(ratings[106], ratings[107])

    def test_suggestions_return_distinct_player_records_within_mode(self):
        response = server.suggest_names(
            StubRequest(),
            q="Era",
            mode="30-team-era",
        )
        suggestions = json.loads(response.body)

        self.assertEqual(
            suggestions,
            [{
                "id": 104,
                "name": "Era Spanning Player",
                "position": "Shortstop",
                "debut": "1995",
                "retirement": "2014",
                "team": "TEAM D",
            }],
        )

    def test_id_guesses_validate_the_mode_and_match_exact_players(self):
        correct = asyncio.run(server.guess_player(StubRequest(payload={
            "id": 101,
            "mode": "all-time",
        })))
        incorrect = asyncio.run(server.guess_player(StubRequest(payload={
            "id": 102,
            "mode": "all-time",
        })))
        with self.assertRaises(HTTPException):
            asyncio.run(server.guess_player(StubRequest(payload={
                "id": 105,
                "mode": "30-team-era",
            })))

        self.assertTrue(json.loads(correct.body)["success"])
        self.assertFalse(json.loads(incorrect.body)["success"])

    def test_mode_pools_include_players_active_during_the_era(self):
        for mode, expected_count in (
            ("all-time", 5),
            ("post-integration", 5),
            ("30-team-era", 2),
        ):
            predicate, parameters = server._pool_predicate(mode)
            count = self.connection.execute(
                f"SELECT COUNT(*) FROM players WHERE {predicate}",
                parameters,
            ).fetchone()[0]
            self.assertEqual(count, expected_count)

        predicate, parameters = server._pool_predicate("30-team-era")
        eligible_ids = {
            row[0]
            for row in self.connection.execute(
                f"SELECT id FROM players WHERE {predicate}",
                parameters,
            )
        }
        self.assertIn(104, eligible_ids)
        self.assertNotIn(105, eligible_ids)

    def test_selected_player_id_is_stored_for_the_daily_target(self):
        server.select_new_player()
        target = server.load_current_player()

        self.assertIn(target[0], (102, 103, 104, 105))
        self.assertEqual(target[1], {
            102: "Sam Same",
            103: "Recent Player",
            104: "Era Spanning Player",
            105: "Pre Era Player",
        }[target[0]])


if __name__ == "__main__":
    unittest.main()
