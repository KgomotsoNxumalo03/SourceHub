import * as Device from "expo-device";
import { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";

import { mobileApi, MobileApiError } from "@mobile/core/api";
import { mobileConfig } from "@mobile/core/config";
import { queueOperation, syncQueue } from "@mobile/core/queue";
import { clearProtectedState, readBootstrap, readToken, saveBootstrap, saveToken } from "@mobile/core/storage";
import { registerMobilePushToken } from "@mobile/core/push";
import type { MobileBootstrap, MobilePrincipal, SyncOperation } from "@mobile/core/types";

type AuthContextValue = { user: MobilePrincipal | null; bootstrap: MobileBootstrap | null; loading: boolean; offline: boolean; error: string | null; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>; refresh: () => Promise<void>; enqueue: (operation: SyncOperation) => Promise<void>; sync: () => Promise<void>; };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MobilePrincipal | null>(null);
  const [bootstrap, setBootstrap] = useState<MobileBootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try { const response = await mobileApi.bootstrap(); setUser(response.user); setBootstrap(response); await saveBootstrap(response); setOffline(false); await syncQueue(); try { const push = await registerMobilePushToken(); if (push) await mobileApi.registerPushToken({ ...push, deviceId: `${Device.modelName ?? "device"}-${Platform.OS}` }); } catch { /* Push registration is optional and retried on the next refresh. */ } } catch (caught: any) { if (caught instanceof MobileApiError && caught.status === 401) { await clearProtectedState(); setUser(null); setBootstrap(null); } else { const cached = await readBootstrap<MobileBootstrap>(); if (cached) { setUser(cached.user); setBootstrap(cached); setOffline(true); } else setError(caught?.message ?? "Unable to load SourceHub."); } }
  }

  useEffect(() => { (async () => { const token = await readToken(); if (token) await refresh(); setLoading(false); })(); }, []);
  async function login(email: string, password: string) { setLoading(true); setError(null); try { const response = await mobileApi.login({ email, password, deviceId: `${Device.modelName ?? "device"}-${Date.now()}`, platform: Platform.OS as "android" | "ios" | "web" | "unknown", appVersion: mobileConfig.appVersion }); await saveToken(response.token); setUser(response.principal); await refresh(); } catch (caught: any) { setError(caught?.message ?? "Unable to sign in."); throw caught; } finally { setLoading(false); } }
  async function logout() { try { if (!offline) await mobileApi.logout(); } finally { await clearProtectedState(); setUser(null); setBootstrap(null); } }
  async function enqueue(operation: SyncOperation) { await queueOperation(operation); if (!offline) await sync(); }
  async function sync() { try { await syncQueue(); setOffline(false); await refresh(); } catch { setOffline(true); } }
  return <AuthContext.Provider value={{ user, bootstrap, loading, offline, error, login, logout, refresh, enqueue, sync }}>{children}</AuthContext.Provider>;
}

export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error("useAuth must be used inside AuthProvider"); return context; }
