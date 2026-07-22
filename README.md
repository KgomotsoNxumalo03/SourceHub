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
- `ENDPOINT_CREDENTIAL_PEPPER` (server-only secret used to hash endpoint credentials)
- `ENDPOINT_RATE_LIMIT_PER_MINUTE`
- `NETWORK_AUDIT_RETENTION_DAYS`
- `NETWORK_INGESTION_LOG_RETENTION_DAYS`
- `EMPLOYEE_DOCUMENT_MAX_MB`
- `EMPLOYEE_CONTRACT_EXPIRY_DAYS`
- `EMPLOYEE_RETENTION_DAYS`
- `ATTENDANCE_LOCATION_RETENTION_DAYS`
- `ATTENDANCE_EVENT_RETENTION_DAYS`

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

## Phase 6: Network Management

Network Management is available under `/network`. It links client sites and Phase 5 assets to network environments, registered devices, Windows endpoints, audit history, changes, alerts, tickets, and monitoring policies.

The read-only PowerShell audit script is available at `public/scripts/SourceHub-WindowsAudit.ps1`. It supports Windows PowerShell 5.1 and modern PowerShell where the relevant CIM, networking, security, and registry providers are available:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\SourceHub-WindowsAudit.ps1 -Mode Local -OutputPath .\SourceHub-Audit.json
```

Upload mode requires a short-lived enrolment token or previously issued endpoint credential. The script never contains Firebase Admin credentials:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\SourceHub-WindowsAudit.ps1 -Mode Upload -SourceHubUrl http://localhost:3000 -EnrollmentToken '<one-time-token>'
```

The enrolment exchange creates a scoped endpoint identity and a restricted credential. Audit requests are signed with HMAC, timestamped, nonce-protected, idempotent, schema-validated, rate-limited, and recorded in immutable audit collections. Raw audits and endpoint credentials are not writable from the browser.

Firebase deployment requires an authenticated Firebase CLI session. Deploy the rules and indexes before using a deployed project:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage --project <firebase-project-id>
npx firebase-tools deploy --only functions --project <firebase-project-id>
```

For local development, use the Firebase Emulator Suite with the ports in `firebase.json`, then run the idempotent development seed against the emulator environment. Never use the development seed or pepper in production.

Scheduled functions include network offline detection every 15 minutes and retention cleanup daily, in addition to the existing SLA, email, and escalation sweeps. Retention preserves current endpoint snapshots and change evidence linked to open tickets while removing old raw submissions and ingestion logs according to environment settings.

## Phase 7: Employee Management

Employee Management is available under `/employees`. It provides a workspace-scoped directory, employee lifecycle states, organisation structure, contracts, emergency contacts, secure documents, qualifications, training, controlled notes, onboarding, offboarding, and links to assigned assets, endpoints, and service-desk tickets.

Employee records and SourceHub user accounts remain separate. Preboarding records can exist without an account, and account links are expected to be created by a trusted administrator workflow. Protected identity references are masked in ordinary views; compensation, emergency contacts, restricted notes, contracts, and documents require dedicated permissions. Employee document uploads are validated for size, MIME type, and dangerous extensions and are stored in private storage paths rather than public uploads.

The employee expiry function runs daily and creates idempotent notifications for expiring contracts, qualifications, and training. The retention function marks long-archived records for retention review rather than deleting legal, security, or audit evidence. These controls support POPIA-conscious implementation but do not claim legal compliance; retention periods and access roles must be reviewed with the organisation's privacy and legal owners.

Seed fictional employee data locally with `npm run seed`. Deploy the added indexes, Firestore rules, Storage rules, and functions before using the module in a deployed Firebase project:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage --project <firebase-project-id>
npx firebase-tools deploy --only functions --project <firebase-project-id>
```

Known limitations: Firebase Authentication account creation, session revocation, document download brokering, malware scanning, and full task-owner notification delivery require a deployed Admin/Functions workflow and are intentionally not performed from the browser. The current local UI records the workflow and security boundary so those integrations can be added without changing the employee data model.

## Phase 8: Time & Attendance

Time & Attendance is available under `/attendance`. It is limited to clock-in, clock-out, breaks, approved work modes, reusable attendance profiles, work locations, work schedules, and attendance exceptions/reports. Attendance events use trusted server timestamps and transaction-backed employee locks so duplicate tabs and retries cannot create overlapping sessions. Location verification is optional and action-scoped; SourceHub does not continuously track location.

The Phase 8 data model intentionally does not implement PulseOne, employee productivity monitoring, idle time, application or website usage, screenshots, keystrokes, mouse activity, browser history, or productivity scoring. `lib/attendance-integration.ts` exposes only a small future boundary for approved attendance summaries, with no telemetry fields.

## Phase 9: Projects and Work Management

Projects are available at `/projects`. The module stores project records, tasks and subtasks, status history, members, milestones, dependencies, time entries, comments, private files, risks, activity history, health snapshots, templates, and ticket/asset links in Firestore. Project and task references use server-owned uniqueness records. Status transitions, dependency-cycle checks, active timer locks, time approval locking, client visibility, and file access are enforced by trusted server actions and Firebase rules.

The project workspace provides a paginated directory, operational dashboard metrics, accessible Kanban board with optimistic rollback, a task timeline/list alternative, milestones, team workload summaries, project time approval, collaboration, risks, private Storage files, and CSV export at `/api/projects/export`. Reusable templates are managed at `/projects/templates` and copy template tasks into independent live records with the template version preserved.

Scheduled Functions recalculate explainable project health and progress every 30 minutes and create idempotent overdue-task notifications. Project time remains separate from attendance. PulseOne integration is intentionally limited to a future source enum and does not add monitoring, idle tracking, screenshots, application tracking, or productivity scoring.

Firebase deployment requires authenticated Firebase CLI access and a configured service account for server-side actions and seed data. Deploy with `npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage,functions --project <firebase-project-id>`. Run `npm run seed` only against the emulator or an approved development project.

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
## Phase 10 finance management

Finance uses Firebase collections and Admin SDK transactions. Monetary authority is stored as integer minor units with server-side VAT, discounts, document totals, payment allocation, and transactional document numbering. The development defaults are ZAR, `en-ZA`, 15% VAT, and 30-day payment terms; this is operational software and does not claim accounting, tax, or SARS compliance.

The finance module includes settings, client billing profiles, quotes and approval, quote-to-invoice conversion, private invoice PDFs, payments and allocations, expenses, suppliers, purchase orders, budgets, audit records, export routes, and scheduled overdue checks. Direct Firestore writes to authoritative finance documents are denied by the client rules; server actions and Functions perform controlled writes.

Run the finance checks with:

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run seed
```

## Phase 11: Knowledge Base

The Knowledge Base is available internally at `/knowledge` and publicly at `/knowledge/public`. Articles, categories, immutable revisions, review decisions, publication snapshots, relations, feedback, policy acknowledgements, import jobs, analytics, attachment metadata, and scheduled job records are persisted in Firestore. Public pages only query published `PUBLIC` articles and render server-sanitised HTML; client-scoped access is represented by Firebase portal claims and is never granted from a URL parameter.

Knowledge content is sanitised on the server, stored with plain-text search tokens, checked for likely secrets, and protected by permission-gated server actions. Published revisions are copied into a publication snapshot; edits create a new draft revision instead of mutating published history. Private attachments use `workspaces/{workspaceId}/knowledge/{articleId}/...` Storage paths and the download route requires internal permission. CSV and Markdown exports are audited at `/api/knowledge/export`.

Phase 11 adds Firebase composite indexes, Firestore and Storage rules, fictional seed categories/articles/feedback/policy data, and scheduled Functions for review reminders, expiry transitions, idempotent notifications, and public-link checks. Configure `KNOWLEDGE_*` variables from `.env.example`, deploy rules/indexes/storage/functions, and run `npm run seed` only against an emulator or approved development project. This module supports POPIA-conscious design but does not claim legal, security, or compliance certification.

The current application session is the internal employee session. A deployed Firebase portal sign-in flow is still required to expose client claims (`portal`, `clientId`) to a separate client portal UI; direct Firestore and Storage rules already enforce those claims for client-visible articles and files. Firebase Emulator rules tests require the Firebase CLI and Java runtime, which are not bundled with this repository.
