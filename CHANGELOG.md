# Changelog

## Unreleased

### Repository Audit

- Added missing composite indexes for pilot evidence and pilot-scoped operational feedback queries.
- Made Firebase Admin initialization work with service-account files, Application Default Credentials, or emulator/project configuration instead of requiring an ignored local secret file.
- Recorded repository-wide validation evidence and external/manual checks in `docs/REPOSITORY-AUDIT-REPAIR.md`.

### Phase 19

- Added an authenticated operations dashboard for internal health, incidents, defects, feedback, and release tracking.
- Added privacy-safe, allowlisted product analytics and bounded operational retention.
- Added feedback submission, incident communication templates, release-gate documentation, and Phase 19 regression tests.
- Kept production deployment, external alerting, billing, and customer telemetry pending explicit approval and external validation.

### Phase 20

- Added protected pilot management, readiness evidence, UAT scenarios, human decision records, and tenant-scoped UAT export.
- Added role-aware pilot onboarding, optional product tour persistence, contextual feedback, and synthetic/demo data safeguards.
- Kept commercial mode, billing, production deployment, and external customer access disabled or pending approval.
