import Link from "next/link";

import { buttonClassName } from "@/lib/button";

export function ContextualFeedbackButton({ module, route, pilotId }: { module: string; route: string; pilotId?: string }) {
  const query = new URLSearchParams({ module, route, ...(pilotId ? { pilotId } : {}) }).toString();
  return <Link href={`/feedback?${query}`} className={buttonClassName({ variant: "outline", size: "sm" })}>Give feedback</Link>;
}
