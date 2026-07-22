import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Button as NativeButton, Text, View } from "react-native";
import { safeQrValue } from "@mobile/core/mobile-core";
import { styles } from "@mobile/theme";

export default function ScanScreen() { const router = useRouter(); const [permission, requestPermission] = useCameraPermissions(); const [scanned, setScanned] = useState(false); if (!permission) return null; if (!permission.granted) return <View style={styles.content}><Stack.Screen options={{ title: "Scan" }} /><Text style={styles.title}>Camera access</Text><Text style={styles.subtitle}>SourceHub uses the camera only when you start a scan.</Text><NativeButton title="Allow camera" onPress={requestPermission} /></View>; return <View style={{ flex: 1, backgroundColor: "#000" }}><Stack.Screen options={{ title: "Scan" }} /><CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={scanned ? undefined : ({ data }: { data: string }) => { setScanned(true); const link = safeQrValue(data); if (link) { const match = link.match(/^\/(tickets|assets)\/([^/?]+)/); if (match) router.replace(`/${match[1]}/${match[2]}`); } }} /><View style={{ position: "absolute", bottom: 48, left: 24, right: 24, backgroundColor: "rgba(0,0,0,.72)", padding: 18, borderRadius: 16 }}><Text style={{ color: "#fff", textAlign: "center" }}>{scanned ? "Scan complete" : "Align a SourceHub QR code inside the frame"}</Text></View></View>; }
