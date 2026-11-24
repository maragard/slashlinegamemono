import os
import sqlite3
import tempfile
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import database


CSV_HEADER = (
    "id,Player Name,Team(s),Position(s),Debut Year,Retirement Year,"
    "PA,AVG,OBP,SLG\n"
)


class DatabaseInitializationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db_uri = f"file:test_database_{uuid.uuid4().hex}?mode=memory&cache=shared"
        self.connection = sqlite3.connect(self.db_uri, uri=True)
        self.csv_file = tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", newline="", delete=False
        )
        self.csv_file.write(CSV_HEADER)
        self.csv_file.write(
            "1,Local Player,LOC,Pitcher,1990,2000,100,.200,.300,.400\n"
        )
        self.csv_file.close()

    def tearDown(self):
        self.connection.close()
        os.unlink(self.csv_file.name)

    def connect_db(self):
        return sqlite3.connect(self.db_uri, uri=True)

    async def test_loads_blob_csv_before_local_file(self):
        blob_csv = (
            CSV_HEADER
            + "2,Blob Player,BLOB,Catcher,2000,2010,200,.250,.350,.450\n"
        )
        get_blob = AsyncMock(
            return_value=SimpleNamespace(body=blob_csv.encode("utf-8"))
        )

        with patch("database.blob.get_blob", get_blob):
            await database.initialize_database(
                self.connect_db, self.csv_file.name, "https://blob.example/players.csv"
            )

        get_blob.assert_awaited_once_with(
            "https://blob.example/players.csv", access="private"
        )
        players = self.connection.execute(
            "SELECT id, name FROM players ORDER BY id"
        ).fetchall()
        self.assertEqual(players, [(2, "Blob Player")])

    async def test_falls_back_to_local_csv_when_blob_fetch_fails(self):
        get_blob = AsyncMock(side_effect=RuntimeError("Blob unavailable"))
        with patch("database.blob.get_blob", get_blob):
            await database.initialize_database(
                self.connect_db, self.csv_file.name, "https://blob.example/players.csv"
            )

        get_blob.assert_awaited_once_with(
            "https://blob.example/players.csv", access="private"
        )
        players = self.connection.execute(
            "SELECT id, name FROM players ORDER BY id"
        ).fetchall()
        self.assertEqual(players, [(1, "Local Player")])

    async def test_reports_local_file_failure_after_blob_fetch_fails(self):
        get_blob = AsyncMock(side_effect=RuntimeError("Blob unavailable"))
        with patch("database.blob.get_blob", get_blob):
            with self.assertRaises(FileNotFoundError):
                await database.initialize_database(
                    self.connect_db,
                    self.csv_file.name + ".missing",
                    "https://blob.example/players.csv",
                )

    async def test_uses_local_csv_when_blob_location_is_not_configured(self):
        with patch.dict(os.environ, {"PLAYERS_CSV_BLOB_URL": ""}):
            with patch("database.blob.get_blob", new_callable=AsyncMock) as get_blob:
                await database.initialize_database(self.connect_db, self.csv_file.name)

        get_blob.assert_not_awaited()
        players = self.connection.execute(
            "SELECT id, name FROM players ORDER BY id"
        ).fetchall()
        self.assertEqual(players, [(1, "Local Player")])


if __name__ == "__main__":
    unittest.main()
