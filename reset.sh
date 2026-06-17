#!/bin/sh
set -e

clear_sessions=${1:-false}

curl -sS -X POST http://127.0.0.1:3000/reset \
  -H "Content-Type: application/json" \
  -d "{\"clearSessions\": ${clear_sessions}}"
