#!/usr/bin/env python3
"""Triggers one of the cron endpoints (app/api/cron/**/route.ts).

Jobs:
    stats  POST /api/cron        instance stats (app/api/cron/route.ts)
    daily  POST /api/cron/daily  streak rollup (app/api/cron/daily/route.ts)

Required env:
    CRON_SECRET  must match the CRON_SECRET the app was deployed with

Optional env:
    CRON_JOB       job name, for platforms that can only set env vars
    CRON_BASE_URL  origin to hit instead of production (e.g. http://localhost:3000)

Usage in a hosting platform cron job:
    CRON_SECRET=xxx python3 scripts/run-cron.py          # stats, every 5 min
    CRON_SECRET=xxx python3 scripts/run-cron.py daily    # streaks, once a day

Uses only the standard library, so it runs as-is on python:3.12-slim with no
packages to install. Exits non-zero on any non-2xx response so the platform
marks the run failed.
"""

import os
import sys
import time
import urllib.error
import urllib.request

DEFAULT_BASE_URL = "https://horus.hackclub.com"
JOBS = {
    "stats": "/api/cron",
    "daily": "/api/cron/daily",
}
DEFAULT_JOB = "stats"
TIMEOUT_SECONDS = 300
ATTEMPTS = 4
RETRY_DELAY_SECONDS = 5


def log(job: str, message: str) -> None:
    # flush so the platform's log collector sees lines as they happen
    print(f"[cron:{job}] {message}", flush=True)


def resolve_job() -> str:
    # cli arg wins, env is the fallback for platforms without a command field
    job = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("CRON_JOB", "")).strip()
    return job or DEFAULT_JOB


def endpoint_for(job: str) -> str:
    base = os.environ.get("CRON_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    return f"{base}{JOBS[job]}"


def post(endpoint: str, secret: str) -> tuple[int, str]:
    request = urllib.request.Request(
        endpoint,
        method="POST",
        headers={"cron-secret": secret},
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.status, response.read().decode(errors="replace")
    except urllib.error.HTTPError as error:
        # 4xx/5xx still carry a body worth logging
        return error.code, error.read().decode(errors="replace")


def main() -> int:
    job = resolve_job()
    if job not in JOBS:
        known = ", ".join(sorted(JOBS))
        log("?", f"unknown job {job!r}, expected one of: {known}")
        return 1

    secret = os.environ.get("CRON_SECRET")
    if not secret:
        log(job, "CRON_SECRET is not set")
        return 1

    endpoint = endpoint_for(job)

    for attempt in range(1, ATTEMPTS + 1):
        try:
            status, body = post(endpoint, secret)
        except (urllib.error.URLError, TimeoutError) as error:
            # connection refused, dns failure, timeout: worth another try
            status, body = None, str(error)
        else:
            # only server errors are worth retrying, a 401 will stay a 401
            if status < 500:
                log(job, f"POST {endpoint} -> {status}")
                log(job, body.strip())
                return 0 if 200 <= status < 300 else 1

        label = status if status is not None else "no response"
        if attempt < ATTEMPTS:
            log(job, f"attempt {attempt}/{ATTEMPTS} failed ({label}), retrying in {RETRY_DELAY_SECONDS}s")
            time.sleep(RETRY_DELAY_SECONDS)
        else:
            log(job, f"POST {endpoint} -> {label}")
            log(job, body.strip())

    return 1


if __name__ == "__main__":
    sys.exit(main())
