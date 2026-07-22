import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logAudit } from "@/lib/audit";
import { articleSnapshot } from "@/lib/knowledge";

function csv(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

export async function GET(request: Request) {
  const actor = await currentUser();
  if (!actor) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!actor.permissions.includes("knowledge.exports.create")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url); const format = url.searchParams.get("format") === "markdown" ? "markdown" : "csv"; const id = url.searchParams.get("id");
  const articles: any[] = await prisma.knowledgeArticle.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, ...(id ? { id } : {}) }, orderBy: [{ updatedAt: "desc" }], take: id ? 1 : 5000 });
  await logAudit({ userId: actor.id, action: "knowledge.export", entityType: "KnowledgeArticle", entityId: id, metadata: { format, count: articles.length } });
  if (format === "markdown") {
    const body = articles.map((article) => { const snapshot = articleSnapshot(article); return `# ${snapshot.title}\n\n${snapshot.summary}\n\n${snapshot.contentText}\n`; }).join("\n---\n");
    return new NextResponse(body, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": "attachment; filename=sourcehub-knowledge.md" } });
  }
  const body = ["reference,title,status,visibility,area,articleType,updatedAt", ...articles.map((article) => [article.articleReference, article.title, article.status, article.visibility, article.area, article.articleType, article.updatedAt].map(csv).join(","))].join("\n");
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=sourcehub-knowledge.csv" } });
}
