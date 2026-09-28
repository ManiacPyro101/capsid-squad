#!/bin/sh
# Capsid Wasteland squad server for macOS / Linux. Needs Node.js 18+.
cd "$(dirname "$0")"
( sleep 1; (command -v open >/dev/null && open http://localhost:8787/) || (command -v xdg-open >/dev/null && xdg-open http://localhost:8787/) ) &
node relay_server.js
