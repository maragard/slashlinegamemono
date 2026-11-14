import csv
import io
import logging
import os
import sqlite3
from contextlib import closing
from urllib.error import URLError
from urllib.request import urlopen

logger = logging.getLogger(__name__)


def _load_csv_content(csv_path, blob_url):
    if blob_url:
        try:
            with urlopen(blob_url, timeout=10) as response:
                return response.read().decode("utf-8")
        except (OSError, URLError, TimeoutError, ValueError) as error:
            logger.warning(
                "Could not load players CSV from Vercel Blob; falling back to local file: %s",
                error,
            )

    if os.path.exists(csv_path):
        with open(csv_path, newline="", encoding="utf-8") as file:
            return file.read()
    return None


def initialize_database(connect_db, csv_path, blob_url=None):
    """Create the application tables and load player data when the table is empty."""
    if blob_url is None:
        blob_url = os.environ.get("PLAYERS_CSV_BLOB_URL")

    with closing(connect_db()) as conn:
        curr: sqlite3.Cursor = conn.cursor()

        curr.execute(
            """
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY,
                name TEXT,
                team TEXT,
                position TEXT,
                debut_year TEXT,
                retirement_year TEXT,
                plate_apps TEXT,
                avg TEXT,
                obp TEXT,
                slg TEXT
            )
            """
        )

        curr.execute(
            """
            CREATE TABLE IF NOT EXISTS todays_players (
                mode TEXT PRIMARY KEY,
                player_id INTEGER,
                name TEXT,
                team TEXT,
                position TEXT,
                debut_year TEXT,
                retirement_year TEXT,
                avg TEXT,
                obp TEXT,
                slg TEXT
            )
            """
        )

        curr.execute("SELECT COUNT(1) FROM players")
        count = curr.fetchone()[0]
        csv_content = _load_csv_content(csv_path, blob_url) if count == 0 else None

        if csv_content is not None:
            for row in csv.DictReader(io.StringIO(csv_content, newline="")):
                player_id = int(row["id"]) if row.get("id") else None
                values = (
                    row.get("Player Name"),
                    row.get("Team(s)"),
                    row.get("Position(s)"),
                    row.get("Debut Year"),
                    row.get("Retirement Year"),
                    row.get("PA"),
                    row.get("AVG"),
                    row.get("OBP"),
                    row.get("SLG"),
                )

                if player_id is None:
                    curr.execute(
                        """
                        INSERT INTO players
                        (name, team, position, debut_year, retirement_year,
                        plate_apps, avg, obp, slg)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        values,
                    )
                else:
                    curr.execute(
                        """
                        INSERT OR REPLACE INTO players
                        (id, name, team, position, debut_year, retirement_year,
                        plate_apps, avg, obp, slg)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (player_id, *values),
                    )

            conn.commit()
