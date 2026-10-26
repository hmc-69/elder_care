# ElderCare Connect — Deployment & Operations Guide

This guide describes the production deployment, security hardening, database maintenance, and verification procedures for the ElderCare Connect platform.

---

## 1. System Architecture

```
[ Client Browser / Mobile Web ]
            │ (HTTPS / WSS)
            ▼
    [ Reverse Proxy: Nginx / Caddy / Cloudflare ]
       │                                │
       ├─► Static Assets (SPA)          └─► API Requests (/api/*, /health)
       │   `frontend/dist/`                 │
       │   (HTML, CSS, JS bundles)          ▼
       │                            [ Node.js Express API ]
       │                            (Managed via PM2 / systemd)
       │                                    │ (Prisma ORM)
       │                                    ▼
       │                            [ MySQL 8.x Database ]
```

---

## 2. Prerequisites

- **Node.js**: `v18.x` or `v20.x` LTS
- **npm**: `v9.x` or higher
- **MySQL**: `8.0+` or `MariaDB 10.5+`
- **Reverse Proxy**: Nginx, Caddy, or equivalent with TLS certificate (e.g., Let's Encrypt)
- **Process Manager**: PM2 or systemd (for the Node.js backend)

---

## 3. Environment Configuration

### Backend (`backend/.env`)

Create `backend/.env` based on `backend/.env.example`.

| Variable | Description | Production Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | MySQL connection string for Prisma | `mysql://eldercare_user:StrongPassword@127.0.0.1:3306/eldercare_connect` |
| `PORT` | Local port the Express API listens on | `8000` |
| `FRONTEND_ORIGIN` | Allowed origin for CORS (exact URL) | `https://eldercare.example.com` |
| `JWT_SECRET` | Secret key (min 32 chars) for signing tokens | Generate via: `openssl rand -base64 32` |
| `JWT_EXPIRES_IN` | JWT token validity duration | `1d` |
| `APP_TIMEZONE` | IANA timezone for medication/checkin schedules | `Asia/Kolkata` or your local timezone |
| `CHECKIN_MORNING_TIME`| Morning check-in scheduled time | `09:00` |
| `CHECKIN_NIGHT_TIME`  | Night check-in scheduled time | `20:00` |
| `CHECKIN_GRACE_MINUTES`| Grace window in minutes | `60` |
| `AI_PROVIDER` | Assistant provider (`gemini`, `openai`, `mock`) | `gemini` |
| `AI_API_KEY` | API key for the AI provider | `AIzaSy...` (store securely) |
| `AI_MODEL` | Provider model identifier | `gemini-2.5-flash` |
| `AI_TIMEOUT_MS` | AI request timeout in milliseconds | `15000` |

> **Important**:
> - Never commit `.env` to version control.
> - `JWT_SECRET` must be a high-entropy string of at least 32 characters.
> - In production, set `NODE_ENV=production`.

### Frontend (`frontend/.env.production`)

Create `frontend/.env.production`:

```ini
VITE_API_URL=https://api.eldercare.example.com/api
```
*(Or `https://eldercare.example.com/api` if served under the same domain via reverse proxy).*

---

## 4. Database Setup, Migrations & Backup

### Initial Database Creation

```sql
CREATE DATABASE eldercare_connect CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'eldercare_user'@'localhost' IDENTIFIED BY 'StrongPasswordHere';
GRANT ALL PRIVILEGES ON eldercare_connect.* TO 'eldercare_user'@'localhost';
FLUSH PRIVILEGES;
```

### Running Migrations in Production

Always use `prisma migrate deploy` in production (never `prisma migrate dev`):

```bash
cd backend
npx prisma migrate deploy
```

To verify migration status:
```bash
npx prisma migrate status
```

### Database Backup Procedure

Perform automated daily backups using `mysqldump`:

```bash
mysqldump -u eldercare_user -p --single-transaction --quick --lock-tables=false \
  eldercare_connect | gzip > /backups/eldercare_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Database Restoration Procedure

```bash
gunzip < /backups/eldercare_backup_file.sql.gz | mysql -u eldercare_user -p eldercare_connect
```

---

## 5. Backend Deployment (Node.js / Express)

### 1. Install Production Dependencies
```bash
cd backend
npm ci --omit=dev
npx prisma generate
```

### 2. Run with PM2
```bash
npm install -g pm2
pm2 start src/index.js --name "eldercare-api" --instances 2 --env production
pm2 save
pm2 startup
```

---

## 6. Frontend Build & Static Hosting

### 1. Build the Production Assets
```bash
cd frontend
npm ci
npm run build
```

This compiles TypeScript, bundles React with Vite, and writes optimized assets into `frontend/dist/`.

### 2. Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name eldercare.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name eldercare.example.com;

    ssl_certificate /etc/letsencrypt/live/eldercare.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/eldercare.example.com/privkey.pem;

    # Root for static frontend build
    root /var/www/eldercare/frontend/dist;
    index index.html;

    # SPA routing fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API and health check proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        proxy_set_header Host $host;
    }
}
```

---

## 7. Security Hardening Checklist

- [x] **Strict Transport Security (HSTS)** enabled in production via HTTP headers.
- [x] **Frame Guard (`X-Frame-Options: DENY`)** and `X-Content-Type-Options: nosniff` active on all responses.
- [x] **X-Powered-By** header suppressed to avoid fingerprinting.
- [x] **Body Limit**: Express JSON body parser strictly capped at `20kb` to prevent memory exhaustion.
- [x] **Rate Limiting**:
  - Login & Registration: Max 10 attempts per minute per IP.
  - Password Change: Max 5 attempts per minute per user.
  - AI Assistant: Sliding window per-user rate limit.
- [x] **Credential Protection**:
  - Passwords hashed with bcrypt (cost factor 12).
  - Password hashes excluded from all JSON serialization (`toSafeUser`).
  - No secret variables embedded in client bundles.
- [x] **Authorization**:
  - Role-based route middleware (`requireRole('ELDER')`, `requireRole('FAMILY')`, `requireRole('ADMIN')`).
  - Strict ownership and accepted family connection validation on all resource access (IDOR prevention).

---

## 8. Health Check & Monitoring

### Health Endpoint
The API exposes non-sensitive health check endpoints:
- `GET /health`
- `GET /api/health`

Response:
```json
{
  "status": "ok",
  "service": "ElderCare Connect API"
}
```
No database credentials, secrets, or internal stacks are leaked.

---

## 9. Rollback Guidance

1. **Frontend Rollback**:
   Re-point the Nginx root directory or restore the previous `dist/` directory from backup.
2. **Backend Rollback**:
   ```bash
   git checkout <previous-tag-or-commit>
   npm ci --omit=dev
   pm2 restart eldercare-api
   ```
3. **Database Rollback**:
   Restore the database dump captured immediately before running the migration.
