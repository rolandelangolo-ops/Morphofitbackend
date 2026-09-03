# Morphofit — Backend

Express + MongoDB (Mongoose) API for morphology-based fashion ordering, tailoring appointments, and role-based dashboards (client, stylist, tailor, delivery agent, admin).

## Stack

- Express (REST API)
- MongoDB / Mongoose
- JWT (`jsonwebtoken`) + `bcryptjs` for auth — no external identity provider
- Zod (request validation)

## Getting started

```bash
npm install
cp .env.example .env   # fill in MONGODB_URI at minimum
npm run seed:demo      # creates one demo account per role (password: password123)
npm run dev            # starts on http://localhost:3001
```

## Project layout

```
src/
  config/       env loading, MongoDB connection
  models/       Mongoose schemas — User, Measurement, Order, Appointment
  services/     demoSeedService (idempotent demo-account seeding)
  middleware/   auth (JWT verification + role gating), validation (Zod), error handling
  validators/   Zod schemas per resource
  controllers/  request handlers
  routes/       Express routers, mounted under /api/v1
  scripts/      one-off scripts (npm run seed:demo)
  app.js        Express app assembly
  server.js     entrypoint
```

## Auth

`POST /api/v1/auth/register` and `POST /api/v1/auth/login` return a JWT. Send it as `Authorization: Bearer <token>` on every subsequent request; `middleware/auth.js` resolves it to the `req.user` document and `requireRole(...)` gates routes by `role` (`client`, `stylist`, `tailor`, `delivery_agent`, `admin`).

## Endpoints

| Method | Path | Role |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | public |
| POST | `/api/v1/auth/login` | public |
| GET | `/api/v1/auth/me` | any authenticated |
| GET | `/api/v1/appointments/tailors` | client |
| GET | `/api/v1/appointments` | any authenticated |
| POST | `/api/v1/appointments` | client |
| PATCH | `/api/v1/appointments/:id/status` | tailor |
| GET | `/api/v1/client/measurements` | client |
| GET | `/api/v1/client/orders` | client |
| GET | `/api/v1/stylist/orders` | stylist |
| GET | `/api/v1/stylist/clients` | stylist |
| GET | `/api/v1/tailor/orders` | tailor |
| PATCH | `/api/v1/tailor/orders/:id/status` | tailor, admin |
| GET | `/api/v1/delivery/orders` | delivery_agent |
| GET | `/api/v1/admin/users` | admin |
| GET | `/api/v1/admin/orders` | admin |

## Pairs with

[`MorphofitFrontend`](../MorphofitFrontend) — the Vite/React app. Its dev server proxies `/api` to `http://localhost:3001` (see its `vite.config.ts`), so run this backend on port 3001 for the frontend's `npm run dev` to work out of the box.
