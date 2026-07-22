import Constants from "expo-constants";

export const mobileConfig = {
  apiUrl: String(process.env.EXPO_PUBLIC_SOURCEHUB_API_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "sourcehub-dev",
  appVersion: String(Constants.expoConfig?.version ?? "1.0.0"),
  environment: process.env.EXPO_PUBLIC_SOURCEHUB_ENV ?? "development",
  appCheckEnabled: process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_ENABLED === "true",
};
