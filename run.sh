#!/bin/sh
node build/01-test-target-graphql-server/01-server/app.js &
cd 01-test-target-graphql-server/01-server/static
python3 -m http.server --bind 127.0.0.1 8081
