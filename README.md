# SourceHub

SourceHub is a phased service management platform built with Next.js, TypeScript, Tailwind CSS, Firebase Firestore, and a secure session-based authentication layer.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Firebase Firestore client
- Firebase Admin SDK
- Zod
- bcryptjs
- Lucide React icons

## Local prerequisites

- Node.js 24+
- npm

## Environment setup

1. Copy `.env.example` to `.env.local`.
2. Place a Firebase Admin service-account file at `firebase-service-account.json`.
3. Keep the development admin values only for local use.

Required environment variables:

- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`
- `SOURCEHUB_FIREBASE_SERVICE_ACCOUNT_PATH`
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

## Firestore setup

SourceHub uses the Firebase project configured in the public environment variables. Server-side access uses the ignored Firebase Admin service-account JSON file.

## Commands

```bash
npm install
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
- `scripts/` Firestore seed utilities
- `public/` static assets
- `next-types.d.ts` Next.js module shims used during local development

## Permission architecture

SourceHub uses database-driven roles and permissions. Permissions are evaluated on the server through reusable helpers such as `currentUser()`, `hasPermission()`, `requirePermission()`, and `requireRole()`.

## Phase 1 completed features

- Project scaffold and production scripts
- Firestore collections for users, roles, permissions, audit logs, notifications, sessions, settings, employees, and tickets
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
