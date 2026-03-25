# Deploy to Hostinger Ubuntu VPS (GitHub Actions)

This project uses a GitHub Actions workflow at `.github/workflows/main.yml`.
On each push to `main`, it builds deployment artifacts and deploys to your VPS over SSH.

Layout matches **jwell_b2b-style** paths under one app directory:

- `/var/www/html/vpdm-task-manager/frontend` — Vite build, served by PM2 **`vpdm-task-web`** on **port 5173** (`npx serve`, same port family as `vite dev`)
- `/var/www/html/vpdm-task-manager/backend` — Nest API + Prisma + `.env` + PM2 **`vpdm-task-api`**
- `/var/www/html/vpdm-task-manager/backups` — deployment tar backups

Change **`FRONT_PORT`** in `.github/workflows/main.yml` if **5173** clashes with another app on the VPS.

## 1) One-time VPS setup

Run these commands on your VPS:

```bash
sudo apt update
sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
sudo mkdir -p /var/www/html/vpdm-task-manager/{frontend,backend,backups}
sudo chown -R "$USER":"$USER" /var/www/html/vpdm-task-manager
```

Put real values in `backend/.env` (`DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGINS`). You can either commit `backend/.env` (not recommended for production secrets) or create `/var/www/html/vpdm-task-manager/backend/.env` once on the server before the first deploy (the workflow can preserve it across deploys).

In `.github/workflows/main.yml`, set `RUN_PRISMA_MIGRATE=true` only after `DATABASE_URL` matches Postgres on the VPS (while `false`, `prisma migrate deploy` is skipped to avoid P1000).

If you previously ran PM2 from `~/apps/vpdm-task-manager/backend`, remove the old process once so the new path is used:

```bash
pm2 delete vpdm-task-api 2>/dev/null || true
```

Then run a fresh deploy so PM2 starts from `/var/www/html/vpdm-task-manager/backend`.

## 2) Nginx config

**Recommended (matches PM2 frontend):** proxy the browser to **`vpdm-task-web`** on **5173** so Nginx never exposes `backend/` or `.env` as static files.

Create `/etc/nginx/sites-available/vpdm-task-manager`:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:5173/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Adjust **`3001`** if `PORT` in `backend/.env` differs; adjust **`5173`** if you changed `FRONT_PORT` in the workflow.

**Alternative (no PM2 for frontend):** set `root /var/www/html/vpdm-task-manager/frontend;` and `try_files $uri /index.html` under `location /` instead of `proxy_pass` to **5173** — then you can remove the `vpdm-task-web` PM2 step from the workflow if you prefer Nginx-only static files.

Enable and reload:

```bash
sudo ln -sf /etc/nginx/sites-available/vpdm-task-manager /etc/nginx/sites-enabled/vpdm-task-manager
sudo nginx -t
sudo systemctl reload nginx
```

## 3) GitHub repository secrets

In GitHub repo settings, add:

- `SERVER_HOST` (your server IP/domain)
- `SERVER_USER` (server username)
- `SERVER_SSH_KEY` (private key content used by GitHub Actions)
- `SERVER_SSH_PASSPHRASE` (only if your private key is passphrase-protected; leave unset or empty if the key has no passphrase)

## 4) How the pipeline deploys

The workflow has 2 jobs:

1. **Build job** — builds `frontend/dist` and `backend/dist`, packs `frontend.tgz` and `backend.tgz` (includes `backend/.env` in the tarball when that file exists in the repo).
2. **Deploy job** — uploads to `/tmp/vpdm_deploy`, backs up `frontend/` and `backend/` into `backups/`, extracts artifacts into `/var/www/html/vpdm-task-manager/frontend` and `.../backend`, preserves existing server `backend/.env` when present, runs `npm ci --omit=dev`, optional `prisma migrate deploy`, restarts PM2 `vpdm-task-api`, runs a local HTTP health check on `/api`.

## 5) SSL (recommended)

After DNS is pointed to VPS:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```
