import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { saveKnowledgeDraftAction } from "@/lib/actions/knowledge";
import { Button, Card, CardContent, Input, PageHeader, Select, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";
export default async function EditKnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("knowledge.articles.update"); const { id } = await params; const article: any = await prisma.knowledgeArticle.findUnique({ where: { id } }); if (!article || article.workspaceId !== env.DEFAULT_WORKSPACE_ID) notFound();
  return <div className="space-y-6"><PageHeader eyebrow="Knowledge operations" title={`Edit ${article.articleReference ?? "article"}`} description="Saving creates an immutable revision and moves published content back to draft for review." actions={<Link href={`/knowledge/${id}`} className="text-sm text-sourcehub-primary">Back to article</Link>} /><Card><CardContent><form action={saveKnowledgeDraftAction} className="grid gap-4 md:grid-cols-2"><input type="hidden" name="articleId" value={id} /><label className="text-sm font-medium md:col-span-2">Title<Input name="title" defaultValue={article.title} required /></label><label className="text-sm font-medium md:col-span-2">Summary<Textarea name="summary" defaultValue={article.summary ?? ""} className="min-h-20" /></label><label className="text-sm font-medium">Visibility<Select name="visibility" defaultValue={article.visibility}><option>INTERNAL</option><option>CLIENT</option><option>PUBLIC</option></Select></label><label className="text-sm font-medium">Client ID<Input name="clientId" defaultValue={article.clientId ?? ""} /></label><label className="text-sm font-medium">Category ID<Input name="categoryId" defaultValue={article.categoryId ?? ""} /></label><label className="text-sm font-medium">Tags<Input name="tags" defaultValue={(article.tags ?? []).join(", ")} /></label><label className="text-sm font-medium md:col-span-2">Content<Textarea name="contentHtml" defaultValue={article.contentHtml ?? ""} required className="min-h-96 font-mono text-xs" /></label><label className="text-sm font-medium md:col-span-2">Change description<Input name="changeDescription" placeholder="Explain what changed" /></label><div className="md:col-span-2"><Button type="submit">Save revision</Button></div></form></CardContent></Card></div>;
}
