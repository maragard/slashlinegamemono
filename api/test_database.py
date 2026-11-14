import io
import os
import sqlite3
import tempfile
import unittest
import uuid
from unittest.mock import patch
from urllib.error import URLError

import database


CSV_HEADER = (
    "id,Player Name,Team(s),Position(s),Debut Year,Retirement Year,"
    "PA,AVG,OBP,SLG\n"
)


class DatabaseInitializationTests(unittest.TestCase):
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

    def test_loads_blob_csv_before_local_file(self):
        blob_csv = (
            CSV_HEADER
            + "2,Blob Player,BLOB,Catcher,2000,2010,200,.250,.350,.450\n"
        )
        response = io.BytesIO(blob_csv.encode("utf-8"))

        with patch("database.urlopen", return_value=response) as open_blob:
            database.initialize_database(
                self.connect_db, self.csv_file.name, "https://blob.example/players.csv"
            )

        open_blob.assert_called_once_with(
            "https://blob.example/players.csv", timeout=10
        )
        players = self.connection.execute(
            "SELECT id, name FROM players ORDER BY id"
        ).fetchall()
        self.assertEqual(players, [(2, "Blob Player")])

    def test_falls_back_to_local_csv_when_blob_is_unavailable(self):
        with patch(
            "database.urlopen", side_effect=URLError("Blob unavailable")
        ):
            database.initialize_database(
                self.connect_db, self.csv_file.name, "https://blob.example/players.csv"
            )

        players = self.connection.execute(
            "SELECT id, name FROM players ORDER BY id"
        ).fetchall()
        self.assertEqual(players, [(1, "Local Player")])


if __name__ == "__main__":
    unittest.main()
