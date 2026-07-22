import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

import { Button, Field, StatusBadge } from "@mobile/components/ui";
import { mobileApi } from "@mobile/core/api";
import { useAuth } from "@mobile/core/auth-context";
import { operationKey } from "@mobile/core/mobile-core";
import { colors, styles } from "@mobile/theme";

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bootstrap, enqueue, user, offline } = useAuth();
  const ticket = bootstrap?.tickets.find((item) => String(item.id) === String(id));
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  if (!ticket) return <View style={styles.content}><Text style={styles.title}>Ticket unavailable</Text><Text style={styles.subtitle}>This record is not in your authorised mobile cache.</Text></View>;
  async function sendReply() { if (!body.trim()) return; setBusy(true); try { await enqueue({ type: user?.portalClientId ? "ticket.reply" : "ticket.note", idempotencyKey: operationKey("ticket.reply", String(id)), payload: { ticketId: id, body }, clientRecordedAt: new Date().toISOString() }); setBody(""); Alert.alert("Queued", offline ? "Your response will sync when you are online." : "The response was sent to SourceHub."); } finally { setBusy(false); } }
  async function addPhoto() { const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.75 }); const asset = result.canceled ? null : result.assets[0]; if (!asset) return; setBusy(true); try { await mobileApi.uploadTicketFile(String(id), asset.uri, asset.fileName ?? `sourcehub-${Date.now()}.jpg`, asset.mimeType ?? "image/jpeg"); Alert.alert("Uploaded", "The photo is now attached to the ticket."); } catch (error: any) { Alert.alert("Upload failed", error.message); } finally { setBusy(false); } }
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}><Stack.Screen options={{ title: String(ticket.reference ?? "Ticket") }} /><View style={styles.header}><Text style={styles.eyebrow}>Ticket {ticket.reference ?? id}</Text><Text style={styles.title}>{ticket.subject ?? "Untitled ticket"}</Text><StatusBadge label={String(ticket.status ?? "OPEN")} tone={ticket.priority === "URGENT" ? "danger" : "default"} /></View><View style={styles.card}><Text style={styles.cardTitle}>Details</Text><Text style={styles.subtitle}>{ticket.description ?? "No description provided."}</Text><Text style={{ color: colors.muted }}>Priority: {ticket.priority ?? "NORMAL"}</Text></View><View style={styles.card}><Text style={styles.cardTitle}>{user?.portalClientId ? "Reply to support" : "Internal note"}</Text><Field label="Message" value={body} onChangeText={setBody} placeholder="Write a clear update" multiline textAlignVertical="top" style={[styles.input, { minHeight: 110, paddingTop: 14 }]} /><Button label="Send" onPress={sendReply} loading={busy} /><Button label="Take photo" variant="secondary" onPress={addPhoto} loading={busy} /></View></ScrollView>;
}
