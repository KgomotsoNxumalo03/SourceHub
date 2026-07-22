import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export async function registerMobilePushToken() {
  if (!Device.isDevice) return null;
  const existing = await Notifications.getPermissionsAsync();
  let permission = (existing as any).status as string;
  if (permission !== "granted") permission = (await Notifications.requestPermissionsAsync() as any).status;
  if (permission !== "granted") return null;
  const token = await Notifications.getDevicePushTokenAsync();
  return { token: token.data, platform: Platform.OS === "ios" ? "ios" : "android", permissionStatus: permission };
}
