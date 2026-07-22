import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { sanitizeKnowledgeHtml } from "@/lib/knowledge-utils";
import { submitKnowledgeFeedbackAction } from "@/lib/actions/knowledge";
import { Badge, Button, Card, CardContent } from "@/components/ui";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const article: any = await prisma.knowledgeArticle.findFirst({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, slug, status: "PUBLISHED", visibility: "PUBLIC" } }); return { title: article ? `${article.title} | SourceHub Help` : "SourceHub Help", description: article?.summary ?? "Approved Source IT Services help article" }; }
export default async function PublicKnowledgeArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  if (!env.KNOWLEDGE_PUBLIC_ARTICLES_ENABLED) notFound(); const { slug } = await params; const article: any = await prisma.knowledgeArticle.findFirst({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, slug, status: "PUBLISHED", visibility: "PUBLIC" } }); if (!article) notFound();
  const snapshot = article.publishedSnapshot ?? article; return <main className="min-h-screen bg-sourcehub-muted px-6 py-10"><div className="mx-auto max-w-4xl space-y-6"><Link href="/knowledge/public" className="text-sm text-sourcehub-primary hover:underline">Back to Knowledge Base</Link><Card><CardContent><div className="flex flex-wrap gap-2"><Badge>{article.articleType}</Badge><span className="text-sm text-slate-500">{article.readingTimeMinutes ?? 5} min read</span></div><h1 className="mt-5 text-3xl font-bold tracking-tight">{snapshot.title ?? article.title}</h1><p className="mt-3 text-slate-600">{snapshot.summary ?? article.summary}</p><article className="knowledge-content prose mt-8 max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeKnowledgeHtml(snapshot.contentHtml ?? "") }} /></CardContent></Card><Card><CardContent><h2 className="font-semibold">Was this article helpful?</h2><div className="mt-4 flex flex-wrap gap-3"><form action={submitKnowledgeFeedbackAction}><input type="hidden" name="articleId" value={article.id} /><input type="hidden" name="type" value="HELPFUL" /><input type="hidden" name="ipAddress" value="public" /><Button type="submit" size="sm">Yes</Button></form><form action={submitKnowledgeFeedbackAction}><input type="hidden" name="articleId" value={article.id} /><input type="hidden" name="type" value="NOT_HELPFUL" /><input type="hidden" name="ipAddress" value="public" /><Button type="submit" size="sm" variant="outline">No</Button></form></div></CardContent></Card></div></main>;
}
