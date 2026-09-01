#!/bin/zsh
set -euo pipefail
umask 077

root_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$root_dir"
exec "$root_dir/start-local.sh"
