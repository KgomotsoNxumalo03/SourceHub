"use client";

import { Check, Moon, Monitor, Sun } from "lucide-react";

import { useTheme, type ThemeMode } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const choices: Array<{ mode: ThemeMode; label: string; description: string; icon: typeof Sun }> = [
  { mode: "light", label: "Light", description: "Bright workspace for daytime work.", icon: Sun },
  { mode: "dark", label: "Dark", description: "Vibrant navy workspace with reduced glare.", icon: Moon },
  { mode: "system", label: "System", description: "Follow your device preference automatically.", icon: Monitor },
];

export function ThemeSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {choices.map(({ mode, label, description, icon: Icon }) => {
        const selected = theme === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => setTheme(mode)}
            aria-pressed={selected}
            className={cn(
              "group relative rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-sourcehub-primary",
              selected ? "border-sourcehub-primary bg-sourcehub-primary/10 shadow-[0_0_0_1px_rgb(var(--sourcehub-primary)/0.22),0_12px_30px_rgb(var(--sourcehub-primary)/0.12)]" : "border-sourcehub-border bg-white dark:bg-sourcehub-surface",
            )}
          >
            <span className="flex items-center justify-between">
              <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", selected ? "bg-sourcehub-primary text-white" : "bg-sourcehub-muted text-sourcehub-primary")}>
                <Icon className="h-5 w-5" />
              </span>
              {selected ? <Check className="h-5 w-5 text-sourcehub-primary" /> : null}
            </span>
            <span className="mt-4 block font-semibold text-sourcehub-text">{label}</span>
            <span className="mt-1 block text-sm leading-5 text-slate-600">{description}</span>
          </button>
        );
      })}
    </div>
  );
}
