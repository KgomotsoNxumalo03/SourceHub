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

## Phase 12: Reporting & Analytics

Reporting is available under `/reports`. The home page links to the executive scorecard and permission-gated module dashboards for service desk, clients, assets, networks, employees, attendance, projects, finance, knowledge, and security. Each dashboard supports server-side date ranges, previous-period comparisons, filters, drill-down links, KPI definitions, freshness state, saved configurations, and controlled CSV export. `/reports/saved`, `/reports/builder`, `/reports/kpis`, and `/reports/schedules` provide the report library, controlled custom builder, KPI catalogue, and scheduled-report administration.

The reporting read layer is implemented in `lib/reporting.ts`. It scopes every query to the authenticated workspace, reads only bounded operational datasets, performs grouping and calculations on the server, and returns a controlled `ReportResult` rather than raw collection data. Monetary values use the finance module's integer minor-unit authority and `amountPaidMinorUnits`; browser code does not calculate financial totals. Report definitions and KPI definitions document source collections, formulas, owners, units, targets, and limitations.

Materialized reporting data is stored in `reportingAggregates` for current operational summaries and `reportingSnapshots` for daily historical snapshots. Firebase Functions refresh aggregates hourly, create daily snapshots, process queued exports privately in Storage, create idempotent schedule executions, and reconcile execution status. Data freshness is visible in every dashboard: `CURRENT`, `AGING`, or `STALE`, based on `REPORTING_STALE_AFTER_MINUTES`. Reporting is eventually consistent between operational writes and scheduled materialization; the dashboard labels the last generated and source-updated times rather than hiding that delay.

Phase 12 collections are `reportDefinitions`, `savedReports`, `reportSchedules`, `reportExecutions`, `reportExports`, `reportPermissions`, `kpiDefinitions`, `reportingAggregates`, `reportingSnapshots`, `reportingRebuildJobs`, `reportingActivities`, and `dashboardPreferences`. Composite indexes are in `firebase.indexes.json`. Firestore rules deny browser writes to reporting records and map module reads to exact `reports.<area>.view` permissions. Shared reports are limited to explicit internal user IDs in the same workspace. Storage export files are private and readable only by the requesting owner or reporting managers after completion.

Configure `REPORTING_AGGREGATION_INTERVAL_MINUTES`, `REPORTING_EXPORT_MAX_ROWS`, `REPORTING_EXPORT_RETENTION_DAYS`, `REPORTING_STALE_AFTER_MINUTES`, and `REPORTING_SCHEDULE_MAX_RECIPIENTS` from `.env.example`. Deploy the rules, indexes, Storage rules, and Functions before enabling scheduled reporting:

```powershell
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage --project <firebase-project-id>
npx firebase-tools deploy --only functions --project <firebase-project-id>
npm.cmd run seed
```

Run the seed only against the Firebase Emulator Suite or an approved development project. The seed includes fictional KPI definitions, aggregate and snapshot examples, a saved executive report, schedule, execution, and export records. Actual outbound email or FCM delivery is intentionally not fabricated by the scheduler; scheduled exports create auditable private artifacts and execution records for the deployed notification provider to deliver.

Reporting validation includes pure calculation and CSV-injection tests in `tests/reporting.test.ts`, plus the repository-wide lint, typecheck, unit tests, Functions build, and Next production build. Emulator rule tests remain dependent on the Firebase CLI and Java runtime being installed on the development machine.

## Phase 13: SourceHub AI

SourceHub AI is available at `/ai` and from the global `Ask AI` control when the signed-in user has `ai.use`. The assistant supports conversation history, context indicators, suggested prompts, authorised source references, feedback, archive/delete, provider metadata, rate limits, redaction warnings, and structured proposed drafts. Context can be supplied with `contextModule`, `contextType`, and `contextId`; the server rechecks the record and module permission before retrieving it.

AI access is server-orchestrated in `lib/ai.ts` and uses the allowlisted registry in `lib/ai-tools.ts`. Tools include ticket, client, asset, endpoint, project, Knowledge Base, approved report, and KPI-definition retrieval. Tools accept validated schemas, enforce workspace and module permissions, cap result sizes, return controlled source references, and never execute arbitrary Firestore queries. Finance requests use approved Phase 10 report metrics rather than asking a model to calculate authoritative totals from raw line items.

The provider abstraction is in `lib/ai-provider.ts`. `AI_PROVIDER=dev` is a deterministic development-only adapter and is rejected when `NODE_ENV=production`. `AI_PROVIDER=http` sends a redacted, bounded request to the configured server-side provider endpoint using `AI_PROVIDER_API_KEY`; the browser never receives that key and no provider-specific model is hard-coded. Provider, model, prompt version, latency, token counts where supplied, and success state are recorded without storing provider credentials or full sensitive prompts in ordinary logs.

Retrieved content is treated as untrusted data. `lib/ai-redaction.ts` removes secret-like values before provider submission, detects prompt-injection language, withholds suspicious source content, and marks the request for audit. AI responses are not authoritative. Draft ticket replies, draft Knowledge Base content, and draft report narratives are stored as proposed actions; explicit confirmation creates an immutable execution record stating that the draft is prepared for manual review. No client communication, endpoint command, financial mutation, role change, deletion, invoice action, or automatic publication is performed by AI.

Phase 13 collections are `aiConversations`, `aiMessages`, `aiToolExecutions`, `aiActionProposals`, `aiActionExecutions`, `aiUsage`, `aiFeedback`, `aiSettings`, `aiFeaturePolicies`, `aiPromptVersions`, `aiRetrievalIndexes`, `aiEmbeddingJobs`, `aiAuditEvents`, and `aiRateLimits`. Firestore rules allow users to read only their own conversations, messages, tools, proposals, executions, feedback and usage; administrative settings and audit reads require exact AI permissions. All browser writes to AI records are denied. Retention cleanup is scheduled in `runScheduledAiRetention` in `functions/src/index.ts`.

Configure the following server-side variables from `.env.example`: `AI_ENABLED`, `AI_EMERGENCY_DISABLED`, `AI_PROVIDER`, `AI_PROVIDER_URL`, `AI_PROVIDER_API_KEY`, `AI_MODEL`, `AI_ALLOWED_MODULES`, `AI_MAX_PROMPT_CHARS`, `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_TOOL_CALLS`, `AI_DAILY_REQUEST_LIMIT`, `AI_MONTHLY_REQUEST_LIMIT`, `AI_RETENTION_DAYS`, and `AI_REQUEST_TIMEOUT_MS`. For local development, leave `AI_PROVIDER=dev`. For production, configure a provider endpoint and secret through the deployment secret manager, set `AI_PROVIDER=http`, and never commit the key.

After deploying the updated rules and indexes, run the idempotent superuser seed to add new report and AI permissions to existing seeded roles, then run the development data seed only against an emulator or approved development project:

```powershell
npm.cmd run seed:superusers
npm.cmd run seed
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage,functions --project <firebase-project-id>
```

Phase 13 security tests cover secret redaction, prompt-injection detection, bounded schemas, and existing platform regressions in `tests/ai.test.ts` and the repository test suite. Firebase Emulator rules and Functions tests require the Firebase CLI and Java runtime, which are not installed on the current development machine. The current implementation intentionally does not claim semantic embeddings, automatic email/FCM delivery, autonomous operational mutations, or employee surveillance; those remain guarded future integrations.

## Phase 14: Automation Engine

The Automation Engine is available under `/administration/automations`. It replaces the earlier SLA-only rule editor with a versioned no-code workflow model while preserving the existing `automationRules` collection for compatibility. Workflow drafts use a structured, keyboard-accessible list builder alongside a visual step view. A draft must pass the server-side registry and condition validator before an authorised user can publish it. Published versions are immutable; editing an active workflow creates a new draft and active executions continue to use their recorded published version. Older published versions can be rolled forward as a new rollback version.

The trusted execution boundary is in `lib/automation-engine.ts`. It claims trigger idempotency keys in Firestore transactions, scopes every workflow and execution to `DEFAULT_WORKSPACE_ID`, evaluates only approved condition fields and operators, caps step/depth/retry limits, redacts diagnostic data, pauses durable waits using `automationSchedules`, and records step results. The engine never evaluates workflow code in the browser and rejects arbitrary JavaScript, shell commands, SQL, Firestore queries, unsafe property access, and unregistered actions. `send_webhook`, outbound client email, role changes, endpoint commands, data deletion, financial approvals, and other high-risk actions create approval state or dead-letter until a trusted provider is configured; they are never silently simulated in production.

Phase 14 collections are `automationWorkflows`, `automationVersions`, `automationTriggers`, `automationExecutions`, `automationStepExecutions`, `automationApprovals`, `automationSchedules`, `automationIdempotency`, `automationDeadLetters`, `automationTemplates`, `automationWebhookConfigs`, `automationWebhookDeliveries`, `automationActivities`, and `automationUsage`. Composite indexes are declared in `firebase.indexes.json`. Firestore rules deny browser writes to workflow versions, execution state, step results, approvals, idempotency, retry state, webhook delivery results, dead letters, activities, and usage. Reads require the exact automation permission and a matching workspace.

Cloud Functions normalise ticket, client, asset, endpoint, employee, and invoice document events into `automationTriggers`, match safe no-condition workflows on a five-minute schedule, resume queued notification/delay/approval work on a five-minute schedule, and remove expired execution evidence daily. Conditional workflows can also be ingested through the trusted `ingestAutomationEvent` service, which shares the application condition validator. Scheduled processing never keeps a Function alive during a delay; it stores the next execution time and resumes later. Repeated failures are recorded in `automationDeadLetters` and automatically pause a workflow after three failures with a required pause reason.

The monitoring area shows active and paused workflows, execution counts, waits, approvals, dead letters, recent executions, redacted step timelines, retries, cancellation, and approval decisions. Templates are seeded as immutable version 1 drafts and must be configured before publishing. Dry runs are deterministic, clearly labelled, return condition results, proposed steps, approvals, and required permissions, and never mutate operational records.

Configure `AUTOMATION_ENABLED`, `AUTOMATION_EMERGENCY_DISABLED`, `AUTOMATION_MAX_STEPS`, `AUTOMATION_MAX_CONDITION_DEPTH`, `AUTOMATION_MAX_RETRIES`, `AUTOMATION_MAX_EXECUTION_MINUTES`, `AUTOMATION_MAX_CHILD_DEPTH`, `AUTOMATION_IDEMPOTENCY_RETENTION_DAYS`, `AUTOMATION_EXECUTION_RETENTION_DAYS`, `AUTOMATION_WEBHOOK_TIMEOUT_MS`, and `AUTOMATION_WEBHOOK_MAX_RECIPIENTS` from `.env.example`. Keep webhook signing secrets in the deployment secret manager rather than Firestore. Deploy the updated rules, indexes, and Functions before activating workflows.

Phase 14 validation includes `tests/automation.test.ts` for nested conditions, unsafe property rejection, type-safe workflow validation, template escaping, high-risk approval flags, and dry-run behaviour. Repository lint, typecheck, the full 42-test suite, Functions build, Firebase JSON validation, and the Next production build passed. Firebase Emulator rule and scheduled-Functions execution tests remain dependent on the Firebase CLI and Java runtime being installed. The implementation intentionally does not claim a live outbound email provider, webhook secret manager, FCM delivery, or arbitrary operational mutation adapter; those integrations remain explicit trusted-provider work rather than unsafe mocks.

## Phase 15: SourceHub Mobile

The Expo React Native TypeScript application lives in `apps/mobile`. It supports role-aware technician, employee, and authorised client workflows for tickets, assets, attendance, project tasks, Knowledge Base content, notifications, QR scanning, camera attachments, and permission-gated AI assistance. The mobile client is a separate workspace so React Native types and native build tooling do not enter the Next.js server compilation.

Mobile authentication uses the existing SourceHub credential authority through opaque bearer sessions. Session tokens are hashed at rest, expire and can be revoked per device, and every bootstrap, sync, upload, location, push-token, and AI request is re-authorised server-side against workspace and client scope. Firestore and Storage rules deny direct browser/mobile writes to authoritative mobile collections; trusted Next.js routes and Cloud Functions own writes and retention.

Offline data is limited to an authorised bootstrap cache. Mutations are stored as bounded idempotent operations and reconciled by `/api/mobile/sync`; the server uses transaction-backed attendance locks and validates ticket, task, and asset ownership before applying them. Location is event-only and retained for a bounded period; the app does not implement continuous employee tracking. Photos are uploaded through the authenticated server route into private Storage paths.

Run the mobile checks from the mobile directory:

```powershell
cd apps/mobile
npm install
npm run typecheck
npm run export
```

Copy `apps/mobile/.env.example` to a local `.env`. Never place Firebase Admin credentials, provider keys, signing keys, or service-account files in the mobile workspace. Device push credentials, App Check native providers, and Android/iOS signing belong in the development-build or EAS environment. Emulator rule tests and native builds require the Firebase CLI, Java, and platform toolchains installed on the developer machine.
