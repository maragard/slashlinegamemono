import asyncio
import json
import unittest
import uuid

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
        server.init_db(csv_path="")
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
            INSERT INTO todays_player
            (mode, player_id, name, team, position, debut_year, retirement_year, avg, obp, slg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            ("all-time", 101, "Sam Same", "TEAM A", "Outfielder", "1948", "1970", ".300", ".400", ".500"),
        )
        self.connection.commit()
        server.get_eligible_names()
        server.get_eligible_names("30-team-era")

    def tearDown(self):
        self.connection.close()
        server.DB_URI = self.original_db_uri
        server.GLOBAL_NAMES_CACHE = self.original_names_cache

    def test_suggestions_distinguish_players_with_identical_names(self):
        response = server.suggest_names(StubRequest(), q="Sam")
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
