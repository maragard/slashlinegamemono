import csv
import hashlib
import json
import os
import re
import sqlite3
import uvicorn
from contextlib import asynccontextmanager, closing
from fastapi import FastAPI, Request, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from sqids import sqids
from typing import Dict, List, Any
from urllib.parse import parse_qs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_URI = "file:players?mode=memory&cache=shared"
CSV_PATH = os.path.join(BASE_DIR, "players.csv")

NAME_DETECTOR = re.compile(r"\w+(\s){1}\w+")

GLOBAL_NAMES_CACHE: Dict[str, List[str]] = {}
GAME_MODES = {
    "all-time": {
        "name": "All Time",
        "years": "1871–Present (all players)",
        "minimum_debut_year": None,
    },
    "post-integration": {
        "name": "Post-Integration",
        "years": "1950–Present",
        "minimum_debut_year": 1950,
    },
    "30-team-era": {
        "name": "30 Team Era",
        "years": "1998–Present",
        "minimum_debut_year": 1998,
    },
}

###############################################################################
##############                 Helper functions                 ###############
###############################################################################


def _connect_db():
    return sqlite3.connect(DB_URI, uri=True)


def _game_mode(mode):
    if mode not in GAME_MODES:
        raise HTTPException(status_code=422, detail="Invalid game mode.")
    return GAME_MODES[mode]


def _pool_predicate(mode):
    minimum_year = _game_mode(mode)["minimum_debut_year"]
    if minimum_year is None:
        return "1 = 1", ()
    return "CAST(debut_year AS INTEGER) >= ?", (minimum_year,)


def _player_hints(player, target):
    def split_values(value):
        return {
            part.strip().casefold()
            for part in re.split(r",|\s+and\s+", value or "", flags=re.IGNORECASE)
            if part.strip()
        }

    def compare_year(guess_year, target_year):
        if not guess_year or not target_year:
            return None

        if guess_year == target_year:
            return "correct"

        try:
            if int(guess_year) // 10 == int(target_year) // 10:
                return "decade"
        except ValueError:
            return None

        return None

    def compare_values(guess_value, target_value):
        guess_values = split_values(guess_value)
        target_values = split_values(target_value)
        if not guess_values or not target_values:
            return None
        if guess_values == target_values:
            return "correct"
        if guess_values & target_values:
            return "partial"
        return None

    return {
        "debut_year": compare_year(player[3], target[3]),
        "retirement_year": compare_year(player[4], target[4]),
        "position": compare_values(player[2], target[2]),
        "team": compare_values(player[1], target[1]),
    }


def _player_info(player_id, player):
    return {
        "id": player_id,
        "name": player[0],
        "team": player[1],
        "position": player[2],
        "debut_year": player[3],
        "retirement_year": player[4],
        "plate_apps": player[5],
        "avg": player[6],
        "obp": player[7],
        "slg": player[8],
    }


###############################################################################
##############                Database functions                ###############
###############################################################################

def init_db(csv_path=CSV_PATH):
    """
    Setup database with data from players.csv

    Returns None
    """
    with closing(_connect_db()) as conn:
        curr = conn.cursor()

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

        if count == 0 and os.path.exists(csv_path):
            with open(csv_path, newline="", encoding="utf-8") as file:
                for row in csv.DictReader(file):
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
    return


def select_new_player(mode="all-time"):
    """Choose a random player from the selected mode's pool."""
    predicate, parameters = _pool_predicate(mode)
    with closing(_connect_db()) as conn:
        curr = conn.cursor()

        player = curr.execute(
            f"""
            SELECT id, name, team, position, debut_year, retirement_year, avg, obp, slg
            FROM players
            WHERE ({predicate})
              AND id NOT IN (SELECT player_id FROM todays_players)
            ORDER BY RANDOM()
            LIMIT 1
            """,
            parameters,
        ).fetchone()

        if player is None:
            raise ValueError(f"No players are available for the {GAME_MODES[mode]['name']} mode.")

        curr.execute(
            """
            INSERT OR REPLACE INTO todays_players
            (mode, player_id, name, team, position, debut_year, retirement_year, avg, obp, slg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (mode, *player),
        )

        conn.commit()


def load_current_player(mode="all-time"):
    with closing(_connect_db()) as conn:
        target = conn.execute(
            """
            SELECT player_id, name, team, position, debut_year, retirement_year, avg, obp, slg
            FROM todays_players
            WHERE mode = ?
            """,
            (mode,),
        ).fetchone()
    return target


def get_revealed_player(mode="all-time"):
    target = load_current_player(mode)
    if target is None:
        raise HTTPException(status_code=404, detail="No player is selected for this game mode.")

    predicate, parameters = _pool_predicate(mode)
    with closing(_connect_db()) as conn:
        player = conn.execute(
            f"""
            SELECT id, name, team, position, debut_year, retirement_year,
                   plate_apps, avg, obp, slg
            FROM players
            WHERE ({predicate}) AND id = ?
            """,
            (*parameters, target[0]),
        ).fetchone()

    if player is None:
        raise HTTPException(status_code=404, detail="The selected player was not found.")
    return _player_info(player[0], player[1:])


def get_eligible_names(mode="all-time"):
    """Cache valid guessing names for one mode's player pool."""
    predicate, parameters = _pool_predicate(mode)
    with closing(_connect_db()) as conn:
        rows = conn.execute(
            f"SELECT id, name, position, debut_year, retirement_year, team FROM players WHERE {predicate} ORDER BY name ASC, id ASC",
            parameters,
        ).fetchall()
    GLOBAL_NAMES_CACHE[mode] = [(row[0], row[1], row[2], row[3], row[4], row[5]) for row in rows]

###############################################################################
##############               Application Setup                  ###############
###############################################################################

@asynccontextmanager
async def lifecycle(app: FastAPI):
    """
    Lifecycle function for backend. Any startup/shutdown events should be run
    in here, either before or after the keyword 'yield'.
    """
    # on_event("startup"): setup backend
    database = _connect_db()
    init_db()
    for mode in GAME_MODES:
        select_new_player(mode)
        get_eligible_names(mode)

    yield

    # on_event("shutdown"): clean up memory
    database.close()


app = FastAPI(
    lifespan=lifecycle
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://slashlinegame.com", 
        "https://www.slashlinegame.com", 
        "https://unnamedgamefront-git-preview-slashline.vercel.app",
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


###############################################################################
##############               Application Endpoints              ###############
###############################################################################

@app.get("/api/health")
async def health_check():
    return JSONResponse(content={"status": "ok"})


@app.get("/api/reset")
def reset_game(mode: str = Query("all-time")):
    """
    Choose a new player from the db, and set up the global vars
    
    Returns None
    """
    _game_mode(mode)
    try:
        select_new_player(mode)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unknown error: {str(e)}")
    else:   
        return JSONResponse(content={"msg": "Game reset successfully", "mode": mode})


@app.get("/api/start")
async def starting_info(mode: str = Query("all-time")):
    """
    Send the starting guess for the game

    Return JSON
    """
    game_mode = _game_mode(mode)
    target = load_current_player(mode)
    if target is None:
        raise HTTPException(status_code=404, detail="No player is selected for this game mode.")
    return JSONResponse(content={
        "hint": "/".join(target[-3:]).strip("'"),
        "mode": mode,
        "mode_name": game_mode["name"],
        "years": game_mode["years"],
    })


@app.get("/api/reveal-player")
async def reveal_player(mode: str = Query("all-time")):
    _game_mode(mode)
    return JSONResponse(content={"player": get_revealed_player(mode)})


@app.post("/api/guess-player")
async def guess_player(request: Request):
    try:
        data = await request.json()
    except (json.JSONDecodeError, ValueError):
        return PlainTextResponse("Invalid JSON", status_code=400)

    unique_id = data.get("id")
    guess_name = data.get("name")
    mode = data.get("mode", "all-time")
    predicate, parameters = _pool_predicate(mode)

    if unique_id is None and not guess_name:
        return PlainTextResponse("Missing necessary fields", status_code=400)

    if guess_name:
        with closing(_connect_db()) as conn:
            players = conn.execute(
                f"""
                SELECT id, name, team, position, debut_year, retirement_year,
                       plate_apps, avg, obp, slg
                FROM players
                WHERE ({predicate}) AND name = ? COLLATE NOCASE
                """,
                (*parameters, guess_name.strip()),
            ).fetchall()

        if not players:
            raise HTTPException(
                status_code=404,
                detail="Player not found in this game mode. Please choose a player from the suggestions.",
            )

        if len(players) > 1:
            return JSONResponse(
                status_code=409,
                content={
                    "detail": "Multiple players have that name. Choose the correct player.",
                    "candidates": [
                        _player_info(record[0], record[1:])
                        for record in players
                    ],
                },
                headers={"X-Player-Candidates": "available"},
            )
        unique_id, *player = players[0]
    elif unique_id is not None:
        with closing(_connect_db()) as conn:
            record = conn.execute(
                f"""
                SELECT id, name, team, position, debut_year, retirement_year,
                       plate_apps, avg, obp, slg
                FROM players
                WHERE ({predicate}) AND id = ?
                """,
                (*parameters, unique_id),
            ).fetchone()

        if not record:
            raise HTTPException(status_code=404, detail="Player not found in this game mode.")
        unique_id, *player = record
    else:
        raise HTTPException(status_code=400, detail="Missing player name or ID.")

    target = load_current_player(mode)
    if target is None:
        raise HTTPException(status_code=404, detail="No player is selected for this game mode.")
    player_info = _player_info(unique_id, player)
    hints = _player_hints(player, target[1:])
    success = int(unique_id) == int(target[0])

    return JSONResponse(
        content={
            "success": success,
            "msg": "You did it!" if success else "Try again",
            "player": player_info,
            "hints": hints,
        }
    )


@app.get("/api/suggest", response_model=List[Dict[str, Any]])
def suggest_names(
    request: Request,
    q: str = Query(..., min_length=3),
    mode: str = Query("all-time"),
):
    """
    Searches the server-side memory array. 
    Only returns a set number of matches, keeping the master list hidden.
    """
    query = q.strip().lower()
    matches = []
    _game_mode(mode)
    
    # Filter through RAM list
    for name in GLOBAL_NAMES_CACHE.get(mode, []):
        if query in name[1].lower():
            matches.append({
                "id": name[0],
                "name": name[1],
                "position": name[2],
                "debut": name[3],
                "retirement": name[4],
                "team": name[5]
            })
        # Hard limit on returned elements protects your list
        if len(matches) >= 10:  
            break

    # 1. Serialize the content to a stable JSON string to generate a hash
    # sort_keys=True ensures the string layout is identical every time
    content_bytes = json.dumps(matches, sort_keys=True).encode("utf-8")
    
    # 2. Generate the ETag (wrapped in quotes per the HTTP spec)
    etag_value = f'"{hashlib.md5(content_bytes).hexdigest()}"'
    
    # 3. Check if the client already has this version
    client_etag = request.headers.get("If-None-Match")
    if client_etag == etag_value:
        # Client has the fresh copy; return 304 with NO body and headers
        return PlainTextResponse(
            status_code=304,
            headers={
                "Cache-Control": "private, max-age=60, must-revalidate",
                "ETag": etag_value,
            }
        )

    print(matches)
    return JSONResponse(
        content=matches,
        headers={
            "Cache-Control": "private, max-age=60, must-revalidate",
            "ETag": etag_value,
        },
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)