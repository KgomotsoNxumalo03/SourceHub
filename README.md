# SourceHub

SourceHub is a phased service management platform built with Next.js, TypeScript, Tailwind CSS, Prisma, SQLite for local development, and a secure session-based authentication layer.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma
- SQLite
- Zod
- bcryptjs
- Lucide React icons

## Local prerequisites

- Node.js 24+
- npm

## Environment setup

1. Copy `.env.example` to `.env.local`.
2. Update `DATABASE_URL` if you want to point at a different database. The local default uses SQLite.
3. Keep the development admin values only for local use.

Required environment variables:

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_APP_URL`
- `DEV_ADMIN_EMAIL`
- `DEV_ADMIN_PASSWORD`
- `DEV_ADMIN_FIRST_NAME`
- `DEV_ADMIN_LAST_NAME`
- `DEV_ADMIN_EMPLOYEE_NUMBER`
- `DEV_ADMIN_JOB_TITLE`
- `DEV_ADMIN_DEPARTMENT`
- `DEFAULT_COMPANY_NAME`
- `DEFAULT_TRADING_NAME`
- `DEFAULT_SUPPORT_EMAIL`
- `DEFAULT_CONTACT_NUMBER`
- `DEFAULT_WEBSITE`
- `DEFAULT_TIMEZONE`
- `DEFAULT_COUNTRY`
- `DEFAULT_DATE_FORMAT`

Development-only login defaults:

- Email: `admin@sourcehub.local`
- Password: `SourceHub123!`

## Local database setup

The default development database is the SQLite file at `prisma/dev.db`.

If you want to use PostgreSQL instead, update `DATABASE_URL` to match your local credentials.

## Commands

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

Additional validation:

```bash
npm run lint
npm run typecheck
npm run build
```

Production build:

```bash
npm run build
```

## Folder structure

- `app/` application routes and pages
- `components/` shared design system and shell
- `lib/` data access, auth, and server utilities
- `prisma/` schema and seed
- `public/` static assets
- `next-types.d.ts` Next.js module shims used during local development

## Permission architecture

SourceHub uses database-driven roles and permissions. Permissions are evaluated on the server through reusable helpers such as `currentUser()`, `hasPermission()`, `requirePermission()`, and `requireRole()`.

## Phase 1 completed features

- Project scaffold and production scripts
- Prisma schema for users, roles, permissions, audit logs, notifications, sessions, and settings
- Seed data for core roles, permissions, a development admin account, and notifications
- Database-backed login/logout
- Protected app shell
- Dashboard foundation
- User profile
- Notifications foundation
- Administration sections for users, roles, audit logs, and settings
- Shared design system components

## Phase 2 planned scope

- Ticket creation
- Ticket reference numbers
- Status tracking and priorities
- Categories and assignment
- Internal notes and public replies
- Attachments and ticket history
- Technician queues and searchable ticket lists
- Basic ticket dashboard

## Future scope

- Workflow states
- Ticket assignment and SLAs
- Ticket activity timelines
- Phase 2 operational dashboards
