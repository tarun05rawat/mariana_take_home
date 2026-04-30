#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MISSING=()

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

print_header() {
  printf "\n==> %s\n" "$1"
}

install_with_brew_if_available() {
  local package="$1"

  if ! command_exists brew; then
    return 1
  fi

  print_header "Installing ${package} with Homebrew"
  brew install "$package"
}

ensure_command() {
  local cmd="$1"
  local brew_package="$2"
  local label="$3"

  if command_exists "$cmd"; then
    return 0
  fi

  printf "Missing %s.\n" "$label"

  if [[ "$(uname -s)" == "Darwin" ]] && install_with_brew_if_available "$brew_package"; then
    return 0
  fi

  MISSING+=("$label")
  return 1
}

print_header "Checking prerequisites"
ensure_command node node "Node.js 20+"
ensure_command npm node "npm 10+"
ensure_command python3 python "Python 3.11+"
ensure_command sqlite3 sqlite "sqlite3 CLI"

if (( ${#MISSING[@]} > 0 )); then
  printf "\nSetup cannot continue until these prerequisites are installed:\n"
  for item in "${MISSING[@]}"; do
    printf "  - %s\n" "$item"
  done

  if [[ "$(uname -s)" == "Darwin" ]]; then
    printf "\nOn macOS, you can usually install them with:\n"
    printf "  brew install node python sqlite\n"
  fi

  exit 1
fi

print_header "Installing frontend dependencies"
npm install

print_header "Creating Python virtual environment"
python3 -m venv .venv

print_header "Installing Python dependencies"
./.venv/bin/pip install -r requirements.txt

print_header "Setup complete"
printf "Next steps:\n"
printf "  npm run import-data\n"
printf "  npm run dev\n"
