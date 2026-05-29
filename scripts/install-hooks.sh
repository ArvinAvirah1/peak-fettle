#!/bin/sh
# Install git hooks for Peak Fettle.
# Run once after cloning: sh scripts/install-hooks.sh
REPO_ROOT=$(git rev-parse --show-toplevel)
HOOKS_DIR="$REPO_ROOT/.git/hooks"

cp "$REPO_ROOT/scripts/pre-commit.sh" "$HOOKS_DIR/pre-commit"
chmod +x "$HOOKS_DIR/pre-commit"
echo "Installed pre-commit hook -> $HOOKS_DIR/pre-commit"
