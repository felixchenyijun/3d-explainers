#!/usr/bin/env bash
# One command: serve the walkthrough and open it. Ctrl-C stops the server.
set -e
cd "$(dirname "$0")"
PORT="${1:-8742}"
node serve.js "$PORT" &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 0.7
open "http://localhost:$PORT" 2>/dev/null || echo "open http://localhost:$PORT"
wait $SERVER
