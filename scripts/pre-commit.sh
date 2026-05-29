#!/bin/sh
# Peak Fettle pre-commit hook — runs parse-sweep before every commit.
# This file is committed to the repo. Install it with: sh scripts/install-hooks.sh
node peak-fettle-agents/server/scripts/parse-sweep.js || exit 1
