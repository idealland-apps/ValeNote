#!/usr/bin/env python3
"""Exercise a built ValeNote server against disposable data, then stop it.

Usage: python3 scripts/search_smoke.py /absolute/path/to/valenote
Requires a built web/dist (npm ci && npm run build in web/).
The existing server binds all interfaces; use only on a trusted development host.
"""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def main():
    repo = Path(__file__).resolve().parents[1]
    binary = Path(sys.argv[1]).resolve()
    with tempfile.TemporaryDirectory(prefix="valenote-search-smoke-") as tmp:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        base = f"http://127.0.0.1:{port}"
        env = dict(os.environ, VALENOTE_PORT=str(port), VALENOTE_DATA_PATH=tmp + "/data",
                   VALENOTE_NOTES_PATH=tmp + "/notes", VALENOTE_SECRET_KEY=secrets.token_hex(32),
                   VALENOTE_MODE="release")
        headers = {}
        checks = []

        def request(method, path, data=None, auth=None) -> Any:
            body = None if data is None else json.dumps(data).encode()
            h = dict(headers if auth is None else auth)
            if body is not None:
                h["Content-Type"] = "application/json"
            with urlopen(Request(base + path, data=body, headers=h, method=method), timeout=15) as res:
                raw = res.read()
                if not raw:
                    return None
                if "application/json" in res.headers.get("Content-Type", ""):
                    return json.loads(raw)
                return raw.decode()

        def query(q, notebook=None, endpoint="/api/v1/search/fulltext", auth=None):
            args = {"q": q}
            if notebook is not None:
                args["notebook"] = notebook
            return request("GET", endpoint + "?" + urlencode(args), auth=auth)

        def create(path, content, title="fixture"):
            return request("POST", "/api/v1/notes", {"path": path, "title": title, "content": content})

        log_path = Path(tmp) / "server.log"
        with log_path.open("wb") as log:
            proc = subprocess.Popen([str(binary)], cwd=repo, env=env, stdout=log, stderr=log)
            try:
                deadline = time.monotonic() + 20
                while True:
                    if proc.poll() is not None:
                        raise RuntimeError("server exited before readiness")
                    try:
                        assert request("GET", "/health") == {"status": "ok"}
                        break
                    except (URLError, ConnectionError):
                        if time.monotonic() >= deadline:
                            raise RuntimeError("server readiness timeout")
                        time.sleep(0.1)
                checks.append("real binary health")
                assert '<div id="root">' in request("GET", "/app")
                checks.append("built frontend served")
                login = request("POST", "/api/v1/auth/login", {"username": "admin", "password": "admin123abc"})
                headers["Authorization"] = "Bearer " + login["token"]
                private = request("POST", "/api/v1/notebooks", {"name": "a_private"})
                allowed = request("POST", "/api/v1/notebooks", {"name": "z_allowed"})
                create("z_allowed/edit.md", "oldmarker", "edit")
                assert len(query("oldmarker")) == 1
                request("PUT", "/api/v1/notes/z_allowed/edit.md", {"content": "# edit\nnewmarker\n中文摘要跨行\n第二个词"})
                assert not query("oldmarker") and len(query("newmarker")) == 1
                hit = query("中文摘要 第二个词")[0]
                assert "\ufffd" not in hit["snippet"]
                checks.append("edit visible; cross-line AND; valid Chinese snippet")
                assert len(query("newmarker", endpoint="/api/v1/search")) == 1
                versions = request("GET", "/api/v1/versions/z_allowed/edit.md")
                request("POST", "/api/v1/version/z_allowed/edit.md?" + urlencode({"id": versions[0]["id"]}))
                assert len(query("oldmarker")) == 1 and not query("newmarker")
                checks.append("version restore visible")
                request("POST", "/api/v1/files/copy", {"source": "z_allowed/edit.md", "target": "z_allowed/folder/copy.md"})
                assert len(query("oldmarker")) == 2
                request("POST", "/api/v1/files/move", {"source": "z_allowed/folder", "target": "z_allowed/renamed"})
                paths = {r["path"] for r in query("oldmarker")}
                assert paths == {"z_allowed/edit.md", "z_allowed/renamed/copy.md"}
                request("DELETE", "/api/v1/folders/z_allowed/renamed")
                request("DELETE", "/api/v1/notes/z_allowed/edit.md")
                assert not query("oldmarker")
                checks.append("copy/move/delete folder/delete note visible")
                create("z_allowed/result.md", "needle body", "needle")
                for i in range(25):
                    create(f"a_private/{i:02}.md", "needle private", "needle")
                agent = request("POST", "/api/v1/agents", {"name": "smoke-reader"})
                agent_id = agent["agent"]["id"]
                agent_auth = {"Authorization": "Bearer " + agent["api_key"]}
                assert not query("needle", endpoint="/api/v1/agent/search", auth=agent_auth)
                request("PUT", f"/api/v1/agents/{agent_id}/permissions", {"permissions": [{"notebook_id": allowed["id"], "access_level": "read"}]})
                rest = query("needle", endpoint="/api/v1/agent/search", auth=agent_auth)
                assert len(rest) == 1 and rest[0]["path"] == "z_allowed/result.md" and rest[0]["snippet"]
                rpc = request("POST", "/mcp", {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "search_notes", "arguments": {"query": "needle"}}}, auth=agent_auth)
                assert not rpc.get("error") and not rpc["result"].get("isError")
                assert json.loads(rpc["result"]["content"][0]["text"]) == rest
                checks.append("REST/MCP permission-before-limit and one-shot snippets")
                try:
                    query("needle", "a_private", "/api/v1/agent/search", agent_auth)
                    raise AssertionError("private notebook allowed")
                except HTTPError as error:
                    assert error.code == 403
                request("PUT", "/api/v1/notebooks/z_allowed", {"name": "renamed_book"})
                assert len(query("needle", "renamed_book")) == 1
                assert not query("needle", "z_allowed")
                checks.append("notebook rename visible; explicit scope enforced")
                if "--browser" in sys.argv[2:]:
                    browser_env = dict(os.environ, VALENOTE_SMOKE_URL=base, VALENOTE_SMOKE_TOKEN=login["token"])
                    subprocess.run(["node", str(repo / "scripts/search_browser_smoke.mjs")],
                                   cwd=repo, env=browser_env, check=True, timeout=60)
                    checks.append("real Chromium search lifecycle")
                print(json.dumps({"status": "PASS", "checks": checks}, ensure_ascii=False, indent=2))
            except BaseException:
                # Ephemeral logs may include generated API keys; do not print them.
                print(f"Smoke test failed; server log exists only until fixture cleanup: {log_path}", file=sys.stderr)
                raise
            finally:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5)


if __name__ == "__main__":
    main()
