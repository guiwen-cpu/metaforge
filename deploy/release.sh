#!/bin/sh
set -eu

cd "$(dirname "$0")"
: "${TAG:?TAG 未设置}"

docker compose -f compose.yaml -f compose.prod.yaml pull
docker compose -f compose.yaml -f compose.prod.yaml --profile tools run --rm migrate
docker compose -f compose.yaml -f compose.prod.yaml up -d --remove-orphans
