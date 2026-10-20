#!/bin/sh
set -eu

: "${META_FORGE_APP_PASSWORD:?META_FORGE_APP_PASSWORD 未设置}"

{
  echo "select pg_advisory_lock(918273645);"
  cat /migrations/00_role.sql
  cat /migrations/10_platform.sql
  cat /migrations/20_runtime.sql
  cat /migrations/21_notifications.sql
  cat /migrations/22_action_runs.sql
  cat /migrations/30_identity.sql
  cat /migrations/31_identity_demo.sql
  cat /migrations/32_auth_security.sql
  cat /sql/*.sql
  cat /migrations/99_grants.sql
  echo "select pg_advisory_unlock(918273645);"
} > /tmp/migrate.sql

psql -v ON_ERROR_STOP=1 -v app_pw="$META_FORGE_APP_PASSWORD" -f /tmp/migrate.sql
echo "migrations applied"