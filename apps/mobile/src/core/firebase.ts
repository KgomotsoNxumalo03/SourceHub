import { getApp, getApps, initializeApp } from "firebase/app";

import { mobileConfig } from "@mobile/core/config";

// Firebase client configuration is public metadata. Authentication remains the SourceHub API session.
export const mobileFirebaseApp = getApps().length ? getApp() : initializeApp({ projectId: mobileConfig.firebaseProjectId, appId: `sourcehub-mobile-${mobileConfig.environment}`, apiKey: "demo-sourcehub-mobile-client" });
