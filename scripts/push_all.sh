#!/bin/bash

# push_all.sh - Project-specific configuration for push_projects.sh
#
# Defines the ViaInk (screenwriter/writing) family projects in dependency
# order and sources the reusable push_projects.sh script from the workflows
# repo.
#
# Usage:
#   ./push_all.sh                              # Update deps and process only projects with changes
#   ./push_all.sh --force                      # Force version bump on all projects
#   ./push_all.sh --subpackages                # Also process sub-packages in /packages directories
#   ./push_all.sh --starting-project <name>    # Skip projects until reaching <name>
#   ./push_all.sh --help                       # Show help message

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Define projects in dependency order with wait times
# Format: "relative_path:wait_after_in_seconds"
#
# Unlike the music/sudojo families, every consumer here resolves its
# `@sudobility/*` siblings by LOCAL PATH (`tsconfig.json` `paths` + a
# `vitest.config.ts`/Vite alias to `../<sibling>/src/index.ts`), not by
# installing a published npm version — this whole family is still in its
# "local-packages phase" (see each repo's own CLAUDE.md). So, unlike
# music_app/scripts/push_all.sh, a wait here is NOT gating the next project's
# ability to resolve a fresh version: nothing in this family ever does
# `bun add @sudobility/<sibling>@<version>`. The waits below are kept small
# and are 0 for every project that does not publish to npm at all
# (`skip-npm-publish: true` in its own CI) — for those, per
# push_projects.sh's own note, any number here is a plain, unconditional
# sleep with nothing to wait for, so 0 is correct.
PROJECTS=(
    # The foundation: the pure layout/model engine. No `@sudobility/*` sibling
    # dependency of its own. Publishes to npm (public).
    "../writing_core:30"
    # Shared wire/document types. Depends only on writing_core. Publishes to
    # npm (public).
    "../screenwriter_types:30"
    # Fountain/FDX import-export conversions. Depends only on writing_core.
    # Publishes to npm (public).
    "../writing_formats:30"
    # The React speed-view editor components. Depends only on writing_core.
    # Publishes to npm (public).
    "../writing_ui:30"
    # Network client (REST + sync socket). Depends on screenwriter_types and
    # writing_core. `private: true`: CI runs tests only, no publish.
    "../screenwriter_client:0"
    # Frontend business-logic library, between screenwriter_client and the UI.
    # Depends on screenwriter_client, screenwriter_types and writing_core.
    # `private: true`: CI runs tests only, no publish.
    "../screenwriter_lib:0"
    # The REST API service. Depends on screenwriter_types, writing_core and
    # writing_formats. `private: true`: CI runs tests only, no publish.
    "../screenwriter_api:0"
    # MCP server: a thin HTTP client over screenwriter_api's REST API — no
    # `@sudobility/*` sibling import at all, but versioned/pushed alongside
    # its natural pair. `private: true`: CI runs tests only, no publish.
    "../screenwriter_api_mcp:0"
    # The web app itself, last: it depends on screenwriter_client,
    # screenwriter_lib, screenwriter_types, writing_core and writing_ui, and
    # nothing depends on it. `private: true`, no CI workflow at all (kept out
    # of this family's CI rollout on purpose) — this entry exists to version,
    # commit and push it like every other repo.
    "../screenwriter_app:0"
)

# Source reusable script: prefer local workflows repo, fall back to GitHub
LOCAL_SCRIPT="$(cd "$BASE_DIR" && pwd)/../workflows/scripts/push_projects.sh"
if [ -f "$LOCAL_SCRIPT" ]; then
    source "$LOCAL_SCRIPT"
else
    PUSH_SCRIPT=$(mktemp)
    trap "rm -f $PUSH_SCRIPT" EXIT
    if ! curl -fsSL "https://raw.githubusercontent.com/johnqh/workflows/main/scripts/push_projects.sh" -o "$PUSH_SCRIPT"; then
        echo "Error: Failed to download push_projects.sh from GitHub"
        exit 1
    fi
    source "$PUSH_SCRIPT"
fi

# Parse command-line arguments
parse_args "$@"

# Run the push process
run_push_projects "$BASE_DIR" "${PROJECTS[@]}"
