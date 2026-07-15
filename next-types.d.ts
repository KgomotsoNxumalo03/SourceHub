import type * as React from "react";

declare module "next" {
  export type Metadata = Record<string, unknown>;

  export interface NextConfig {
    [key: string]: unknown;
  }

  const next: {
    [key: string]: unknown;
  };

  export default next;
}

declare module "next/navigation" {
  export function redirect(url: string): never;
  export function permanentRedirect(url: string): never;
  export function notFound(): never;
  export function forbidden(): never;
  export function unauthorized(): never;
  export function usePathname(): string;
  export function useRouter(): {
    push(url: string): void;
    replace(url: string): void;
    refresh(): void;
    back(): void;
    forward(): void;
    prefetch(url: string): Promise<void>;
  };
  export function useSearchParams(): ReadonlyURLSearchParams;
  export function useParams(): Record<string, string | string[]>;
  export function useSelectedLayoutSegment(): string | null;
  export function useSelectedLayoutSegments(): string[];
  export function useServerInsertedHTML(callback: () => React.ReactNode): void;
  export const ReadonlyURLSearchParams: typeof URLSearchParams;
  export const RedirectType: {
    push: "push";
    replace: "replace";
  };
  export const ServerInsertedHTMLContext: React.Context<unknown>;
  export function unstable_rethrow(error: unknown): never;
}

declare module "next/headers" {
  interface CookieStore {
    get(name: string): { value: string } | undefined;
    getAll(name?: string): Array<{ name: string; value: string }>;
    has(name: string): boolean;
    set(
      name: string,
      value: string,
      options?: {
        httpOnly?: boolean;
        sameSite?: "lax" | "strict" | "none";
        secure?: boolean;
        path?: string;
        expires?: Date;
      },
    ): void;
    delete(name: string): void;
  }

  export function cookies(): CookieStore;
  export function headers(): Headers;
  export function draftMode(): {
    isEnabled: boolean;
    enable(): void;
    disable(): void;
  };
}

declare module "next/cache" {
  export function revalidatePath(path: string): void;
  export function revalidateTag(tag: string): void;
  export function unstable_cache<T extends (...args: never[]) => unknown>(fn: T): T;
  export function unstable_expirePath(path: string): void;
  export function unstable_expireTag(tag: string): void;
  export function unstable_noStore(): void;
  export function unstable_cacheLife(profile: string): void;
  export function unstable_cacheTag(tag: string): void;
}
