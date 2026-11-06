import asyncio
import json
import unittest
import uuid

import server
from fastapi import HTTPException


class StubRequest:
    def __init__(self, headers=None, payload=None):
        self.headers = headers or {}
        self.payload = payload

    async def json(self):
        return self.payload


class PlayerGameModeTests(unittest.TestCase):
    def setUp(self):
        self.original_db_uri = server.DB_URI
        self.original_cache = server.GLOBAL_PLAYER_CACHE
        server.DB_URI = f"file:test_players_{uuid.uuid4().hex}?mode=memory&cache=shared"
        server.GLOBAL_PLAYER_CACHE = {}
        self.connection = server._connect_db()
        server.init_db(csv_path="")
        self.connection.executemany(
            """
            INSERT INTO players
            (id, name, team, position, debut_year, retirement_year,
             plate_apps, avg, obp, slg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (101, "Sam Same", "TEAM A", "Outfielder", "1948", "1970", "1200", ".300", ".400", ".500"),
                (102, "Sam Same", "TEAM B", "Outfielder", "1980", "1990", "1200", ".250", ".350", ".450"),
                (103, "Recent Player", "TEAM C", "Pitcher", "2000", "Not Found", "1200", ".200", ".300", ".400"),
            ],
        )
        self.connection.execute(
            """
            INSERT INTO todays_players
            (mode, player_id, name, team, position, debut_year, retirement_year, avg, obp, slg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            ("all-time", 101, "Sam Same", "TEAM A", "Outfielder", "1948", "1970", ".300", ".400", ".500"),
        )
        self.connection.commit()

    def tearDown(self):
        self.connection.close()
        server.DB_URI = self.original_db_uri
        server.GLOBAL_PLAYER_CACHE = self.original_cache

    def test_suggestions_return_distinct_player_records_within_mode(self):
        server.get_eligible_players("post-integration")
        response = server.suggest_names(
            StubRequest(),
            "Sam",
            "post-integration",
        )
        suggestions = json.loads(response.body)

        self.assertEqual(
            suggestions,
            [{
                "id": 102,
                "name": "Sam Same",
                "team": "TEAM B",
                "debut_year": "1980",
                "retirement_year": "1990",
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
        excluded = None
        try:
            asyncio.run(server.guess_player(StubRequest(payload={
                "id": 101,
                "mode": "post-integration",
            })))
        except HTTPException as error:
            excluded = error

        self.assertTrue(json.loads(correct.body)["success"])
        self.assertFalse(json.loads(incorrect.body)["success"])
        self.assertIsNotNone(excluded)

    def test_mode_pools_use_the_requested_debut_year_boundary(self):
        for mode, expected_count in (
            ("all-time", 3),
            ("post-integration", 2),
            ("30-team-era", 1),
        ):
            predicate, parameters = server._pool_predicate(mode)
            count = self.connection.execute(
                f"SELECT COUNT(*) FROM players WHERE {predicate}",
                parameters,
            ).fetchone()[0]
            self.assertEqual(count, expected_count)


if __name__ == "__main__":
    unittest.main()
