"""Convert the supplied MKFP M26 schema to the Footcore CSV catalog.

Usage: python3 scripts/convert_m26.py
Original files are read only. Unknown schemas/values fail explicitly.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import unicodedata
import zlib

from java_stream import JavaStream

ROOT = Path(__file__).resolve().parent.parent
POSITIONS = ["G", "L", "Z", "V", "M", "P", "A"]
TECHNICAL = ["Col", "Ref", "Sgo", "Rbo", "Arm", "Cab", "Cru", "Des", "Dri", "Fin", "Mar", "Pas", "Pos", "Ant", "Chu"]
PHYSICAL = ["Fle", "Res", "Vel", "Ace", "For", "Imp", "Agi", "Con", "Fri", "Cri", "Vis"]
FOOT = {1: "D", 2: "E", 3: "A"}


def country_list(readme):
    section = readme.read_bytes().decode("cp1252").split("Siglas dos Países:", 1)[1]
    return [(code, name.strip()) for code, name in re.findall(r"^([A-Z]{3}) - (.+)", section, re.M)]


def indexed(values, index, label):
    if type(index) is not int or not 0 <= index < len(values):
        raise ValueError(f"{label}: índice desconhecido {index}")
    return values[index]


def integer(value, low, high, label):
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f"{label}: valor inválido {value}")
    return value


def flag(value):
    if type(value) is not bool:
        raise ValueError("Indicador booleano inválido")
    return "S" if value else "N"


def fields(value, class_name):
    if not isinstance(value, dict) or value.get("class") != class_name:
        raise ValueError(f"Esperada classe {class_name}")
    return value["fields"]


def color(value):
    return f'{fields(value, "java.awt.Color")["value"] & 0xffffff:06X}'


def png_icon(icon):
    """Encode the existing ARGB pixel array losslessly as PNG (no resizing)."""
    info = fields(icon, "javax.swing.ImageIcon")
    width = integer(info["width"], 1, 512, "Largura do escudo")
    height = integer(info["height"], 1, 512, "Altura do escudo")
    blocks = icon["annotations"]["javax.swing.ImageIcon"]
    arrays = [item for item in blocks if isinstance(item, dict) and item.get("array") == "[I"]
    if len(arrays) != 1 or len(arrays[0]["values"]) != width * height:
        raise ValueError("Pixels do escudo inconsistentes")
    pixels = arrays[0]["values"]
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for pixel in pixels[y * width:(y + 1) * width]:
            rows.extend(((pixel >> 16) & 255, (pixel >> 8) & 255, pixel & 255, (pixel >> 24) & 255))
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(rows))) + chunk(b"IEND", b"")


def decode_team(raw, filename, countries):
    root = JavaStream(raw).root()
    club = fields(root, "a.a.a.d.y")
    country = indexed(countries, club["d"], "País do clube")[0]
    if filename.split("_")[0] != country:
        raise ValueError("País do arquivo difere do cadastro")
    coach = fields(club["n"], "a.a.a.d.w")
    roster = fields(club["o"], "java.util.ArrayList")
    players = club["o"]["annotations"]["java.util.ArrayList"][1:]
    if roster["size"] != len(players):
        raise ValueError("Quantidade de jogadores inconsistente")
    strength = integer(club["c"], 1, 99, "Força do clube")
    capacity = integer(club["q"], 1000, 200000, "Capacidade")
    rows = [[club["a"], country, strength, club["b"], coach["a"], indexed(countries, coach["b"], "País do técnico")[0], color(club["e"]), color(club["f"]), capacity]]
    source_players = []
    for obj in players:
        p = fields(obj, "a.a.a.d.l")
        if p["f"] not in FOOT:
            raise ValueError("Código de pé desconhecido")
        age = integer(p["i"], 16, 50, "Idade")
        row = [p["a"], indexed(POSITIONS, p["b"], "Posição"), indexed(countries, p["c"], "País do jogador")[0], flag(p["g"]), age, FOOT[p["f"]], flag(p["h"]), indexed(TECHNICAL, p["j"] - 1, "Característica técnica"), indexed(PHYSICAL, p["k"] - 16, "Característica física"), integer(p["l"], 0, 7, "Característica extra")]
        # M26 stores team strength and star/starter flags, not a player overall.
        # Leave the Footcore extension columns empty so estimation is visible.
        rows.append(row)
        source_players.append({k: v for k, v in p.items() if v is None or isinstance(v, (str, int, bool))})
    out = io.StringIO(newline="")
    csv.writer(out, delimiter=";", lineterminator="\r\n").writerows(rows)
    audit = {"file": filename, "sha256": hashlib.sha256(raw).hexdigest(), "class": root["class"], "clubFields": {k: v for k, v in club.items() if v is None or isinstance(v, (str, int, bool))}, "coachFields": {k: v for k, v in coach.items() if v is None or isinstance(v, (str, int, bool))}, "players": source_players, "embeddedAssets": {k: {"bytes": len(club[k]["values"]), "sha256": hashlib.sha256(club[k]["values"]).hexdigest()} for k in ["v", "w", "x", "y"] if club.get(k) and isinstance(club[k].get("values"), bytes)}}
    return {"name": club["a"], "country": country, "players": len(players), "strength": strength, "stadium": club["b"], "csv": out.getvalue(), "badge": png_icon(club["i"]), "audit": audit}


def convert(source, readme, target):
    countries = country_list(readme)
    for sub in ["times", "escudos"]:
        (target / sub).mkdir(parents=True, exist_ok=True)
    entries, errors, audit = [], [], []
    for path in sorted(source.glob("*.m26")):
        try:
            team = decode_team(path.read_bytes(), path.name, countries)
            slug = unicodedata.normalize("NFKD", path.stem).encode("ascii", "ignore").decode().lower()
            slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
            slug += "-" + hashlib.sha256(path.name.encode()).hexdigest()[:8]
            (target / "times" / f"{slug}.csv").write_text(team["csv"], encoding="utf-8", newline="")
            (target / "escudos" / f"{slug}.png").write_bytes(team["badge"])
            entries.append({"id": slug, "name": team["name"], "country": team["country"], "players": team["players"], "strength": team["strength"], "stadium": team["stadium"], "csv": f"data/m26/times/{slug}.csv", "badgePath": f"data/m26/escudos/{slug}.png"})
            audit.append(team["audit"])
        except (ValueError, KeyError, TypeError, UnicodeError, IndexError) as error:
            errors.append({"file": path.name, "error": str(error)})
    entries.sort(key=lambda t: (t["country"], t["name"].casefold()))
    catalog = {"version": 1, "name": source.name, "clubs": len(entries), "players": sum(t["players"] for t in entries), "countries": [{"code": code, "name": name} for code, name in countries if any(t["country"] == code for t in entries)], "teams": entries}
    (target / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = {"source": str(source.relative_to(ROOT)) if source.is_relative_to(ROOT) else str(source), "converted": len(entries), "players": catalog["players"], "errors": errors, "mapping": {"club": {"a": "name", "b": "stadium", "c": "strength", "d": "country index", "e/f": "colors", "q": "capacity", "n": "coach", "o": "players", "i": "badge ARGB"}, "player": {"a": "name", "b": "position 0–6", "c": "country index", "f": "foot 1–3", "g": "star", "h": "starter", "i": "age", "j": "technical 1–15", "k": "physical 16–26", "l": "extra 0–7"}}, "notes": ["Country indices and characteristic codes follow the order in the supplied readme; all 559 club countries match their filename prefixes.", "Player overall, potential, salaries and values are Footcore estimates, not attributes recovered from M26.", "Wing positions P/WG become ATA in Footcore. Metadata such as foot and special characteristics currently has no simulation effect.", "Other embedded images remain preserved in the original M26 files; only badges are extracted."], "records": audit}
    (target / "conversion-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"clubs": len(entries), "players": catalog["players"], "countries": len(catalog["countries"]), "badges": len(entries), "errors": errors}, ensure_ascii=False))
    return not errors


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=ROOT / "leia-me-times-csv/MKFP 02-09-26")
    parser.add_argument("--readme", type=Path, default=ROOT / "leia-me-times-csv/leia-me-times-csv.txt")
    parser.add_argument("--output", type=Path, default=ROOT / "data/m26")
    args = parser.parse_args()
    raise SystemExit(0 if convert(args.source.resolve(), args.readme.resolve(), args.output.resolve()) else 1)
