import Link from "next/link";
import { Sparkles } from "lucide-react";
import { buttonClassName } from "@/lib/button";

export function AiContextLink({ module, type, id, enabled = true }: { module: string; type: string; id: string; enabled?: boolean }) {
  if (!enabled) return null;
  return <Link href={`/ai?contextModule=${encodeURIComponent(module)}&contextType=${encodeURIComponent(type)}&contextId=${encodeURIComponent(id)}`} className={buttonClassName({ variant: "outline", size: "sm" })}><Sparkles className="h-4 w-4" /> Ask AI</Link>;
}
