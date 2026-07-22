import Link from "next/link";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { knowledgeStatusTone } from "@/lib/knowledge-utils";
import { Badge, Button, Card, CardContent, EmptyState, Input, PageHeader, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow } from "@/components/ui";
import { buttonClassName } from "@/lib/button";

export const dynamic = "force-dynamic";

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("knowledge.internal.view");
  const query = await searchParams;
  const search = String(query.q ?? "").trim().toLowerCase();
  const status = String(query.status ?? "").trim();
  const articles: any[] = await prisma.knowledgeArticle.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, ...(status ? { status } : {}) }, orderBy: [{ updatedAt: "desc" }], take: 200 });
  const filtered = articles.filter((article) => !search || `${article.title} ${article.summary} ${(article.tags ?? []).join(" ")}`.toLowerCase().includes(search));
  const counts = articles.reduce((result, article) => ({ ...result, [article.status]: (result[article.status] ?? 0) + 1 }), {} as Record<string, number>);
  return <div className="space-y-6"><PageHeader eyebrow="Knowledge operations" title="Knowledge Base" description="Create, review, publish and govern trusted internal and client guidance." actions={<Link href="/knowledge/new" className={buttonClassName({})}>New article</Link>} /><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "EXPIRED", "ARCHIVED"].map((key) => <Card key={key}><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{key.replaceAll("_", " ")}</p><p className="mt-2 text-2xl font-bold">{counts[key] ?? 0}</p></CardContent></Card>)}</div><Card><CardContent><form className="flex flex-col gap-3 sm:flex-row"><Input name="q" defaultValue={String(query.q ?? "")} placeholder="Search title, summary or tags" /><select name="status" defaultValue={status} className="h-11 rounded-xl border border-sourcehub-border px-4 text-sm"><option value="">All statuses</option>{["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "PUBLISHED", "EXPIRED", "ARCHIVED"].map((item) => <option key={item}>{item}</option>)}</select><Button type="submit">Search</Button></form></CardContent></Card>{filtered.length ? <Table><TableHead><TableRow><TableHeadCell>Article</TableHeadCell><TableHeadCell>Area</TableHeadCell><TableHeadCell>Visibility</TableHeadCell><TableHeadCell>Status</TableHeadCell><TableHeadCell>Updated</TableHeadCell></TableRow></TableHead><TableBody>{filtered.map((article) => <TableRow key={article.id}><TableCell><Link href={`/knowledge/${article.id}`} className="font-semibold text-sourcehub-primary hover:underline">{article.articleReference ?? article.id.slice(0, 8)} · {article.title}</Link><p className="mt-1 text-xs text-slate-500">{article.summary}</p><div className="mt-2 flex flex-wrap gap-1">{(article.tags ?? []).slice(0, 4).map((tag: string) => <Badge key={tag}>{tag}</Badge>)}</div></TableCell><TableCell>{article.area}</TableCell><TableCell>{article.visibility}</TableCell><TableCell><Badge tone={knowledgeStatusTone(article.status)}>{article.status.replaceAll("_", " ")}</Badge></TableCell><TableCell>{article.updatedAt ? new Date(article.updatedAt).toLocaleDateString("en-ZA") : "-"}</TableCell></TableRow>)}</TableBody></Table> : <EmptyState title="No articles found" description="Create a draft or adjust the filters." action={<Link href="/knowledge/new" className={buttonClassName({})}>Create article</Link>} />}</div>;
}
