# SourceHub Mobile

SourceHub Mobile is an Expo React Native TypeScript client for technicians, employees, and authorised client users.

## Local setup

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SOURCEHUB_API_URL` to the running SourceHub web server. A physical device must use the host machine's LAN address instead of `localhost`.
2. Run `npm install` in this directory.
3. Start Expo with `npm run start` and open the project in Expo Go or a development build.

The app uses the SourceHub API for authentication and authoritative writes. It stores only an opaque session token in SecureStore, caches authorised bootstrap data locally, and queues idempotent offline operations for server reconciliation. Firebase client metadata is optional public configuration; Firebase Admin credentials, service account files, and provider secrets must never be placed in this directory.

Camera, photo uploads, QR scanning, location events, push notifications, AI access, and navigation are permission-gated. Location is event-only, not continuous tracking. Attendance and other sensitive writes are confirmed by the trusted server workflow.

## Checks

- `npm run typecheck`
- `npm run export`

Android and iOS signing, App Check native providers, and push credentials are configured in the EAS/development-build environment, not committed to this repository.
