declare module "expo-linking" {
  export function addEventListener(event: string, listener: (payload: { url: string }) => void): { remove(): void };
}

declare module "expo-camera" {
  export const CameraView: any;
  export function useCameraPermissions(): [{ granted: boolean } | null, () => Promise<unknown>];
}

declare module "expo-image-picker" {
  export function launchCameraAsync(options?: Record<string, unknown>): Promise<{ canceled: boolean; assets: Array<{ uri: string; fileName?: string; mimeType?: string }> }>;
}

declare module "expo-secure-store" {
  export function setItemAsync(key: string, value: string): Promise<void>;
  export function getItemAsync(key: string): Promise<string | null>;
  export function deleteItemAsync(key: string): Promise<void>;
}
