#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${COPYPARTY_ENV_FILE:-${SCRIPT_DIR}/copyparty.env}"

if [[ ! -f "${ENV_FILE}" ]]; then
	echo "Copyparty env file not found: ${ENV_FILE}" >&2
	echo "Copy deploy/ubuntu/copyparty.env.example to deploy/ubuntu/copyparty.env first." >&2
	exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

required_vars=(
	COPYPARTY_PYTHON
	COPYPARTY_SCRIPT
	COPYPARTY_VOLUME
	COPYPARTY_USER
	COPYPARTY_PASSWORD
	COPYPARTY_PORT
	COPYPARTY_BIND
)

for name in "${required_vars[@]}"; do
	if [[ -z "${!name:-}" ]]; then
		echo "Missing required variable ${name} in ${ENV_FILE}" >&2
		exit 1
	fi
done

if [[ ! -f "${COPYPARTY_SCRIPT}" ]]; then
	echo "Copyparty script not found: ${COPYPARTY_SCRIPT}" >&2
	exit 1
fi

if [[ ! -d "${COPYPARTY_VOLUME}" ]]; then
	echo "Copyparty volume not found: ${COPYPARTY_VOLUME}" >&2
	exit 1
fi

exec "${COPYPARTY_PYTHON}" "${COPYPARTY_SCRIPT}" \
	-a "${COPYPARTY_USER}:${COPYPARTY_PASSWORD}" \
	-v "${COPYPARTY_VOLUME}::rwmd,${COPYPARTY_USER}" \
	-p "${COPYPARTY_PORT}" \
	-e2dsa \
	-e2ts \
	-i "${COPYPARTY_BIND}"
