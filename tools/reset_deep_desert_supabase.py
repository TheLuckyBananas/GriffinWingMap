
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from sync_method_spice_fields import current_tile_url, project_root, tile_signature


STATE_KEY = "deep_desert_signature"


def request_json(url: str, service_key: str, method: str = "GET", body: object | None = None, extra_headers: dict[str, str] | None = None) -> object:
    headers = {
        "apikey": service_key,
        "authorization": f"Bearer {service_key}",
        "content-type": "application/json",
        "accept": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)

    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else None


def rest_url(base_url: str, path: str, query: dict[str, str] | None = None) -> str:
    url = base_url.rstrip("/") + "/rest/v1/" + path.lstrip("/")
    if query:
        url += "?" + urllib.parse.urlencode(query)
    return url


def read_previous_signature(supabase_url: str, service_key: str) -> str | None:
    url = rest_url(
        supabase_url,
        "map_state",
        {
            "select": "state_value",
            "state_key": f"eq.{STATE_KEY}",
            "limit": "1",
        },
    )
    rows = request_json(url, service_key)
    if isinstance(rows, list) and rows:
        value = rows[0].get("state_value")
        return str(value) if value else None
    return None


def upsert_signature(supabase_url: str, service_key: str, signature: str) -> None:
    url = rest_url(supabase_url, "map_state", {"on_conflict": "state_key"})
    request_json(
        url,
        service_key,
        method="POST",
        body=[{"state_key": STATE_KEY, "state_value": signature}],
        extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
    )


def delete_deep_desert_markers(supabase_url: str, service_key: str) -> None:
    url = rest_url(supabase_url, "base_markers", {"map_id": "eq.deep"})
    request_json(url, service_key, method="DELETE", extra_headers={"Prefer": "return=minimal"})


def parse_args() -> argparse.Namespace:
    root = project_root()
    parser = argparse.ArgumentParser(description="Reset Supabase Deep Desert markers when the weekly tile signature changes.")
    parser.add_argument("--root", type=Path, default=root, help="Project root folder.")
    parser.add_argument("--tile-url", default="", help="Override the Deep Desert tile URL used for the signature.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    supabase_url = os.environ.get("SUPABASE_URL", "").strip()
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not supabase_url or not service_key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.", file=sys.stderr)
        return 1

    tile_url = args.tile_url or current_tile_url(args.root.resolve())
    next_signature = tile_signature(tile_url)
    previous_signature = read_previous_signature(supabase_url, service_key)

    print(f"Deep Desert tile id: {next_signature}")
    print(f"Previous Supabase tile id: {previous_signature or '(none)'}")

    if previous_signature is None:
        upsert_signature(supabase_url, service_key, next_signature)
        print("Stored initial Deep Desert signature. No markers deleted.")
        return 0

    if previous_signature == next_signature:
        print("Deep Desert signature has not changed. No markers deleted.")
        return 0

    delete_deep_desert_markers(supabase_url, service_key)
    upsert_signature(supabase_url, service_key, next_signature)
    print("Deep Desert signature changed. Deleted old Deep Desert markers and stored the new signature.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
