import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useAuth } from "@mobile/core/auth-context";
import { styles } from "@mobile/theme";

export default function KnowledgeDetailScreen() { const { id } = useLocalSearchParams<{ id: string }>(); const article = useAuth().bootstrap?.articles.find((item) => String(item.id) === String(id)); if (!article) return <View style={styles.content}><Text style={styles.title}>Article unavailable</Text><Text style={styles.subtitle}>This article is not in your authorised cache.</Text></View>; return <ScrollView style={styles.screen} contentContainerStyle={styles.content}><Stack.Screen options={{ title: String(article.title ?? "Knowledge") }} /><View style={styles.header}><Text style={styles.eyebrow}>SourceHub Knowledge</Text><Text style={styles.title}>{article.title}</Text></View><View style={styles.card}><Text style={styles.subtitle}>{article.body ?? article.summary ?? "This article has no mobile-readable body yet."}</Text></View></ScrollView>; }
