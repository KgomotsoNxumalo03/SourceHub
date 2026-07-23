# Phase 18 Release Readiness

Status date: 2026-07-23
Branch reviewed: `main`
Recommendation: **Not ready**

## Executive Summary

Phase 18 is a release-gate review, not a feature expansion. The repository baseline is healthy: 57 automated tests pass, lint passes, TypeScript passes, the production dependency audit is clean after safe lockfile updates, and the application has a production health endpoint. A confirmed cross-tenant Firebase Storage read gap was fixed and covered by a regression test.

The application is not marked production-ready because UAT, Firebase Emulator rule execution, backup restore, provider setup, App Check enforcement, and production approval require authorised access outside this repository. Commercial SaaS and live billing remain disabled by default.

## Audit Register

| Severity | Finding | Affected area | Status | Evidence or action |
| --- | --- | --- | --- | --- |
| Release blocker | Business UAT has not been completed or signed off | All user workflows | Open | Use [UAT-PLAN.md](UAT-PLAN.md); do not fabricate approval |
| Release blocker | A non-production Firebase restore drill has not been completed | Firestore, Storage, Auth configuration | Open | Follow [OPERATIONS-RUNBOOKS.md](OPERATIONS-RUNBOOKS.md) with approved cloud access |
| Release blocker | Production Firebase project, App Check, secrets, domains, and alerting are not verified here | Production infrastructure | Open | Complete [PRODUCTION-LAUNCH-CHECKLIST.md](PRODUCTION-LAUNCH-CHECKLIST.md) |
| Critical | Storage reads for clients, assets, and tickets did not require workspace matching | Firebase Storage | Fixed | `storage.rules`, `tests/phase18.test.ts` |
| High | Nested dependency versions were below patched audit ranges | Next.js, sharp, postcss, uuid | Fixed locally | Safe npm audit fix plus package overrides; full audit is clean |
| High | Firebase Emulator and rules tests cannot run on this workstation | Firebase validation | Open external dependency | Firebase CLI and Java are not installed |
| Medium | Scheduled Functions contain several collection-wide sweeps | Functions | Accepted limitation for this release | Bound and checkpoint high-volume jobs before large-scale rollout |
| Medium | Some enterprise API handlers expose controlled application error text | Enterprise API | Follow-up | Add a shared public error mapper before exposing the API to untrusted third parties |
| Improvement | Bundle, query, and concurrency baselines need staging workload data | Performance | Open | Run synthetic staging measurements; no production load test was performed |

## Changes Made

- Added security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and production HSTS.
- Disabled the Next.js powered-by header and enabled React strict mode.
- Added `GET /api/health`, a non-sensitive no-store liveness endpoint.
- Required workspace matching for private Storage read paths and portal branches.
- Added Phase 18 regression tests for Storage isolation and commercial-safe defaults.
- Updated the lockfile with safe patch updates and narrowly scoped dependency overrides. No `npm audit fix --force` was used.
- Added CI, UAT, launch, and operations documentation.

## Validation Evidence

| Check | Result |
| --- | --- |
| `npm.cmd test` | Pass, 57 tests |
| `npm.cmd run lint` | Pass |
| `npm.cmd run typecheck` | Pass |
| `npm.cmd audit --audit-level=moderate` | Pass after safe overrides |
| Next production build | Pass, 83 routes generated |
| Cloud Functions build | Pass |
| Mobile TypeScript check | Pass |
| Mobile Expo export | Blocked locally: Expo cannot resolve `metro/private/lib/TerminalReporter`; clean mobile install also fails with npm `Invalid Version` |
| Firebase Emulator rules tests | Not run: Firebase CLI and Java unavailable |
| Storage Emulator tests | Not run: Firebase CLI and Java unavailable |
| Real backup and restore | Not run: approved Firebase/GCP access unavailable |
| UAT | Awaiting authorised business testers |
| Formal penetration test or certification | Not performed and not claimed |

## Security and Tenant Isolation

The server/Admin SDK remains the authority for sensitive mutations. Commercial mode defaults are disabled in `.env.example`; billing is disabled and the provider is `disabled`. No payment-card data is collected or stored by this repository.

The corrected Storage rules require the caller workspace claim to match the path workspace before private reads. Firestore commercial reads continue to require explicit tenant claims. Existing operational modules still use the default internal workspace while commercial mode is disabled; a destructive migration was not performed.

Emulator rule verification remains a release gate. Run the rules tests in an isolated project or Emulator Suite before any production deployment.

## Performance Findings

No production load test was performed. The current repository contains bounded limits in API, mobile, AI, automation, and reporting paths, but several scheduled Functions still perform collection-wide scans. Measure dashboard, ticket list, search, reports, and tenant switching in staging with synthetic data before a broad rollout.

Do not load-test production. Record latency, error rate, retry count, Firestore reads, and Function duration in the staging test evidence.

## Accessibility and Responsive Review

The existing UI uses shared controls, semantic form labels, visible focus styles, responsive utility classes, and route-level error states. Automated WCAG tooling and a screen-reader review were not available in this repository run. Complete keyboard, zoom, mobile viewport, reduced-motion, contrast, and supported-browser checks during UAT.

No formal WCAG certification is claimed.

## UAT, Backup, and Recovery

- UAT is awaiting authorised users. Use [UAT-PLAN.md](UAT-PLAN.md) and attach evidence for each scenario.
- Backup configuration is represented in the enterprise readiness model, but a successful restore has not been verified.
- Recovery objectives are proposed, not approved: RPO 24 hours and RTO 8 hours for the initial internal pilot.
- A restore must use an isolated Firebase project and synthetic or approved non-production data.

## Manual Production Gates

1. Configure separate Firebase projects for development, staging, and production.
2. Store service credentials, peppers, webhook references, AI keys, and provider secrets in Secret Manager or the approved deployment secret store.
3. Deploy and verify Firestore rules, Storage rules, indexes, and Functions in staging.
4. Run Emulator and staging smoke tests, then complete and sign UAT.
5. Configure App Check, Authentication providers, approved domains, CORS, OAuth redirects, backups, budget alerts, and monitoring.
6. Complete and evidence an isolated restore drill.
7. Obtain technical and business release approval.
8. Deploy production only through the approved workflow. Do not deploy production from this local workstation merely because Phase 18 is complete.

## Known Limitations

- No live billing provider is enabled.
- SSO, MFA, email, FCM, App Check enforcement, and DNS/certificate automation require external provider configuration.
- Firebase Emulator tests require Firebase CLI and Java.
- Backup restore, disaster recovery, and cross-browser/mobile device testing require external environments.
- No formal penetration test, compliance certification, or legal review was performed.
- Existing scheduled sweeps should be checkpointed before high-volume production use.
