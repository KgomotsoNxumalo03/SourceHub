import Link from "next/link";
import { env } from "@/lib/env";
import { searchKnowledgeArticles } from "@/lib/knowledge";
import { Badge, Card, CardContent, EmptyState, Input, PageHeader } from "@/components/ui";
import { buttonClassName } from "@/lib/button";

export const dynamic = "force-dynamic";
export default async function PublicKnowledgePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!env.KNOWLEDGE_PUBLIC_ARTICLES_ENABLED) return <EmptyState title="Knowledge portal unavailable" description="Public articles are disabled for this workspace." />;
  const params = await searchParams; const q = String(params.q ?? ""); const articles = await searchKnowledgeArticles({ query: q, publicOnly: true, limit: 30 });
  return <main className="min-h-screen bg-sourcehub-muted px-6 py-10"><div className="mx-auto max-w-5xl space-y-8"><PageHeader eyebrow="SourceHub Help" title="Knowledge Base" description="Clear, approved guidance from Source IT Services." /><Card><CardContent><form className="flex gap-3"><Input name="q" defaultValue={q} placeholder="Search help articles" aria-label="Search help articles" /><button className={buttonClassName({})} type="submit">Search</button></form></CardContent></Card>{articles.length ? <div className="grid gap-4 md:grid-cols-2">{articles.map((article: any) => <Link key={article.id} href={`/knowledge/public/${article.slug}`}><Card className="h-full transition hover:-translate-y-0.5 hover:border-sourcehub-primary"><CardContent><div className="flex items-center justify-between gap-3"><Badge>{article.articleType}</Badge><span className="text-xs text-slate-500">{article.readingTimeMinutes ?? 5} min read</span></div><h2 className="mt-4 text-lg font-semibold">{article.title}</h2><p className="mt-2 text-sm text-slate-600">{article.summary}</p><div className="mt-4 flex flex-wrap gap-1">{(article.tags ?? []).slice(0, 5).map((tag: string) => <Badge key={tag}>{tag}</Badge>)}</div></CardContent></Card></Link>)}</div> : <EmptyState title="No public articles found" description="Try a different search phrase." />}</div></main>;
}
