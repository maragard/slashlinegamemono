import asyncio
import json
import unittest
import uuid

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
        self.original_chosen = server.chosen
        self.original_player_cache = server.GLOBAL_PLAYER_CACHE
        server.DB_URI = f"file:test_players_{uuid.uuid4().hex}?mode=memory&cache=shared"
        self.connection = server._connect_db()
        server.init_db(csv_path="")
        self.connection.executemany(
            """
            INSERT INTO players
            (id, name, team, position, debut_year, retirement_year, avg, obp, slg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (101, "Sam Same", "TEAM A", "Outfielder", "1960", "1970", ".300", ".400", ".500"),
                (102, "Sam Same", "TEAM B", "Outfielder", "1980", "1990", ".250", ".350", ".450"),
            ],
        )
        self.connection.execute(
            """
            INSERT INTO todays_player
            (name, player_id, team, position, debut_year, retirement_year, avg, obp, slg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            ("Sam Same", 101, "TEAM A", "Outfielder", "1960", "1970", ".300", ".400", ".500"),
        )
        self.connection.commit()
        server.load_current_player()
        server.get_eligible_players()

    def tearDown(self):
        self.connection.close()
        server.DB_URI = self.original_db_uri
        server.chosen = self.original_chosen
        server.GLOBAL_PLAYER_CACHE = self.original_player_cache

    def test_suggestions_distinguish_players_with_identical_names(self):
        response = server.suggest_names(StubRequest(), "Sam")
        suggestions = json.loads(response.body)

        self.assertEqual(
            suggestions,
            [
                {
                    "id": 101,
                    "name": "Sam Same",
                    "team": "TEAM A",
                    "debut_year": "1960",
                    "retirement_year": "1970",
                },
                {
                    "id": 102,
                    "name": "Sam Same",
                    "team": "TEAM B",
                    "debut_year": "1980",
                    "retirement_year": "1990",
                },
            ],
        )

    def test_id_guesses_match_exact_player_while_name_guesses_still_work(self):
        correct_id = asyncio.run(server.guess_player(StubRequest(payload={"id": 101})))
        other_same_name_id = asyncio.run(server.guess_player(StubRequest(payload={"id": 102})))
        name_only_guess = asyncio.run(server.guess_player(StubRequest(payload={"name": "Sam Same"})))

        self.assertTrue(json.loads(correct_id.body)["success"])
        self.assertFalse(json.loads(other_same_name_id.body)["success"])
        self.assertTrue(json.loads(name_only_guess.body)["success"])

    def test_selected_player_id_is_stored_for_the_daily_target(self):
        server.select_new_player()
        server.load_current_player()

        self.assertIn(server.chosen[0], (101, 102))
        self.assertEqual(server.chosen[1], "Sam Same")
        expected_statline = ".300/.400/.500" if server.chosen[0] == 101 else ".250/.350/.450"
        self.assertEqual(server.statline, expected_statline)


if __name__ == "__main__":
    unittest.main()
