import { StyleSheet } from "react-native";

export const colors = { navy: "#092058", secondary: "#11386D", blue: "#0F46B0", cyan: "#0BBCEB", ink: "#12213D", muted: "#64748B", border: "#D9E2EF", surface: "#FFFFFF", background: "#F4F7FB", success: "#167A54", warning: "#A15C00", danger: "#B42318" } as const;
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 16 },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10, gap: 5 },
  eyebrow: { color: colors.blue, fontSize: 11, fontWeight: "800", letterSpacing: 2.5, textTransform: "uppercase" },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  label: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  input: { minHeight: 50, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, color: colors.ink, backgroundColor: colors.surface, fontSize: 15 },
  primaryButton: { backgroundColor: colors.blue, borderRadius: 14, minHeight: 50, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  secondaryButton: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
  secondaryText: { color: colors.blue, fontSize: 15, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, backgroundColor: "#E6EEF9" },
  badgeText: { color: colors.blue, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  error: { color: colors.danger, backgroundColor: "#FFF1F0", borderColor: "#F5C4C0", borderWidth: 1, borderRadius: 12, padding: 12, lineHeight: 19 },
});
