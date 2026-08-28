#!/usr/bin/env bash
# Idempotent production deploy for the ThatFridge API.
#
# Runs ON THE SERVER as the `deploy` user — by hand (`./scripts/deploy.sh`) or over
# SSH from .github/workflows/deploy-api.yml. Assumes the one-time server setup in
# backend/DEPLOY.md (§1–§9) is already done.
#
# Needs passwordless sudo for three commands — see the sudoers drop-in in DEPLOY.md §CD.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/thatfridge}"
BRANCH="${DEPLOY_BRANCH:-main}"
PHP_FPM="${PHP_FPM:-php8.5-fpm}"

cd "$APP_DIR"
echo "==> git fetch + reset to origin/$BRANCH"
git fetch --prune origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
NEW_REF="$(git rev-parse --short HEAD)"

cd "$APP_DIR/backend"

echo "==> composer install (no-dev)"
composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader

echo "==> maintenance mode on"
php artisan down --retry=15 || true
restore_up() { php artisan up || true; }
trap restore_up EXIT

echo "==> migrate"
php artisan migrate --force

echo "==> rebuild caches"
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache
php artisan storage:link || true

echo "==> restart workers + reload php-fpm"
php artisan queue:restart                              # graceful: worker finishes its job, then systemd respawns it
sudo systemctl restart thatfridge-scheduler            # schedule:work does not hot-reload code
sudo systemctl reload "$PHP_FPM"                       # clear OPcache

php artisan up
trap - EXIT

echo "==> deployed $NEW_REF"
