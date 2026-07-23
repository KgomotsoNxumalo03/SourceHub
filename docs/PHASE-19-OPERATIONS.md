# Phase 19: Post-Launch Operations

## Release Position

Phase 19 adds the operational foundation for an internal pilot and future launch. It does **not** represent a production launch. Phase 18 remains **Not ready** until UAT approval, Firebase Emulator validation, backup and restore evidence, production provider configuration, external alerting, and explicit deployment authorization are complete.

The local application and development Firestore project are the only environments exercised by this change. Commercial SaaS, billing, live customer onboarding, and production telemetry remain disabled or pending.

## Included

- `/administration/operations`: workspace-scoped internal health, incident, defect, feedback, and release visibility.
- `/feedback`: authenticated, bounded product feedback with private-by-default visibility.
- Server-only health and record writes through the Admin SDK, with enterprise audit evidence.
- An allowlisted product-event vocabulary with primitive metadata only. Passwords, tokens, keys, emails, form contents, and raw customer records are not analytics payloads.
- Firestore rules that deny direct browser/mobile writes to operational records.
- A bounded daily Functions retention sweep for operational analytics.
- Configurable early-life support periods, stale-health thresholds, alert cooldowns, and error-rate thresholds in `.env.example`.

## Early-Life Support

The recommended operating windows are configurable defaults: the first 24 hours for heightened observation, the first 7 days for early-life support, and the first 30 days for stabilisation. Before launch, name the support owner, escalation owner, business approver, and communications owner. The application does not invent an on-call roster or send external alerts by itself.

Use the dashboard to record incidents and defects. For every incident capture an owner, correlation ID, timeline, affected module, severity, current impact, workaround, next update time, and closure evidence. Use the templates in `docs/INCIDENT-TEMPLATES.md` for internal updates and user advisories.

## Severity and Triage

- `SEV-1`: broad outage, data exposure, authentication failure, or active security incident. Contain immediately, notify the incident and security owners, and keep a live timeline.
- `SEV-2`: major workflow unavailable with a safe workaround. Assign an owner, publish a workaround, and schedule frequent updates.
- `SEV-3`: isolated defect or degraded non-critical feature. Triage into the defect queue and include a target release.
- `SEV-4`: cosmetic, documentation, or low-impact improvement.

Defect priorities use `P0` through `P4`. P0 and P1 require an explicit release decision and regression coverage. Do not close a defect based only on a code change; verify the affected workflow and record the evidence.

## Monitoring and SLIs

`/api/health` is a non-sensitive liveness check and intentionally does not expose dependency details. The operations dashboard is the authenticated view for internal records. The values in `operationalSliTargets` are internal engineering targets, not a customer SLA or availability promise. Configure approved Firebase/Cloud Monitoring checks and notification channels manually after the production project, ownership, budget, and escalation policy are approved.

## Security, Cost, and Recovery

Operational records are workspace-scoped, server-authoritative, audited, and retained by bounded policy. Do not put secrets or customer content into incidents, feedback, analytics metadata, logs, or chat. Review Firestore usage, scheduled Function invocations, Storage growth, and log retention during the pilot; no spend threshold is assumed by this repository.

Backup exports, Storage lifecycle rules, Auth configuration export, restore tests, RPO/RTO approval, and isolated recovery verification remain external gates described in `docs/PRODUCTION-LAUNCH-CHECKLIST.md`. Never treat a readiness record as proof that a backup or restore succeeded.

## Release Management

Track each pilot, staged, hotfix, and production candidate in the operations dashboard. Every release should include scope, migration/index/rules impact, validation commands, rollback or forward-repair plan, owner, approval, and monitoring window. Deploy rules, indexes, Functions, and the web application separately where required, and verify health plus permission-denial paths after deployment.

## Known Limits

- External monitoring, paging, support mailbox integration, and customer notification are not configured here.
- UAT, Emulator Suite tests, backup restore drills, production provider setup, App Check enforcement, and deployment approval are not complete.
- Existing feature modules still import the Firestore compatibility export named `prisma`; it is not a SQL client, but a future cleanup should rename that adapter consistently.
- Mobile native export and device-provider validation remain toolchain-dependent.

## Validation

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
cd functions
npm.cmd run build
```

No production deployment or live customer-data operation is part of Phase 19.
