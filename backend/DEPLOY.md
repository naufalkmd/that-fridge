# Deploying the ThatFridge API to a VPS

Target: `https://api.thatfridge.com` serving the Laravel API, with Postgres, Redis, a queue
worker and the scheduler — all on one small server. Good enough for launch; move photos to S3
and split the DB out post-launch.

Doing the VPS first is the right order: it gives you the IP for DNS, unblocks the API deploy,
and (optionally) can also host the `apps/legal` static pages.

---

## 0. Pick a server

Audience is **Malaysia + Korea**, so host in **APAC**, not the EU.

| Option | Region | Spec | ~Price | Notes |
| --- | --- | --- | --- | --- |
| **Vultr / DigitalOcean / Linode — Singapore** | Singapore | 1–2 vCPU / 2 GB / 50–60 GB | ~$12–18/mo | **Best single location for both markets** — ~5–15 ms to MY, ~70–90 ms to KR. |
| **Vultr — Seoul** | Seoul | same | ~$12–18/mo | Only if Korea is the primary market — ~30 ms to KR, ~70 ms to MY. |
| **AWS Lightsail — Singapore or Seoul** | either | 2 GB | ~$12/mo | If you'd rather stay in the AWS ecosystem for a later S3 move. |

Recommended: **Singapore**. Put Cloudflare in front of the static `thatfridge.com` pages so
those are fast globally regardless; the API benefits most from being close to both countries,
which Singapore is.

Minimum **2 GB RAM** (Postgres + Redis + PHP-FPM + queue + scheduler). OS: **Ubuntu 24.04 LTS**.
Add your SSH public key at creation. Note the public IP → you'll point `api.thatfridge.com` at it.

---

## 1. First login & base hardening

```bash
ssh root@SERVER_IP

# non-root deploy user
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# firewall
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw --force enable

apt update && apt -y upgrade
apt -y install fail2ban unattended-upgrades
```

Reconnect as `deploy` for everything below (`ssh deploy@SERVER_IP`). Use `sudo` where shown.

---

## 2. Install the stack

```bash
sudo apt -y install nginx redis-server postgresql postgresql-contrib \
  git unzip curl acl \
  php8.3-fpm php8.3-cli php8.3-pgsql php8.3-redis php8.3-mbstring \
  php8.3-xml php8.3-curl php8.3-zip php8.3-bcmath php8.3-intl php8.3-gd

# Composer
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer

sudo systemctl enable --now redis-server postgresql php8.3-fpm nginx
```

Confirm PHP version: `php -v` → 8.3.x (the app requires `^8.3`).

---

## 3. Database

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE thatfridge LOGIN PASSWORD 'CHANGE_ME_STRONG';
CREATE DATABASE thatfridge OWNER thatfridge;
SQL
```

Redis needs no config for our use (localhost, no password). If the box is shared or exposed,
set `requirepass` in `/etc/redis/redis.conf` and put it in `REDIS_PASSWORD`.

---

## 4. Get the code

Use a read-only **deploy key** (GitHub repo → Settings → Deploy keys) rather than a personal token.

```bash
sudo mkdir -p /var/www && sudo chown deploy:deploy /var/www
cd /var/www
git clone git@github.com:naufalkmd/that-fridge.git thatfridge
cd thatfridge/backend

composer install --no-dev --optimize-autoloader
```

(The API needs no `npm` build — skip the `composer setup` script, which is for local dev.)

---

## 5. Production `.env`

```bash
cp .env.production.example .env      # pre-filled template — see backend/.env.production.example
php artisan key:generate
nano .env
```

Fill every `CHANGE_ME`. The key settings:

```dotenv
APP_NAME=ThatFridge
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.thatfridge.com          # must be the public HTTPS URL — Storage::url() uses it

LOG_CHANNEL=stack
LOG_LEVEL=warning

DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=thatfridge
DB_USERNAME=thatfridge
DB_PASSWORD=CHANGE_ME_STRONG

SESSION_DRIVER=redis
CACHE_STORE=redis
QUEUE_CONNECTION=redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=null

FILESYSTEM_DISK=public                        # receipts/photos/icons live in storage/app/public

# Transactional mail — pick a provider (Postmark, Resend, SES…) so password resets work
MAIL_MAILER=smtp
MAIL_HOST=...
MAIL_PORT=587
MAIL_USERNAME=...
MAIL_PASSWORD=...
MAIL_FROM_ADDRESS="no-reply@thatfridge.com"
MAIL_FROM_NAME=ThatFridge

# AI providers (same keys as local dev)
OPENROUTER_API_KEY=...
FAL_KEY=...

# Lock CORS to the app's origins (see note below)
```

> **CORS:** the mobile app isn't a browser origin, so CORS mostly matters once the web build
> ships. `config/cors.php` currently allows all — before launch, restrict `allowed_origins` to
> your real web origin(s). Native app requests are unaffected.

---

## 6. Migrate, seed the reviewer account, cache

```bash
php artisan migrate --force
php artisan db:seed --force                       # 4 test users (all password123)
EMAIL=keira@thatfridge.test sh scripts/seed-demo-fridge.sh   # realistic data for App Review

php artisan storage:link
php artisan config:cache route:cache view:cache event:cache
```

> Change the seeded reviewer password from the default before submitting, and put the real
> credentials in the App Review notes + your password manager.

---

## 7. Permissions

Nginx/PHP-FPM run as `www-data`; you deploy as `deploy`. Give both write access to the two
runtime dirs:

```bash
sudo chown -R deploy:www-data /var/www/thatfridge/backend/storage /var/www/thatfridge/backend/bootstrap/cache
sudo chmod -R ug+rwx        /var/www/thatfridge/backend/storage /var/www/thatfridge/backend/bootstrap/cache
sudo setfacl -R  -d -m u:www-data:rwx /var/www/thatfridge/backend/storage
```

---

## 8. Nginx + HTTPS

```bash
sudo nano /etc/nginx/sites-available/api.thatfridge.com
```

```nginx
server {
    listen 80;
    server_name api.thatfridge.com;
    root /var/www/thatfridge/backend/public;
    index index.php;

    client_max_body_size 12M;              # receipt / fridge photos

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }

    location ~ /\.(?!well-known).* { deny all; }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/api.thatfridge.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**Point DNS now** — an `A` record `api.thatfridge.com → SERVER_IP` — then:

```bash
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d api.thatfridge.com     # auto-renew timer is installed
```

---

## 9. Queue worker + scheduler (systemd)

The scheduler runs `app:check-item-freshness` (daily) and `app:snapshot-kitchen-scores`
(weekly) — freshness notifications don't get generated without it.

```bash
sudo nano /etc/systemd/system/thatfridge-worker.service
```

```ini
[Unit]
Description=ThatFridge queue worker
After=network.target redis-server.service

[Service]
User=deploy
Restart=always
WorkingDirectory=/var/www/thatfridge/backend
ExecStart=/usr/bin/php artisan queue:work redis --sleep=3 --tries=3 --max-time=3600

[Install]
WantedBy=multi-user.target
```

```bash
sudo nano /etc/systemd/system/thatfridge-scheduler.service
```

```ini
[Unit]
Description=ThatFridge scheduler
After=network.target

[Service]
User=deploy
Restart=always
WorkingDirectory=/var/www/thatfridge/backend
ExecStart=/usr/bin/php artisan schedule:work

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now thatfridge-worker thatfridge-scheduler
```

---

## 10. Smoke test

```bash
curl -sS -X POST https://api.thatfridge.com/api/login \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d '{"email":"keira@thatfridge.test","password":"password123"}'
# → { "user": {...}, "token": "..." }
```

Then in `apps/mobile/.env` (or the EAS build profile's env) set
`EXPO_PUBLIC_API_URL=https://api.thatfridge.com/api` and rebuild.

Laravel already exposes a health endpoint at **`https://api.thatfridge.com/up`** (configured in
`bootstrap/app.php`) — point uptime monitoring there, no route to add.

---

## 11. Backups

```bash
sudo nano /etc/cron.daily/thatfridge-backup
```

```bash
#!/bin/sh
set -e
D=$(date +\%F)
mkdir -p /var/backups/thatfridge
sudo -u postgres pg_dump thatfridge | gzip > /var/backups/thatfridge/db-$D.sql.gz
tar czf /var/backups/thatfridge/storage-$D.tgz -C /var/www/thatfridge/backend/storage/app/public .
find /var/backups/thatfridge -mtime +14 -delete
```

`sudo chmod +x /etc/cron.daily/thatfridge-backup`. Copy off-box (provider snapshots, or `rclone`
to object storage) — a backup only on the same server isn't a backup.

---

## 12. Deploying an update later

Run the deploy script as `deploy` on the server:

```bash
/var/www/thatfridge/backend/scripts/deploy.sh
```

It fetches `origin/main`, hard-resets, `composer install --no-dev`, migrates, rebuilds caches,
gracefully restarts the worker (`queue:restart`) + scheduler, reloads PHP-FPM, and wraps the
whole thing in `artisan down`/`up`. Idempotent — safe to re-run.

`.env`, `storage/`, and `bootstrap/cache/` are git-ignored, so the hard reset never touches them.

---

## 12a. Continuous deployment (GitHub Actions)

`.github/workflows/deploy-api.yml` runs on every push to `main` that touches `backend/**`:
run the PHPUnit suite on a clean PHP 8.3 runner, then SSH in and run `scripts/deploy.sh`.
`workflow_dispatch` lets you trigger it by hand from the Actions tab.

**One-time server setup:**

1. **Deploy SSH key for CI** — a dedicated keypair, separate from your personal one:

   ```bash
   # on your laptop
   ssh-keygen -t ed25519 -f ~/.ssh/thatfridge_ci -N "" -C "github-actions-deploy"
   ssh-copy-id -i ~/.ssh/thatfridge_ci.pub deploy@SERVER_IP
   ```

2. **The `deploy` user needs its own GitHub deploy key** so `git fetch` works non-interactively
   (this is the read-only key from §4, living at `/home/deploy/.ssh/id_ed25519`). Verify:
   `sudo -u deploy ssh -T git@github.com` → "successfully authenticated".

3. **Passwordless sudo for the three deploy commands only** — `sudo visudo -f /etc/sudoers.d/thatfridge-deploy`:

   ```
   deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart thatfridge-scheduler, /usr/bin/systemctl reload php8.3-fpm, /usr/bin/systemctl restart thatfridge-worker
   ```

**GitHub repo → Settings → Secrets and variables → Actions:**

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | the droplet's public IP (or `api.thatfridge.com`) |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | contents of `~/.ssh/thatfridge_ci` (the **private** key, full file) |

First deploy is still manual (§1–§11). After that, merging to `main` ships the API.

---

## 13. Post-launch hardening (not blocking)

- Move `storage/app/public` to S3 (`FILESYSTEM_DISK=s3`) so photos survive a server rebuild.
- Sentry: `composer require sentry/sentry-laravel`, set `SENTRY_LARAVEL_DSN`.
- Rate-limit `/api/login` + `/api/register` (`throttle` middleware) against credential stuffing.
- Managed Postgres + Redis; separate app server.
- Restrict `config/cors.php` `allowed_origins` to the real web origin.

---

## Optional — host the legal pages here too

Instead of Cloudflare Pages you can serve `apps/legal` from the same box:

```nginx
server {
    listen 80;
    server_name thatfridge.com www.thatfridge.com;
    root /var/www/thatfridge/apps/legal;
    location / { try_files $uri $uri/ $uri/index.html =404; }
}
```

Then `sudo certbot --nginx -d thatfridge.com -d www.thatfridge.com`. DNS: `A` records for
`@` and `www` → `SERVER_IP`.
