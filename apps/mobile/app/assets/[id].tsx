import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { StatusBadge } from "@mobile/components/ui";
import { useAuth } from "@mobile/core/auth-context";
import { styles } from "@mobile/theme";

export default function AssetDetailScreen() { const { id } = useLocalSearchParams<{ id: string }>(); const asset = useAuth().bootstrap?.assets.find((item) => String(item.id) === String(id)); if (!asset) return <View style={styles.content}><Text style={styles.title}>Asset unavailable</Text><Text style={styles.subtitle}>This asset is not in your authorised cache.</Text></View>; return <ScrollView style={styles.screen} contentContainerStyle={styles.content}><Stack.Screen options={{ title: String(asset.assetTag ?? asset.name ?? "Asset") }} /><View style={styles.header}><Text style={styles.eyebrow}>Asset record</Text><Text style={styles.title}>{asset.name ?? asset.assetTag ?? id}</Text><StatusBadge label={String(asset.status ?? "ACTIVE")} /></View><View style={styles.card}><Text style={styles.cardTitle}>Inventory details</Text><Text style={styles.subtitle}>Asset tag: {asset.assetTag ?? "Not recorded"}</Text><Text style={styles.subtitle}>Serial number: {asset.serialNumber ?? "Not recorded"}</Text><Text style={styles.subtitle}>Client: {asset.clientName ?? asset.clientId ?? "Internal"}</Text></View></ScrollView>; }
