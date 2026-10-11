#!/usr/bin/env bash
set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "==================================================="
echo "WorkCred - Proof of work, work near you."
echo "==================================================="

node scripts/doctor.mjs

(sleep 2 && node scripts/open.mjs "http://localhost:4000/app") &

echo ""
echo "Starting WorkCred server on http://localhost:4000 ..."
echo "(Press Ctrl+C to stop)"
echo ""

exec node backend/src/server.js
