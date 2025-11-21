from http.server import BaseHTTPRequestHandler
import json
from typing import List, Literal


Result = Literal["win", "loss", "draw"]


def parse_games_ndjson(games_ndjson: str, username: str) -> List[Result]:
    """
    Parse Lichess NDJSON games and return results (win/loss/draw) from the player's perspective.
    """
    results: List[Result] = []

    if not games_ndjson:
        return results

    for line in games_ndjson.strip().splitlines():
        if not line.strip():
            continue
        try:
            g = json.loads(line)
        except json.JSONDecodeError:
            continue

        players = g.get("players", {})
        winner_color = g.get("winner")  # "white", "black" or None
        user_color = None

        # In Lichess JSON, player user can be under players.white.user.name / players.black.user.name
        for color in ("white", "black"):
            player = players.get(color, {})
            user = player.get("user") or {}
            # name = username as displayed
            if user.get("name") == username or user.get("id") == username:
                user_color = color
                break

        if user_color is None:
            # Can't determine which side we were; skip this game
            continue

        if winner_color is None:
            result: Result = "draw"
        elif winner_color == user_color:
            result = "win"
        else:
            result = "loss"

        results.append(result)

    # Lichess returns newest first; reverse to get chronological order
    results.reverse()
    return results


def compute_tilt_score(results: List[Result]) -> float:
    """
    Very simple tilt metric:
      - Look at consecutive loss streaks.
      - Compute average streak length.
      - Map average streak length 0..5+ to tilt_score 0..1.
    """
    if not results:
        # No games -> neutral / low tilt
        return 0.2

    streaks: List[int] = []
    current = 0

    for r in results:
        if r == "loss":
            current += 1
        else:
            if current > 0:
                streaks.append(current)
            current = 0

    if current > 0:
        streaks.append(current)

    if not streaks:
        # No loss streaks -> very low tilt
        return 0.1

    avg_streak = sum(streaks) / len(streaks)
    # Normalise: avg_streak 0 -> 0, 5+ -> 1
    tilt_score = avg_streak / 5.0
    if tilt_score < 0:
        tilt_score = 0.0
    if tilt_score > 1:
        tilt_score = 1.0
    return round(tilt_score, 3)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Read request body
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"

        try:
            data = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            data = {}

        games_ndjson = data.get("games_ndjson", "")
        username = data.get("username", "")

        results = parse_games_ndjson(games_ndjson, username)
        tilt_score = compute_tilt_score(results)

        result = {
            "tilt_score": tilt_score,
            "games_analyzed": len(results),
        }

        # Send response
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode("utf-8"))
