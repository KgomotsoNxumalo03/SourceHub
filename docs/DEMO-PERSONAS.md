# Phase 20 Demo Personas

These personas are fictional and are intended for the Firebase Emulator or an approved non-production demo workspace. They do not create authentication accounts or contain passwords.

| Persona | Responsibilities | Main workflows | Restrictions |
| --- | --- | --- | --- |
| Platform administrator | Pilot setup, readiness, security evidence | Create pilot, review checklist, emergency pause | Cannot self-approve business readiness without a second authorised decision maker |
| Tenant owner | Workspace scope and participant review | Review pilot scope and onboarding | Cannot view other workspaces or platform-only operations |
| Service desk manager | Triage and support ownership | Ticket lifecycle, SLA review | No finance, HR, or platform-secret access |
| Technician | Resolve authorised service work | Ticket resolution, asset handover | No administrative or cross-tenant access |
| HR administrator | Employee and attendance administration | Employee readiness, attendance exception | No finance or platform-secret access |
| Finance user | Approved finance operations | Invoice review and reports | No HR-sensitive or security administration access |
| Project manager | Delivery coordination | Project, task, milestone, and time workflows | No platform security changes |
| Employee | Self-service internal work | Submit request, legitimate check-in, assigned tasks | No administrative browsing |
| Client contact | Client portal work | Submit and confirm support work | Portal scope only |
| Read-only auditor | Evidence review | Audit and UAT report review | Cannot mutate pilot, operational, or business records |

Use real Firebase Auth accounts only in the Emulator or an explicitly approved non-production project. Never add plaintext demo passwords to this repository.
