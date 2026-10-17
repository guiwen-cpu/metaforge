#!/bin/sh
set -eu

: "${META_FORGE_APP_PASSWORD:?META_FORGE_APP_PASSWORD 未设置}"

{
  echo "select pg_advisory_lock(918273645);"
  cat /migrations/00_role.sql
  cat /migrations/10_platform.sql
  cat /sql/*.sql
  cat /migrations/99_grants.sql
  echo "select pg_advisory_unlock(918273645);"
} > /tmp/migrate.sql

psql -v ON_ERROR_STOP=1 -v app_pw="$META_FORGE_APP_PASSWORD" -f /tmp/migrate.sql
echo "migrations applied"
