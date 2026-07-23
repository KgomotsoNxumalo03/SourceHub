# SourceHub Production Launch Checklist

Production deployment is not authorised by this document. The release owner must approve every gate.

## Before Staging

- [ ] `main` contains the reviewed Phase 18 commit.
- [ ] No `.env`, service-account file, private key, export, customer fixture, or test credential is staged.
- [ ] Development, staging, and production Firebase project IDs are distinct.
- [ ] Secret Manager references are configured; secrets are not copied into documentation.
- [ ] Firestore rules, Storage rules, indexes, and Functions source are reviewed.

## Staging Validation

- [ ] `npm ci`
- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm audit --audit-level=moderate`
- [ ] Functions build passes.
- [ ] Firebase Emulator rules tests pass.
- [ ] `/api/health` returns `status=ok`.
- [ ] Smoke tests pass without destructive production actions.
- [ ] UAT scenarios are completed by authorised testers.
- [ ] Technical and business sign-off is recorded.

## External Production Controls

- [ ] Firebase Auth providers, approved domains, email templates, MFA, and OAuth redirect URIs are configured.
- [ ] App Check is configured and enforcement status is verified.
- [ ] CORS and allowed origins are restricted to approved domains.
- [ ] Secret Manager, webhook secret references, API peppers, and AI provider keys are configured.
- [ ] Firestore indexes and Storage lifecycle rules are deployed.
- [ ] Scheduled exports, Storage backup/retention, budget alerts, and monitoring are configured.
- [ ] An isolated restore drill passed and its evidence is attached.
- [ ] Rollback owner, change window, and communication plan are confirmed.
- [ ] Commercial SaaS and live billing remain disabled unless separately approved.

## Deployment and Rollback

1. Create the release artifact from the approved commit.
2. Deploy staging and record the deployment ID.
3. Run smoke tests and monitor errors, latency, authentication failures, permission denials, Function failures, and webhook failures.
4. Obtain explicit production approval from the release owner.
5. Deploy production through the approved CI/CD workflow only.
6. Run the non-destructive smoke suite and monitor the pilot.
7. If the gate fails, stop rollout, enable the approved feature flag or maintenance control, and roll back the frontend/Functions/rules deployment as documented.
8. Run post-rollback verification and record any forward data repair separately.

## Production Smoke Test

- [ ] Homepage
- [ ] Login and logout
- [ ] Protected route redirects unauthenticated users
- [ ] Dashboard loads
- [ ] Tenant context is correct
- [ ] Ticket list and permitted detail read
- [ ] Search returns only permitted records
- [ ] Reporting permission denial and permitted report
- [ ] Admin permission denial for a standard user
- [ ] `/api/health`
- [ ] Mobile staging endpoint if a mobile release is included
