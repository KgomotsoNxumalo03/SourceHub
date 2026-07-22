import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { useEffect } from "react";

import { AuthProvider } from "@mobile/core/auth-context";
import { safeDeepLink } from "@mobile/core/mobile-core";

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });

export default function RootLayout() {
  const router = useRouter();
  useEffect(() => { const subscription = Linking.addEventListener("url", ({ url }) => { const link = safeDeepLink(url); if (link) router.push(`/${link.resource}/${link.id}` as never); }); return () => subscription.remove(); }, [router]);
  return <AuthProvider><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F4F7FB" } }}><Stack.Screen name="sign-in" /><Stack.Screen name="(tabs)" /><Stack.Screen name="tickets/[id]" /><Stack.Screen name="assets/[id]" /><Stack.Screen name="scan" /><Stack.Screen name="ai" /></Stack></AuthProvider>;
}
