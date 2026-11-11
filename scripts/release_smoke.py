#!/usr/bin/env python3
"""Check a running release image against its expected version and PWA assets."""
import argparse
import json
import struct
import time
from urllib.error import URLError
from urllib.parse import urljoin
from urllib.request import urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base_url")
    parser.add_argument("version")
    args = parser.parse_args()
    base = args.base_url.rstrip("/") + "/"

    def get(path):
        with urlopen(urljoin(base, path), timeout=5) as response:
            return response.read()

    deadline = time.monotonic() + 30
    while True:
        try:
            assert json.loads(get("health")) == {"status": "ok"}
            break
        except (URLError, TimeoutError, ConnectionError):
            if time.monotonic() >= deadline:
                raise RuntimeError("release image did not become healthy") from None
            time.sleep(0.2)

    assert json.loads(get("api/v1/version"))["version"] == args.version
    html = get("app").decode()
    assert 'href="/assets/valenote.webmanifest"' in html
    manifest_url = urljoin(base, "assets/valenote.webmanifest")
    manifest = json.loads(get(manifest_url))
    assert manifest["name"] == "ValeNote"
    assert manifest["display"] == "standalone"
    assert manifest["start_url"] == "/app"
    assert manifest["scope"] == "/"
    for size in (192, 512):
        icon = next(item for item in manifest["icons"] if item["sizes"] == f"{size}x{size}")
        png = get(urljoin(manifest_url, icon["src"]))
        assert png[:8] == b"\x89PNG\r\n\x1a\n"
        assert struct.unpack(">II", png[16:24]) == (size, size)
    print(json.dumps({"status": "PASS", "version": args.version,
                      "checks": ["container health", "embedded version", "built frontend", "standalone manifest", "192/512 PNG icons"]}))


if __name__ == "__main__":
    main()
