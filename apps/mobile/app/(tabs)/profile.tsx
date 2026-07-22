import { Text, View } from "react-native";
import { router } from "expo-router";
import { Button, StatusBadge } from "@mobile/components/ui";
import { useAuth } from "@mobile/core/auth-context";
import { roleMode } from "@mobile/core/mobile-core";
import { mobileConfig } from "@mobile/core/config";
import { styles } from "@mobile/theme";

export default function ProfileScreen() { const { user, logout, offline } = useAuth(); return <View style={styles.screen}><View style={styles.content}><View style={styles.header}><Text style={styles.eyebrow}>Account</Text><Text style={styles.title}>Profile</Text></View><View style={styles.card}><Text style={styles.cardTitle}>{user?.firstName} {user?.lastName}</Text><Text style={styles.subtitle}>{user?.email}</Text><Text style={styles.subtitle}>{user?.jobTitle ?? "SourceHub user"} · {roleMode(user)}</Text><StatusBadge label={offline ? "Offline" : "Session protected"} tone={offline ? "warning" : "success"} /></View><View style={styles.card}><Text style={styles.cardTitle}>Permissions</Text><Text style={styles.subtitle}>{user?.mobilePermissions.join(" · ") || "No mobile permissions"}</Text></View><Button label="Sign out and clear protected cache" variant="secondary" onPress={async () => { await logout(); router.replace("/sign-in"); }} /><Text style={styles.subtitle}>SourceHub Mobile {mobileConfig.appVersion} · {mobileConfig.environment}</Text></View></View>; }
