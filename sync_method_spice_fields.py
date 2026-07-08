from __future__ import annotations

import argparse
import asyncio
import html
import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path


METHOD_URL = "https://www.method.gg/dune-awakening/deep-desert-companion"
VERSION_URL = "https://cdn.th.gl/dune-awakening/version.json"
DEFAULT_TILE_URL = (
    "https://cdn.th.gl/dune-awakening/map-tiles/"
    "deepdesert_1-ce84793aea1d9e14e5898d7d10beb670/{z}/{y}/{x}.webp?v=1"
)
SSL_CONTEXT = ssl._create_unverified_context()
LETTERS_BOTTOM_TO_TOP = "ABCDEFGHI"
SUBCELL_X_CENTER = {
    "1": 0.125,
    "2": 0.375,
    "3": 0.625,
    "4": 0.875,
}
SUBCELL_Y_CENTER = {
    "0": 0.125,
    "1": 0.375,
    "2": 0.625,
    "3": 0.875,
}


@dataclass
class OverlayField:
    kind: str
    cell: str
    subx: str
    suby: str
    x: float
    y: float


OVERLAY_TYPES = {
    "spice": {
        "method": "large-spice-field",
        "label": "Large Spice Field",
    },
    "titanium": {
        "method": "titanium",
        "label": "Titanium",
    },
    "stravidium": {
        "method": "stravidium",
        "label": "Stravidium",
    },
    "testingStation": {
        "method": "testing-station",
        "label": "Testing Station",
    },
    "cave": {
        "method": "cave",
        "label": "Cave",
    },
}


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def request_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "GriffinWingMap/1.0"})
    with urllib.request.urlopen(request, timeout=30, context=SSL_CONTEXT) as response:
        return response.read().decode("utf-8", errors="replace")


async def rendered_method_fields(url: str) -> dict[str, list[OverlayField]]:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return {}

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        page = await browser.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_selector("[data-poitype]", timeout=30000)
            rows = await page.evaluate(
                """() => {
                    const typeMap = {
                        "large-spice-field": "spice",
                        "titanium": "titanium",
                        "stravidium": "stravidium",
                        "testing-station": "testingStation",
                        "cave": "cave",
                    };
                    return Array.from(document.querySelectorAll("[data-poitype]"))
                        .map((element) => {
                            const methodType = element.getAttribute("data-poitype");
                            const kind = typeMap[methodType];
                            if (!kind) return null;
                            const cell = element.closest("[data-main-cell]")?.getAttribute("data-main-cell") || element.getAttribute("data-main-cell") || "";
                            return {
                                kind,
                                cell,
                                subx: element.getAttribute("data-subx") || "",
                                suby: element.getAttribute("data-suby") || "",
                            };
                        })
                        .filter(Boolean);
                }"""
            )
        finally:
            await browser.close()

    fields_by_kind: dict[str, list[OverlayField]] = {kind: [] for kind in OVERLAY_TYPES}
    seen: set[tuple[str, str, str, str]] = set()
    for row in rows:
        kind = str(row.get("kind", ""))
        cell = str(row.get("cell", "")).upper()
        subx = str(row.get("subx", ""))
        suby = str(row.get("suby", ""))
        if kind not in fields_by_kind:
            continue
        if not re.fullmatch(r"[A-I]:[1-9]", cell) or subx not in SUBCELL_X_CENTER or suby not in SUBCELL_Y_CENTER:
            continue
        key = (kind, cell, subx, suby)
        if key in seen:
            continue
        seen.add(key)

        letter, column_text = cell.split(":")
        column_index = int(column_text) - 1
        row_index = 8 - LETTERS_BOTTOM_TO_TOP.index(letter)
        x = (column_index + SUBCELL_X_CENTER[subx]) / 9
        y = (row_index + SUBCELL_Y_CENTER[suby]) / 9
        fields_by_kind[kind].append(OverlayField(kind=kind, cell=cell, subx=subx, suby=suby, x=x, y=y))

    for fields in fields_by_kind.values():
        fields.sort(key=lambda item: (item.y, item.x))
    return fields_by_kind


def read_app_tile_url(root: Path) -> str:
    app_js = root / "public" / "app.js"
    if not app_js.exists():
        return DEFAULT_TILE_URL
    match = re.search(r'deep:\s*\{.*?tileUrl:\s*"([^"]+)"', app_js.read_text(encoding="utf-8"), re.S)
    return match.group(1) if match else DEFAULT_TILE_URL


def current_tile_url(root: Path) -> str:
    fallback = read_app_tile_url(root)
    try:
        version = json.loads(request_text(VERSION_URL))
        tile = version.get("data", {}).get("tiles", {}).get("deepdesert_1", {})
        if tile.get("url"):
            return f"https://cdn.th.gl/dune-awakening{tile['url']}?v=1"
    except Exception as exc:
        print(f"Could not check current Deep Desert tile version, using local app URL. ({exc})")
    return fallback


def tile_signature(tile_url: str) -> str:
    match = re.search(r"/map-tiles/([^/]+)/\{z\}/\{y\}/\{x\}", tile_url)
    if match:
        return match.group(1)
    match = re.search(r"/map-tiles/([^/]+)/\d+/\d+/\d+", tile_url)
    if match:
        return match.group(1)
    return "deepdesert_1"


def normalize_method_html(source: str) -> str:
    return html.unescape(source).replace("\r", "")


def method_week_label(source: str) -> str:
    match = re.search(r"Updated for:\s*</?[^>]*>\s*([^<\n]+)", source, re.I)
    if match:
        return " ".join(match.group(1).split())
    text = re.sub(r"<[^>]+>", " ", source)
    match = re.search(r"Updated for:\s*([^\n\r]+)", text, re.I)
    return " ".join(match.group(1).split()) if match else ""


def html_attrs(tag: str) -> dict[str, str]:
    return {
        name.lower(): html.unescape(value)
        for name, value in re.findall(r'([:\w-]+)\s*=\s*"([^"]*)"', tag)
    }


def overlay_fields_from_method(source: str, kind: str, method_type: str) -> list[OverlayField]:
    normalized = normalize_method_html(source)
    fields: list[OverlayField] = []
    seen: set[tuple[str, str, str]] = set()

    current_cell = ""
    tag_pattern = re.compile(r"<[^>]+>", re.S)
    for match in tag_pattern.finditer(normalized):
        tag = match.group(0)
        attrs = html_attrs(tag)

        if attrs.get("data-main-cell"):
            current_cell = attrs["data-main-cell"].upper()

        if attrs.get("data-poitype") != method_type:
            continue

        cell = attrs.get("data-main-cell", current_cell).upper()
        subx = attrs.get("data-subx", "")
        suby = attrs.get("data-suby", "")
        if not re.fullmatch(r"[A-I]:[1-9]", cell) or subx not in SUBCELL_X_CENTER or suby not in SUBCELL_Y_CENTER:
            continue

        key = (cell, subx, suby)
        if key in seen:
            continue
        seen.add(key)

        letter, column_text = cell.split(":")
        column_index = int(column_text) - 1
        row_index = 8 - LETTERS_BOTTOM_TO_TOP.index(letter)
        x = (column_index + SUBCELL_X_CENTER[subx]) / 9
        y = (row_index + SUBCELL_Y_CENTER[suby]) / 9
        fields.append(OverlayField(kind=kind, cell=cell, subx=subx, suby=suby, x=x, y=y))

    fields.sort(key=lambda item: (item.y, item.x))
    return fields


def write_overlay_json(path: Path, signature: str, fields_by_kind: dict[str, list[OverlayField]], dry_run: bool) -> None:
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
    else:
        data = {
            "description": "Deep Desert overlay data. Coordinates are normalized map positions from 0 to 1.",
            "default": {},
            "bySignature": {},
        }

    data["description"] = "Deep Desert overlay data. Coordinates are normalized map positions from 0 to 1."
    if isinstance(data.get("default"), list):
        data["default"] = {"spice": data["default"]}
    else:
        data.setdefault("default", {})
    data.setdefault("bySignature", {})
    data["bySignature"][signature] = {}

    for kind, fields in fields_by_kind.items():
        label = OVERLAY_TYPES[kind]["label"]
        data["bySignature"][signature][kind] = [
            {
                "x": round(field.x, 6),
                "y": round(field.y, 6),
                "label": f"{label} {index + 1}",
            }
            for index, field in enumerate(fields)
        ]

    text = json.dumps(data, indent=2) + "\n"
    if dry_run:
        print(text)
    else:
        path.write_text(text, encoding="utf-8")
        print(f"Updated {path}")


def parse_args() -> argparse.Namespace:
    root = project_root()
    parser = argparse.ArgumentParser(description="Sync Deep Desert overlays from Method's companion map.")
    parser.add_argument("--root", type=Path, default=root, help="Project root folder.")
    parser.add_argument("--json", type=Path, default=root / "public" / "deep-spice-fields.json", help="Overlay JSON file to update.")
    parser.add_argument("--method-url", default=METHOD_URL, help="Method Deep Desert companion URL.")
    parser.add_argument("--tile-url", default="", help="Override the Deep Desert tile URL used for the JSON signature.")
    parser.add_argument("--dry-run", action="store_true", help="Print JSON instead of writing it.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    json_path = args.json.resolve()
    tile_url = args.tile_url or current_tile_url(root)
    signature = tile_signature(tile_url)

    print(f"Deep Desert tile id: {signature}")
    print(f"Reading Method companion map: {args.method_url}")

    try:
        source = request_text(args.method_url)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"Could not read Method page: {exc}", file=sys.stderr)
        return 1

    fields_by_kind = {
        kind: overlay_fields_from_method(source, kind, config["method"])
        for kind, config in OVERLAY_TYPES.items()
    }

    if not any(fields_by_kind.values()):
        print("No overlay fields found in static HTML. Trying rendered page...")
        fields_by_kind = asyncio.run(rendered_method_fields(args.method_url))

    if not any(fields_by_kind.values()):
        print("No Method overlay fields found.", file=sys.stderr)
        return 2

    week = method_week_label(source)
    if week:
        print(f"Method map week: {week}")

    for kind, fields in fields_by_kind.items():
        label = OVERLAY_TYPES[kind]["label"]
        print(f"{label}: {len(fields)} found")
        for index, field in enumerate(fields):
            print(
                f"  {label} {index + 1}: "
                f"{field.cell} sub({field.subx},{field.suby}) x={field.x:.6f} y={field.y:.6f}"
            )

    write_overlay_json(json_path, signature, fields_by_kind, args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
