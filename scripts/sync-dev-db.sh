#!/usr/bin/env bash
# Copy schema + data from SOURCE_DATABASE_URL into DATABASE_URL.
#
# Safety: refuses to run unless DATABASE_URL contains "_dev" and
# SOURCE_DATABASE_URL does not contain "_dev" anywhere in the string.
# The target is wiped (schema public dropped) before restoring.
#
#   ./scripts/sync-dev-db.sh          # prompts for confirmation
#   ./scripts/sync-dev-db.sh --yes    # no prompt
#   ./scripts/sync-dev-db.sh --keep   # don't drop schema public first

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"

ASSUME_YES=0
DROP_SCHEMA=1
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    --keep)   DROP_SCHEMA=0 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# Load only the two vars we care about, without clobbering an explicit override.
if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r line; do
    key="${line%%=*}"
    [[ -n "${!key:-}" ]] && continue
    eval "export $line"
  done < <(grep -E '^\s*(SOURCE_)?DATABASE_URL=' "$ENV_FILE" || true)
fi

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is not set}"
: "${DATABASE_URL:?DATABASE_URL is not set}"

# Hack Club's tier2 Postgres presents a publicly-trusted cert, but sslmode=verify-full
# needs a CA bundle to check it against; sslrootcert=system uses the OS trust store.
with_system_ca() {
  local url="$1" hostport host sep
  hostport="${url#*://}"
  hostport="${hostport##*@}"   # drop userinfo
  hostport="${hostport%%/*}"   # drop path/query
  host="${hostport%%:*}"       # drop port
  if [[ "$host" != *.infra.hackclub.com || "$url" == *sslrootcert=* ]]; then
    printf '%s' "$url"
    return 0
  fi
  sep='?'
  [[ "$url" == *\?* ]] && sep='&'
  printf '%s%ssslrootcert=system' "$url" "$sep"
}

SOURCE_DATABASE_URL="$(with_system_ca "$SOURCE_DATABASE_URL")"
DATABASE_URL="$(with_system_ca "$DATABASE_URL")"

# --- guards -----------------------------------------------------------------
if [[ "$DATABASE_URL" != *"_dev"* ]]; then
  echo "refusing: DATABASE_URL does not contain \"_dev\" — target must be a dev database" >&2
  exit 1
fi
if [[ "$SOURCE_DATABASE_URL" == *"_dev"* ]]; then
  echo "refusing: SOURCE_DATABASE_URL contains \"_dev\" — source must not be a dev database" >&2
  exit 1
fi
if [[ "$SOURCE_DATABASE_URL" == "$DATABASE_URL" ]]; then
  echo "refusing: source and target are the same URL" >&2
  exit 1
fi

for bin in pg_dump pg_restore psql; do
  command -v "$bin" >/dev/null || { echo "missing required binary: $bin" >&2; exit 1; }
done

redact() { sed -E 's#(://[^:/@]+):[^@]*@#\1:***@#' <<<"$1"; }

echo "source: $(redact "$SOURCE_DATABASE_URL")"
echo "target: $(redact "$DATABASE_URL")"
if (( DROP_SCHEMA )); then
  echo "target schema \"public\" will be DROPPED and replaced with the source."
else
  echo "restoring with --clean --if-exists (objects absent from the source are left alone)."
fi

if (( ! ASSUME_YES )); then
  read -r -p "continue? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "aborted."; exit 1; }
fi

DUMP="$(mktemp -t sync-dev-db.XXXXXX.dump)"
trap 'rm -f "$DUMP"' EXIT

echo "==> dumping source"
pg_dump --format=custom --no-owner --no-privileges --no-acl \
  --file="$DUMP" "$SOURCE_DATABASE_URL"

if (( DROP_SCHEMA )); then
  echo "==> resetting target schemas"
  # Drop every user schema, not just public: the dump also carries things like
  # drizzle's migration schema, which would otherwise collide on restore.
  psql --quiet --no-psqlrc --set=ON_ERROR_STOP=1 "$DATABASE_URL" <<'SQL'
do $$
declare s text;
begin
  for s in
    select nspname from pg_namespace
    where nspname not in ('information_schema', 'pg_catalog', 'pg_toast')
      and nspname !~ '^pg_'
  loop
    execute format('drop schema if exists %I cascade', s);
  end loop;
end $$;
create schema if not exists public;
SQL
fi

echo "==> restoring into target"
# pg_restore exits non-zero on benign errors (e.g. extensions needing superuser);
# surface them without failing the whole sync.
RESTORE_ARGS=(--no-owner --no-privileges --no-acl --dbname="$DATABASE_URL")
(( DROP_SCHEMA )) || RESTORE_ARGS+=(--clean --if-exists)
if ! pg_restore "${RESTORE_ARGS[@]}" "$DUMP"; then
  echo "pg_restore reported errors (see above) — check the target before using it." >&2
  exit 1
fi

echo "==> done"
psql --quiet --no-psqlrc --tuples-only "$DATABASE_URL" \
  -c "select count(*) || ' tables in public' from information_schema.tables where table_schema = 'public';"
