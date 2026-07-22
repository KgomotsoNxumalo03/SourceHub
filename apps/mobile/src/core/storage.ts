import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const tokenKey = "sourcehub.mobile.token";
const bootstrapKey = "sourcehub.mobile.bootstrap";
const queueKey = "sourcehub.mobile.sync-queue";

export async function saveToken(token: string) { await SecureStore.setItemAsync(tokenKey, token); }
export async function readToken() { return SecureStore.getItemAsync(tokenKey); }
export async function clearProtectedState() { await SecureStore.deleteItemAsync(tokenKey); await AsyncStorage.multiRemove([bootstrapKey, queueKey]); }
export async function saveBootstrap(value: unknown) { await AsyncStorage.setItem(bootstrapKey, JSON.stringify(value)); }
export async function readBootstrap<T>() { const value = await AsyncStorage.getItem(bootstrapKey); return value ? JSON.parse(value) as T : null; }
export async function saveQueue(value: unknown) { await AsyncStorage.setItem(queueKey, JSON.stringify(value)); }
export async function readQueue<T>() { const value = await AsyncStorage.getItem(queueKey); return value ? JSON.parse(value) as T : ([] as T); }
