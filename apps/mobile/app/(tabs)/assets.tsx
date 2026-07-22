import { Link } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";

import { EmptyState, StatusBadge } from "@mobile/components/ui";
import { useAuth } from "@mobile/core/auth-context";
import { colors, styles } from "@mobile/theme";

export default function AssetsScreen() { const { bootstrap } = useAuth(); const assets = bootstrap?.assets ?? []; return <FlatList data={assets} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.content} ListHeaderComponent={<View style={styles.header}><Text style={styles.eyebrow}>Inventory</Text><Text style={styles.title}>Assets</Text><Text style={styles.subtitle}>Scan a label or open an authorised asset record.</Text></View>} ListEmptyComponent={<EmptyState title="No assets available" description="Assets are limited by your workspace, client and user permissions." />} renderItem={({ item }) => <Link href={`/assets/${item.id}`} asChild><Pressable style={styles.card}><View style={styles.row}><Text style={styles.cardTitle}>{item.name ?? item.assetTag ?? "Asset"}</Text><StatusBadge label={String(item.status ?? "ACTIVE")} tone={item.status === "LOST" || item.status === "STOLEN" ? "danger" : "success"} /></View><Text style={styles.subtitle}>{item.assetTag ?? item.id}</Text><Text style={styles.subtitle}>{item.category ?? "Uncategorised"} · {item.clientId ? "Client asset" : "Internal asset"}</Text></Pressable></Link>} />; }
