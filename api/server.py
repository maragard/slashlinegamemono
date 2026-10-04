import csv
import json
import os
import re
import sqlite3
import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from urllib.parse import parse_qs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "players-temp.db")
CSV_PATH = os.path.join(BASE_DIR, "players.csv")
PLAYER_FILE = os.path.join(BASE_DIR, "todaysplayer.pkl")

NAME_DETECTOR = re.compile(r"\w+(\s){1}\w+")

app = FastAPI()
application = app

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://slashlinegame.com", "https://www.slashlinegame.com", "https://unnamedgamefront-git-preview-slashline.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chosen = ""
statline = ""


def init_db(db_path=DB_PATH, csv_path=CSV_PATH):
    conn = sqlite3.connect(db_path)
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
            plate_apps TEXT,
            avg TEXT,
            obp TEXT,
            slg TEXT
        )
        """
    )

    curr.execute("SELECT COUNT(1) FROM players")
    count = curr.fetchone()[0]

    if count == 0 and os.path.exists(csv_path):
        with open(csv_path, newline="", encoding="latin-1") as file:
            reader = csv.DictReader(file)

            for row in reader:
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

    conn.close()


def select_new_player():
    conn = sqlite3.connect(DB_PATH)
    curr = conn.cursor()

    # Find new player
    player = curr.execute (
        """
        SELECT id, name, team, position, debut_year, retirement_year, plate_apps, avg, obp, slg
        FROM players
        ORDER BY RANDOM()
        LIMIT 1
        """
    ).fetchone()

    # Reset todays_player
    curr.execute ("DELETE FROM todays_player")
    # Set new value for todays_player
    print(player)
    # player = [datum[0] for datum in player]
    # print(player)
    curr.execute (
            """
            INSERT INTO todays_player
            (name, team, position, debut_year, retirement_year,
                plate_apps, avg, obp, slg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            player[1:],
        )

    conn.commit()
    conn.close()
    return

def load_current_player():
    global chosen, statline

    conn = sqlite3.connect(DB_PATH)
    curr = conn.cursor()

    with open(PLAYER_FILE, "r", encoding="utf-8") as file:
        target = file.read()

    parts = target.split(", ")
    if len(parts) >= 5:
        chosen = parts[1].strip("'")
        statline = "/".join(parts[2:]).strip("'")
    conn = sqlite3.connect(DB_PATH)
    curr = conn.cursor()

    target_player = curr.execute(
        """
        SELECT name, team, position, debut_year, retirement_year, plate_apps, avg, obp, slg
        FROM todays_player
        LIMIT 1
        """
    ).fetchone()

    print(target_player)




@app.get("/api/health")
async def health_check():
    return JSONResponse(content={"status": "ok"})


@app.get("/api/reset")
async def reset_game():
    try:
        select_new_player()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    else:   
        load_current_player()
        return JSONResponse(content={"msg": "Game reset successfully"})


@app.get("/api/start")
async def starting_info():
    return {"hint": statline}


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

    if guess_name and guess_name == chosen:
        return {"success": True, "msg": "You did it!"}

    if unique_id is not None:
        conn = sqlite3.connect(DB_PATH)
        player = conn.execute(
            "SELECT name FROM players WHERE id = ?",
            (unique_id,),
        ).fetchone()
        conn.close()

        success = bool(player and player[0] == chosen)
        return {
            "success": success,
            "msg": "You did it!" if success else "Try again",
        }

    return {"success": False, "msg": "Try again"}


@app.post("/api/get-players")
async def search_string(request: Request):
    body = await request.body()
    content_type = request.headers.get("content-type", "")

    value = None

    if "application/json" in content_type:
        try:
            value = json.loads(body.decode("utf-8")).get("value")
        except (json.JSONDecodeError, ValueError):
            return PlainTextResponse("Invalid JSON", status_code=400)
    else:
        values = parse_qs(body.decode("utf-8"))
        value = values.get("value", [None])[0]

    if value is None:
        return PlainTextResponse(
            "Missing 'value' query parameter",
            status_code=400,
        )

    return {"received_string": value}

@app.get("/api/eligible-names")
def get_eligible_names():
    """
    Returns a flat array of all valid guessing names.
    Cached on the client to power instant autocomplete.
    """
    with sqlite3.connect(DB_PATH) as conn:
        curr = conn.cursor()
        # Select only the column you need to keep payload tiny
        curr.execute ("SELECT name FROM players ORDER BY name_string ASC")
        
        # Flatten tuple results: [("Alice",), ("Bob",)] -> ["Alice", "Bob"]
        names = [row[0] for row in curr.fetchall()]
        
    return JSONResponse(content={'names': names})

init_db()
load_current_player()


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)