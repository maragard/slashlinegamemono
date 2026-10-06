import csv
import json
import os
import re
import sqlite3
import uvicorn
from contextlib import asynccontextmanager, closing
from fastapi import FastAPI, Request, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List, Any
from urllib.parse import parse_qs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_URI = "file:players?mode=memory&cache=shared"
CSV_PATH = os.path.join(BASE_DIR, "players.csv")

NAME_DETECTOR = re.compile(r"\w+(\s){1}\w+")

chosen = ""
statline = ""
GLOBAL_NAMES_CACHE: List[str] = []

###############################################################################
##############             Helper functions                     ###############
###############################################################################


def _connect_db():
    return sqlite3.connect(DB_URI, uri=True)


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
            CREATE TABLE IF NOT EXISTS todays_player (
                name TEXT PRIMARY KEY,
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


def select_new_player():
    """
    Chooses a player at random from the full list
    and stores them in todays_player. 

    Returns None
    """
    with closing(_connect_db()) as conn:
        curr = conn.cursor()

        # Find new player
        player = curr.execute (
            """
            SELECT id, name, team, position, debut_year, retirement_year, avg, obp, slg
            FROM players
            ORDER BY RANDOM()
            LIMIT 1
            """
        ).fetchone()

        # Reset todays_player
        curr.execute ("DELETE FROM todays_player")
        # Set new value for todays_player
        print(player)
        curr.execute (
                """
                INSERT INTO todays_player
                (name, team, position, debut_year, retirement_year, avg, obp, slg)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                player[1:],
            )

        conn.commit()
    return


def load_current_player():
    """
    Initialize global variables by fetching todays_players

    Returns None
    """
    global chosen, statline

    with closing(_connect_db()) as conn:
        curr = conn.cursor()

        target = curr.execute (
            """
            SELECT name, team, position, debut_year, retirement_year, avg, obp, slg
            FROM todays_player
            """
        ).fetchone()
        
    print(target)
    chosen = target
    statline = "/".join(target[-3:]).strip("'")
    return


def get_eligible_names():
    """
    Generates a flat array of all valid guessing names.
    Cached on the client to power instant autocomplete.

    Returns None
    """
    global GLOBAL_NAMES_CACHE
    with closing(_connect_db()) as conn:
        curr = conn.cursor()
        # Fetch all names at once
        curr.execute ("SELECT name FROM players ORDER BY name ASC")
        
        # Flatten and save into memory
        GLOBAL_NAMES_CACHE = [row[0] for row in curr.fetchall()]
        print(f"Loaded {len(GLOBAL_NAMES_CACHE)} names safely into backend memory.")

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
    select_new_player()
    load_current_player()
    get_eligible_names()

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
        "https://unnamedgamefront-git-preview-slashline.vercel.app"
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


###############################################################################
##############                Application Endpoints             ###############
###############################################################################

@app.get("/api/health")
async def health_check():
    return JSONResponse(content={"status": "ok"})


@app.get("/api/reset")
def reset_game():
    """
    Choose a new player from the db, and set up the global vars
    
    Returns None
    """
    try:
        select_new_player()
        load_current_player()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unknown error: {str(e)}")
    else:   
        return JSONResponse(content={"msg": "Game reset successfully"})


@app.get("/api/start", response_model=Dict[str, str])
async def starting_info():
    """
    Send the starting guess for the game

    Return JSON
    """
    return JSONResponse(content={"hint": statline})


@app.post("/api/guess-player")
async def guess_player(request: Request):
    try:
        data = await request.json()
    except (json.JSONDecodeError, ValueError):
        return PlainTextResponse("Invalid JSON", status_code=400)

    unique_id = data.get("id")
    guess_name = data.get("name")

    if unique_id is None and not guess_name:
        return PlainTextResponse("Missing necessary fields", status_code=400)

    if guess_name and guess_name == chosen[0].strip("'"):
        return JSONResponse(content={"success": True, "msg": "You did it!"})

    if unique_id is not None:
        with closing(_connect_db()) as conn:
            player = conn.execute(
                "SELECT name FROM players WHERE id = ?",
                (unique_id,),
            ).fetchone()

        success = bool(player and player[0] == chosen[0].strip("'"))
        return JSONResponse({
            "success": success,
            "msg": "You did it!" if success else "Try again",
        })

    return {"success": False, "msg": "Try again"}


@app.get("/api/suggest", response_model=List[str])
def suggest_names(request: Request, q: str = Query(..., min_length=3)):
    """
    Searches the server-side memory array. 
    Only returns a maximum of 8 matches, keeping the master list hidden.
    """
    query = q.strip().lower()
    matches = []
    
    # Filter through RAM list
    for name in GLOBAL_NAMES_CACHE:
        if query in name.lower():
            matches.append(name)
        if len(matches) >= 8:  # Hard limit on returned elements protects your list
            break

    return JSONResponse(
        content=matches,
        headers={
            "Cache-Control": "private, max-age=3600, must-revalidate",
        },
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)