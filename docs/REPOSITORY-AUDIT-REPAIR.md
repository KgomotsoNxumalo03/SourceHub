# Repository Audit and Repair

## Scope

This audit reviewed the SourceHub web application, Firebase configuration and rules, Cloud Functions, mobile TypeScript project, CI workflow, dependency posture, route protection, pilot enablement work, documentation, and the local production build. The review preserves the Firebase-only data architecture and does not enable commercial mode or production deployment.

## Repairs Applied

- Added composite Firestore indexes for pilot detail/UAT collections and pilot-scoped operational feedback. These cover the multi-field workspace and pilot queries used by the pilot dashboard and evidence pages.
- Made the web Firestore Admin adapter and Cloud Functions entrypoint credential-source aware. They use an existing service-account file when present, otherwise fall back to Firebase Application Default Credentials or emulator/project configuration. This removes an unnecessary dependency on an ignored local file during clean CI, emulator, and hosted deployments.
- Kept direct browser writes denied for operational, pilot, UAT, onboarding progress, and synthetic evidence collections. Server actions remain responsible for actor and workspace scoping.

## Validation Evidence

| Area | Result |
| --- | --- |
| Unit and boundary tests | 68 passed, 0 failed |
| Web lint | Passed |
| Web TypeScript | Passed |
| Cloud Functions TypeScript build | Passed |
| Mobile TypeScript | Passed in baseline validation |
| Dependency audit | 0 vulnerabilities at the configured moderate threshold in baseline validation |
| Production web build | Passed; all application routes compiled |
| Synthetic pilot seed | Small-volume dry run passed: 52 records across 2 tenants |
| Local route smoke check | `/login` and `/api/health` returned 200; tested application routes redirected unauthenticated requests to `/login` |
| Git diff hygiene | `git diff --check` passed |

## Security and Isolation Review

- Application reads and server actions use workspace-scoped actors or the configured default workspace.
- Pilot status changes require explicit confirmation for high-risk lifecycle transitions.
- UAT CSV export sanitizes spreadsheet formula prefixes.
- Synthetic data is deterministic, tenant-scoped, explicitly labelled, and guarded against production-like targets.
- Firebase Storage has a deny-by-default fallback and bounded file-type/size rules for supported areas.
- No continuous idle, screenshot, keystroke, website, or application surveillance was added.
- Existing compatibility imports named `prisma` refer to the Firestore adapter; no SQL client or SQL runtime dependency was introduced.

## Checks Requiring External or Human Execution

- Firebase Emulator Suite rules and Functions tests were not run because the Java/Emulator toolchain was not available in this validation session. Risk: deployed rules and scheduled handlers still require environment-level verification.
- Backup restore, RPO/RTO, App Check, external alerting, billing, and budget controls require approved Firebase/GCP configuration and were not claimed as complete.
- Browser console, keyboard-only, screen-reader, responsive visual QA, and human UAT require a browser and named testers. Automated route smoke checks do not replace those gates.
- Mobile native export/device testing remains toolchain-dependent; TypeScript validation passed.

## Recommendation

The repository is technically healthier and the local application is runnable, but it is **not ready for a controlled internal pilot** until Firebase Emulator/rules evidence, backup restore evidence, external monitoring, and human UAT/approval are completed. Automated green checks are evidence of implementation quality, not business or production approval.
