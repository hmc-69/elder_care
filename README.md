# ElderCare Connect

ElderCare Connect is an AI-powered assistance platform intended to help older adults live independently while keeping their families informed. The project includes its foundation, user authentication, and explicit Family–Elder connection management. Medication, check-in, emergency, chatbot, and notification modules are not included.

## Technology Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, React Router
- **Backend:** Node.js, Express.js, Prisma
- **Database:** MySQL
- **Authentication:** bcryptjs password hashing and JWT bearer tokens

## Project Structure

```text
frontend/
  src/components/       Shared UI and protected-route components
  src/context/          Central authentication state
  src/pages/             Home, auth, profile, and connection pages
  src/services/          Central API and authentication services
  src/types/             Shared frontend types
backend/
  src/lib/               Prisma client
  src/middleware/         Authentication and role authorization
  src/routes/             Health, auth, users, and admin test routes
  src/services/           Connection workflow and access rules
  src/controllers/        Request/response handling
  src/validation/         Request schemas
  prisma/schema.prisma    User and FamilyConnection models
  prisma/migrations/      Database migration history
  scripts/createAdmin.js  Private CLI for creating an admin account
  scripts/smokeConnections.js  Reversible live MySQL connection-flow check
```

## Setup

### 1. Install dependencies

```bash
cd frontend
npm install
cd ../backend
npm install
```

### 2. Configure environment variables

Copy `frontend/.env.example` to `frontend/.env` and `backend/.env.example` to `backend/.env`.

Set the backend `DATABASE_URL` to your MySQL credentials, for example:

```text
mysql://username:password@localhost:3306/eldercare_connect
```

Set `JWT_SECRET` to a private random value of at least 32 characters. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Never commit `.env` files or share your JWT secret. Public registration only permits `ELDER` and `FAMILY` roles.

#### Configure SOS email alerts (Resend)

1. Create a Resend account at [resend.com](https://resend.com), create an API key, and verify a sending domain (or use a sender address Resend explicitly permits for testing).
2. In `backend/.env`, set `RESEND_API_KEY` to the API key and `RESEND_FROM_EMAIL` to a sender address accepted by your Resend account, for example `ElderCare Connect <alerts@your-verified-domain.com>`.
3. Keep both values in the backend environment only. Do not add them to `frontend/.env`, commit them, or expose them through Vite variables.
4. Restart the backend. When an elder triggers SOS, the backend saves the event and sends email alerts to family members with **accepted** connections. If Resend is not configured or email delivery fails, the SOS event still remains active and the in-app notification workflow continues.

A successful Resend API response means the provider accepted the email request; it does not guarantee delivery to the recipient's inbox. Check the Resend dashboard for delivery, bounce, or suppression status.

### 3. Create and migrate the MySQL database

Create the database:

```sql
CREATE DATABASE eldercare_connect CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

From `backend/`, generate the Prisma client and apply the Prisma migrations:

```bash
npm run db:generate
npm run db:migrate
```

The migrations create `users` and `family_connections`, including the role and connection-status enums, foreign keys, and uniqueness/index constraints. No medication, check-in, emergency, chat, or notification tables are created.

To create the first administrator, set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in the local environment and run `npm run admin:create` from `backend/`. This private script hashes the password and does not expose public admin registration.

### 4. Start both applications

In one terminal, from `backend/`:

```bash
npm run dev
```

In another terminal, from `frontend/`:

```bash
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`).

## Authentication and user APIs

- `POST /api/auth/register` — create an ELDER or FAMILY account
- `POST /api/auth/login` — validate credentials and return a JWT and safe user object
- `GET /api/auth/me` — return the signed-in user
- `POST /api/auth/logout` — client-managed bearer-token logout; the client removes its stored token
- `GET /api/users/me` — view the signed-in user's profile
- `PUT /api/users/me` — update name and/or phone only
- `PUT /api/users/me/password` — change the current user's password
- `GET /api/admin/test` — ADMIN-only authorization test endpoint
- `GET /api/health` — API health check

Send protected API tokens using `Authorization: Bearer <token>`. Password hashes are never returned. The frontend centralizes auth state and provides `/login`, `/register`, and protected `/profile` routes. Its token is stored in browser local storage and removed on logout.

## Family–Elder connections

Family users can search elders by name and send a connection request with a relationship. Elders can accept or reject pending requests. Only an accepted connection grants a family member access to an elder's basic name and phone profile. Either participant may remove an accepted connection; removal changes its status to `BLOCKED` and preserves its history. Rejected requests can be sent again, while pending, accepted, and blocked pairs cannot be duplicated.

Connection routes:

- `GET /api/family/elders/search?query=<name>` — FAMILY-only search, returns elder ID and name
- `GET /api/family/elders/:elderId` — FAMILY-only basic profile, requires an accepted connection
- `POST /api/connections` — FAMILY-only request
- `GET /api/connections/requests` — ELDER-only pending requests
- `PUT /api/connections/:connectionId/accept` and `/reject` — ELDER-only decisions
- `GET /api/connections/family` and `/elder` — each role's own connection records
- `GET /api/connections/:connectionId` — connection participants only
- `DELETE /api/connections/:connectionId` — either participant can remove an accepted connection

The frontend pages are `/family/connections` and `/elder/connections`; both require the matching signed-in role.

## Verification

Run the isolated API tests and frontend tests/build with:

```bash
cd backend
npm test
cd ../frontend
npm test
npm run build
```

With a configured `backend/.env` and migrated database, run the live API/database smoke flow from `backend/`:

```bash
npm run test:db
```

The live smoke script creates uniquely named test users, exercises connection requests, permissions, and status transitions, then removes its test rows.
