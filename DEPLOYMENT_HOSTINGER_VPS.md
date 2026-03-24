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

After your first deployment (or after manually copying project files), create your backend environment file:

```bash
mkdir -p ~/apps/vpdm-task-manager/backend
cp ~/apps/vpdm-task-manager/backend/.env.example ~/apps/vpdm-task-manager/backend/.env
```

Then edit `~/apps/vpdm-task-manager/backend/.env` with real values (`DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGINS`).

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

## 4) How the pipeline deploys

The workflow has 2 jobs:

1. **Build job**
   - Builds frontend (`frontend/dist`) and backend (`backend/dist`) in CI.
   - Creates two artifacts: `frontend.tgz` and `backend.tgz`.
2. **Deploy job**
   - Uploads artifacts to `/tmp/vpdm_deploy` on the VPS.
   - Backs up current deployment files.
   - Deploys frontend to `/var/www/html/vpdm-task-manager`.
   - Deploys backend to `~/apps/vpdm-task-manager/backend` while preserving `backend/.env`.
   - Installs backend production dependencies (`npm ci --omit=dev`).
   - Runs `prisma migrate deploy`.
   - Restarts PM2 process `vpdm-task-api`.
   - Runs backend health check on `http://127.0.0.1:$PORT/api` (`PORT` from backend `.env`, default `3001`).

## 5) SSL (recommended)

After DNS is pointed to VPS:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```
