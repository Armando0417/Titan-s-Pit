#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
NODE_BIN="${NODE_BIN:-node}"

cd "${REPO_DIR}"

if [[ ! -f ".env" ]]; then
	echo "Titan's Pit .env not found in ${REPO_DIR}" >&2
	echo "Copy deploy/ubuntu/titans-pit.env.example to .env first." >&2
	exit 1
fi

if [[ ! -f "build/index.js" ]]; then
	echo "Production build not found in ${REPO_DIR}/build" >&2
	echo "Run npm install && npm run build first." >&2
	exit 1
fi

exec "${NODE_BIN}" --env-file=.env build
