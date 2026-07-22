import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@mobile/core/auth-context";

export default function Index() { const { user, loading } = useAuth(); if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#0F46B0" /></View>; return <Redirect href={user ? "/(tabs)" : "/sign-in"} />; }
