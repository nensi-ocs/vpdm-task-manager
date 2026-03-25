# Deploy to Hostinger Ubuntu VPS (GitHub Actions)

This project uses a GitHub Actions workflow at `.github/workflows/main.yml`.
On each push to `main`, it builds deployment artifacts and deploys to your VPS over SSH.

## 1) One-time VPS setup

Run these commands on your VPS:

```bash
sudo apt update
sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
sudo mkdir -p /var/www/html/vpdm-task-manager
sudo chown -R "$USER":"$USER" /var/www/html/vpdm-task-manager
```

Put real values in `backend/.env` (`DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGINS`). Until `DATABASE_URL` matches Postgres on the VPS, keep `RUN_PRISMA_MIGRATE=false` in `.github/workflows/main.yml` so deploy skips `prisma migrate deploy` (avoids P1000). Set `RUN_PRISMA_MIGRATE=true` once the DB credentials are correct.

Example (manual):

```bash
mkdir -p ~/apps/vpdm-task-manager/backend
cp ~/apps/vpdm-task-manager/backend/.env.example ~/apps/vpdm-task-manager/backend/.env
nano ~/apps/vpdm-task-manager/backend/.env
```

## 2) Nginx config

Create `/etc/nginx/sites-available/vpdm-task-manager`:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    root /var/www/html/vpdm-task-manager;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri /index.html;
    }
}
```

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

1. **Build job**
   - Builds frontend (`frontend/dist`) and backend (`backend/dist`) in CI.
   - Creates two artifacts: `frontend.tgz` and `backend.tgz`.
2. **Deploy job**
   - Uploads artifacts to `/tmp/vpdm_deploy` on the VPS.
   - Backs up current deployment files.
   - Deploys frontend to `/var/www/html/vpdm-task-manager`.
   - Deploys backend to `~/apps/vpdm-task-manager/backend` (`.env` is included in the backend artifact if `backend/.env` exists in the repo at build time).
   - Installs backend production dependencies (`npm ci --omit=dev`), loads `.env`, then optionally runs `prisma migrate deploy`.
   - In `.github/workflows/main.yml`, the remote script sets `RUN_PRISMA_MIGRATE=false` by default so deploy does not fail with **P1000** while `DATABASE_URL` still points at wrong credentials. Set `RUN_PRISMA_MIGRATE=true` after Postgres on the VPS matches `DATABASE_URL` in `.env`.
   - Restarts PM2 process `vpdm-task-api`.
   - HTTP health check is currently disabled in the workflow; enable it in the script when the API is stable.

## 5) SSL (recommended)

After DNS is pointed to VPS:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```
