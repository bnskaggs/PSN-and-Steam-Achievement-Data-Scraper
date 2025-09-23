#!/usr/bin/env python3
"""Fetch Steam global achievement stats and export as CSV."""
from __future__ import annotations

import argparse
import csv
import os
import sys
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests
from dotenv import load_dotenv

API_GLOBAL_URL = "https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/"
API_SCHEMA_URL = "https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/"

REQUEST_TIMEOUT = 20
RETRY_STATUS = {500, 502, 503, 504}


class SteamCliError(Exception):
    """Base class for known CLI errors."""


def build_arg_parser() -> argparse.ArgumentParser:
    examples = (
        "Examples:\n"
        "  python steam_achievements.py --appid 620\n"
        "  python steam_achievements.py --appid 620 --lang french --out portal2_fr.csv"
    )
    parser = argparse.ArgumentParser(
        description="Fetch global Steam achievement stats and merge with schema metadata.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=examples,
    )
    parser.add_argument("--appid", type=int, required=True, help="Steam AppID of the game.")
    parser.add_argument(
        "--lang",
        default="english",
        help="Language for schema metadata (default: english).",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Output CSV path (default: steam_<appid>_achievements.csv).",
    )
    return parser


def request_json(url: str, *, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    last_error: Optional[str] = None
    for attempt in range(2):
        try:
            response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
        except requests.RequestException as exc:  # network errors
            last_error = str(exc)
            continue
        if response.status_code in RETRY_STATUS and attempt == 0:
            last_error = f"HTTP {response.status_code}"
            continue
        if response.status_code != 200:
            raise SteamCliError(
                f"Steam API request failed with status {response.status_code}: {response.text[:200]}"
            )
        try:
            return response.json()
        except ValueError as exc:
            raise SteamCliError(f"Failed to parse JSON response: {exc}") from exc
    raise SteamCliError(f"Network error contacting Steam API: {last_error or 'unknown error'}")


def fetch_global_percentages(appid: int) -> Dict[str, float]:
    params = {"gameid": appid}
    data = request_json(API_GLOBAL_URL, params=params)
    achievements = data.get("achievementpercentages", {}).get("achievements", [])
    result: Dict[str, float] = {}
    for item in achievements:
        name = item.get("name")
        percent = item.get("percent")
        if not name:
            continue
        try:
            result[name] = float(percent)
        except (TypeError, ValueError):
            continue
    return result


def fetch_schema(appid: int, api_key: str, lang: str) -> Dict[str, Dict[str, Any]]:
    params = {"key": api_key, "appid": appid, "l": lang}
    data = request_json(API_SCHEMA_URL, params=params)
    achievements = (
        data.get("game", {})
        .get("availableGameStats", {})
        .get("achievements", [])
    )
    schema: Dict[str, Dict[str, Any]] = {}
    for item in achievements:
        name = item.get("name")
        if not name:
            continue
        schema[name] = {
            "title": item.get("displayName", ""),
            "description": item.get("description", ""),
            "hidden": bool(item.get("hidden", False)),
            "icon": item.get("icon", ""),
            "icon_gray": item.get("icongray", ""),
        }
    return schema


def sort_rows(rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def sort_key(row: Dict[str, Any]) -> Tuple[int, int, float]:
        percent = row.get("global_percent")
        missing_percent = 1 if percent in (None, "") else 0
        hidden = 1 if row.get("hidden") in (True, "true", "True", 1) else 0
        percent_value = -float(percent.rstrip('%')) if percent not in (None, "") else 0.0
        return (missing_percent, hidden, percent_value)

    return sorted(rows, key=sort_key)


def write_csv(path: str, rows: Iterable[Dict[str, Any]]) -> None:
    fieldnames = [
        "api_name",
        "title",
        "description",
        "hidden",
        "icon",
        "icon_gray",
        "global_percent",
    ]
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def generate_rows(
    schema: Dict[str, Dict[str, Any]],
    global_percentages: Dict[str, float],
) -> List[Dict[str, Any]]:
    names = set(schema.keys()) | set(global_percentages.keys())
    rows: List[Dict[str, Any]] = []
    for name in names:
        meta = schema.get(name, {})
        percent = global_percentages.get(name)
        rows.append(
            {
                "api_name": name,
                "title": meta.get("title", ""),
                "description": meta.get("description", ""),
                "hidden": "true" if meta.get("hidden") else "false",
                "icon": meta.get("icon", ""),
                "icon_gray": meta.get("icon_gray", ""),
                "global_percent": f"{percent:.6f}%" if isinstance(percent, float) else "",
            }
        )
    return sort_rows(rows)


def main(argv: Optional[List[str]] = None) -> int:
    load_dotenv()
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    appid: int = args.appid
    out_path: str = args.out or f"steam_{appid}_achievements.csv"
    lang: str = args.lang

    api_key = os.getenv("STEAM_API_KEY")
    if not api_key:
        raise SteamCliError("Missing STEAM_API_KEY. Please set it in the environment or .env file.")

    global_percentages = fetch_global_percentages(appid)
    schema = fetch_schema(appid, api_key, lang)

    if not schema and not global_percentages:
        write_csv(out_path, [])
        print("No achievements found for this title. Wrote header-only CSV.")
        return 0

    rows = generate_rows(schema, global_percentages)
    write_csv(out_path, rows)
    print(f"Wrote {len(rows)} achievements to {out_path}.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SteamCliError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(2 if "Missing STEAM_API_KEY" in str(exc) else 3)
    except KeyboardInterrupt:
        print("Aborted by user.", file=sys.stderr)
        sys.exit(1)
