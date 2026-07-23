# SourceHub Operations Runbooks

These procedures are for staging and production responders. Replace role names with the approved on-call roster before launch.

## Severity

- SEV-1: broad outage, data exposure, authentication failure, or active security incident.
- SEV-2: major workflow unavailable with a safe workaround.
- SEV-3: isolated defect or degraded non-critical feature.

Every incident gets a correlation ID, an owner, a timeline, and a post-incident review.

## Common Response

1. Confirm the alert using `/api/health`, application logs, Firebase logs, and recent deployment history.
2. Record the time, affected environment, tenant scope, correlation ID, and suspected change.
3. Contain first: disable the affected feature flag, pause automation, revoke a credential, or enter controlled maintenance mode.
4. Do not copy production data into local development or paste secrets into tickets or chat.
5. Communicate impact, workaround, next update time, and recovery owner.
6. Verify recovery with smoke tests, permission checks, and audit evidence.

## Firebase or Hosting Outage

- Detection: health failures, Firebase status, elevated 5xx, or user reports.
- Immediate containment: pause deployments and high-risk automations; preserve request IDs.
- Recovery: confirm provider recovery, verify Auth, Firestore, Storage, Functions, then run smoke tests.
- Rollback: revert the last application or Function deployment only after confirming the provider is healthy.
- Verification: login, dashboard, ticket read, permission denial, and health endpoint.

## Authentication or Session Incident

- Detection: failed-login spike, token verification errors, session revocation reports, or suspicious sign-ins.
- Containment: disable the affected provider or revoke compromised sessions and credentials.
- Recovery: verify Firebase Auth configuration, clock skew, approved domains, redirect URIs, and claims refresh.
- Verification: disabled account denial, tenant switching, role change refresh, logout, and password reset.

## Firestore Degradation or Data Corruption

- Detection: elevated latency, transaction contention, failed scheduled jobs, or inconsistent records.
- Containment: pause write-heavy automation/import/export jobs and block risky migrations.
- Recovery: identify the affected tenant and time window; use an isolated restore or approved repair utility with dry-run, bounded batches, checkpoints, and verification.
- Rollback: prefer forward repair for Firestore data; never run destructive commands without backup and approval.
- Verification: tenant counts, audit events, permissions, references, and representative UAT flows.

## Storage or File-Upload Incident

- Detection: upload failures, unexpected content types, cross-tenant access report, or unusual download volume.
- Containment: disable the upload feature flag, revoke exposed URLs, and preserve Storage logs.
- Recovery: deploy corrected Storage rules, verify private paths, inspect metadata, and remove only approved unsafe objects.
- Verification: upload, download, replacement, deletion, portal scope, and cross-tenant denial in staging.

## Cloud Function Failure or Loop

- Detection: Function error rate, repeated event IDs, scheduled backlog, or growing dead-letter records.
- Containment: pause the trigger or feature flag; do not repeatedly replay an unknown event.
- Recovery: inspect idempotency records, retry a bounded sample, then resume from the latest checkpoint.
- Verification: no duplicate notifications or finance mutations, bounded batch completion, and audit evidence.

## Compromised Credential or Security Incident

1. Treat the credential as compromised without investigating it in a live shell.
2. Revoke the credential, rotate the secret in the approved manager, and invalidate active sessions if needed.
3. Preserve logs and timestamps; do not rewrite Git history without explicit authorisation.
4. Review access, Storage downloads, API calls, support sessions, exports, and tenant changes.
5. Notify the security owner and affected stakeholders under the incident policy.
6. Verify the replacement credential, least privilege, and audit trail.

## Backup and Restore Drill

The repository does not claim a successful backup or restore. In an approved isolated project:

1. Confirm Firestore export visibility and timestamp.
2. Confirm Storage object inventory and lifecycle settings.
3. Export Auth configuration and provider settings through approved Firebase/GCP tooling.
4. Restore to an isolated project with separate credentials and rules.
5. Deploy the exact rules and indexes from the reviewed commit.
6. Verify tenant records, sample files, user access, denied access, Functions configuration, and audit records.
7. Record duration, missing items, RPO, RTO, and follow-up actions.

Proposed initial pilot objectives: RPO 24 hours, RTO 8 hours, daily Firestore export, Storage lifecycle retention per policy, owner: platform operations. These are proposals until the business owner approves them.

## Provider Outages

- Email or FCM: queue safely, show an in-app status, avoid duplicate sends, and retry only with an idempotency key.
- AI provider: keep AI unavailable or on the safe development adapter only in non-production; do not expose prompts or secrets.
- Billing provider: keep commercial billing disabled, reject unsigned or replayed events, and preserve the local projection.
- DNS or OAuth provider: keep the prior deployment active, verify approved domains and redirects, and communicate a login workaround.

## Post-Incident Review

Record timeline, detection gap, customer impact, data impact, root cause, containment, recovery, rollback decision, tests added, owner, and due date. Close an incident only after monitoring is stable and the response procedure is updated.
