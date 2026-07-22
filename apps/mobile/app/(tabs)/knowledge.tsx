import { Link } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";
import { EmptyState } from "@mobile/components/ui";
import { useAuth } from "@mobile/core/auth-context";
import { styles } from "@mobile/theme";

export default function KnowledgeScreen() { const { bootstrap } = useAuth(); const articles = bootstrap?.articles ?? []; return <FlatList data={articles} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.content} ListHeaderComponent={<View style={styles.header}><Text style={styles.eyebrow}>SourceHub Knowledge</Text><Text style={styles.title}>Knowledge Base</Text><Text style={styles.subtitle}>Published articles are filtered by the server before they reach the mobile cache.</Text></View>} ListEmptyComponent={<EmptyState title="No articles available" description="Your authorised published articles will appear here." />} renderItem={({ item }) => <Link href={`/knowledge/${item.id}`} asChild><Pressable style={styles.card}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.subtitle} numberOfLines={3}>{item.summary ?? "No summary"}</Text></Pressable></Link>} />; }
