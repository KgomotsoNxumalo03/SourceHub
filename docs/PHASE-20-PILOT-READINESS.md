# Phase 20: Pilot Enablement and Evidence Foundation

## Recommendation

**Not ready for a controlled internal pilot.** The repository now has the management and evidence foundation, but no human UAT, business approval, backup restore evidence, Firebase Emulator rule run, external alert configuration, or production deployment approval has occurred. Automated checks must not be treated as human approval.

This phase does not claim production usage, customer demand, real feedback, adoption, or commercial readiness.

## Implemented

- Protected Pilot Management at `/administration/pilots` for users with `pilots.view` and `pilots.manage`.
- Pilot lifecycle records with workspace/tenant scope, explicit high-risk status confirmation, enterprise audit events, known limitations, participants, modules, feature flags, criteria, and decision history.
- Reusable readiness checklist with 24 pending-by-default items, owner, due date, notes, evidence, and completion state.
- UAT workspace at `/administration/pilots/:id/uat` with eight non-destructive scenarios, human result capture, evidence, linked defect field, and tenant-scoped CSV export.
- Role-aware pilot onboarding at `/onboarding/pilot` and an optional role-aware product tour on the dashboard. Progress is persisted server-side per user and workspace.
- Contextual feedback links that capture only reviewed route/module/pilot context. Feedback explicitly warns against secrets, customer records, financial details, AI prompts, and uploaded documents.
- Privacy-safe analytics event vocabulary extended for pilot events. Events are schema-versioned, server-written, tenant-scoped, and marked `synthetic: false`; synthetic seed events are marked separately.
- Deterministic synthetic demo seeding with dry-run, volume selection, idempotent document IDs, tenant-scope validation, emulator/non-production guard, and destructive reset confirmation.
- Firestore rules deny direct browser writes for pilot, UAT, progress, scenario, and operational records.

## Synthetic Demo Data

Run from the repository root:

```powershell
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
npm.cmd run seed:pilot-demo -- --dry-run --volume=small
npm.cmd run seed:pilot-demo -- --volume=small
```

The command creates two fictional tenants by default and marks every generated record with `synthetic: true`, `seedKey: phase20:*`, and an `SYNTHETIC_DEMO` environment marker. It uses `example.com` mail domains and documentation-safe network addresses. It creates no Auth users and stores no passwords.

Reset is disabled unless the environment explicitly enables it and the command carries both confirmations:

```powershell
$env:PILOT_DEMO_RESET_ENABLED="true"
npm.cmd run seed:pilot-demo -- --reset --confirm-reset
```

The script refuses production-like project IDs, production URLs, and production `NODE_ENV`. Without the emulator it also requires `--approved-non-production`. It only deletes records with `synthetic: true` from its explicitly enumerated collections.

## Scenarios and Evidence

The pilot creates UAT cases for Service Desk, Asset Management, Attendance, Projects, Finance, Knowledge and AI, Automation, and Tenant Isolation. The dashboard separates synthetic data, automated checks, human UAT, real feedback, and production data. Display `No data yet` for metrics until genuine pilot activity exists. Do not reduce security, tenant isolation, data integrity, or backup failures to a single score.

Recommended initial pilot shape after blockers are cleared: 5-10 internal participants, one approved non-production workspace, 7 days of early-life support, and separate technical and business decision records. This is a recommendation, not evidence of approval.

## Remaining Blockers

- Firebase Emulator Suite and Java-based rules/Functions execution have not been run in this environment.
- No human UAT tester, business approver, or technical pilot approval has been recorded.
- Backup, restore, RPO/RTO, App Check enforcement, external monitoring/paging, and budget controls remain external setup.
- Demo Auth accounts must be created manually in the Emulator or approved non-production Firebase project; the repository does not create passwords.
- Mobile native build/device validation remains toolchain-dependent.
- Commercial SaaS and live billing remain disabled by default.

The current recommendation is **Not ready for a controlled internal pilot**. Passing automated tests can move technical evidence forward, but it cannot change this recommendation until the outstanding human and external gates are completed.

For local SourceHub credential accounts, place a strong password only in the ignored `.env.local` as `DEV_ADMIN_PASSWORD`, then run `npm.cmd run seed:superusers` against the Emulator or approved development project. The seed refuses the repository placeholder and does not create secondary accounts with embedded passwords.
