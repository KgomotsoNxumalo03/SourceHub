import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { decideKnowledgeReviewAction } from "@/lib/actions/knowledge";
import { Button, Card, CardContent, PageHeader, Textarea } from "@/components/ui";

export default async function KnowledgeReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("knowledge.articles.approve"); const { id } = await params; const article: any = await prisma.knowledgeArticle.findUnique({ where: { id } }); if (!article || article.workspaceId !== env.DEFAULT_WORKSPACE_ID) notFound();
  return <div className="space-y-6"><PageHeader eyebrow="Knowledge governance" title={`Review ${article.title}`} description="Approval is separated from authorship and records an immutable decision comment." actions={<Link href={`/knowledge/${id}`} className="text-sm text-sourcehub-primary">Back to article</Link>} /><Card><CardContent><form action={decideKnowledgeReviewAction} className="space-y-4"><input type="hidden" name="articleId" value={id} /><Textarea name="comment" placeholder="Review comments" required /><div className="flex gap-3"><Button name="decision" value="APPROVE" type="submit">Approve</Button><Button name="decision" value="REQUEST_CHANGES" type="submit" variant="outline">Request changes</Button><Button name="decision" value="REJECT" type="submit" variant="danger">Reject</Button></div></form></CardContent></Card></div>;
}
