import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { firestoreAdmin } from "@/lib/db";
import { collectionNames } from "@/lib/collections";
import { env } from "@/lib/env";
import { currentUser } from "@/lib/auth";
import { hasPermission, type CurrentUser } from "@/lib/permissions";
import { articleSearchTokens, canAccessKnowledgeArticle, knowledgePlainTextFromHtml, sanitizeKnowledgeHtml } from "@/lib/knowledge-utils";

export const knowledgeWorkspaceId = env.DEFAULT_WORKSPACE_ID;

export function articleSnapshot(article: Record<string, any>) {
  return {
    title: article.title,
    summary: article.summary ?? "",
    contentHtml: sanitizeKnowledgeHtml(article.contentHtml ?? ""),
    contentText: article.contentText ?? knowledgePlainTextFromHtml(article.contentHtml ?? ""),
    categoryId: article.categoryId ?? null,
    tags: article.tags ?? [],
    visibility: article.visibility,
    clientId: article.visibility === "CLIENT" ? article.clientId ?? null : null,
    siteIds: article.visibility === "CLIENT" ? article.siteIds ?? [] : [],
    articleType: article.articleType,
    readingTimeMinutes: article.readingTimeMinutes ?? 5,
  };
}

export function revisionHash(snapshot: unknown) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function articleTokens(article: { title: string; summary?: string; contentText?: string; tags?: string[] }) {
  return articleSearchTokens(article.title, article.summary ?? "", article.contentText ?? "", article.tags ?? []);
}

export async function requireKnowledgeActor(permission: string) {
  const actor = await currentUser();
  if (!actor || !hasPermission(actor, permission)) throw new Error("You do not have permission to perform this action.");
  return actor;
}

export async function loadKnowledgeArticle(id: string) {
  const article = await (await import("@/lib/db")).prisma.knowledgeArticle.findUnique({ where: { id } });
  return article && article.workspaceId === knowledgeWorkspaceId ? article : null;
}

export async function allocateKnowledgeReference(transaction: FirebaseFirestore.Transaction, slug: string) {
  const slugId = `${knowledgeWorkspaceId}:${slug}`;
  const slugReference = firestoreAdmin.collection(collectionNames.knowledgeSlugUniqueness).doc(slugId);
  const existing = await transaction.get(slugReference);
  if (existing.exists) throw new Error("That article slug is already in use.");
  const counterReference = firestoreAdmin.collection(collectionNames.knowledgeArticleUniqueness).doc(`${knowledgeWorkspaceId}:counter`);
  const counter = await transaction.get(counterReference);
  const next = Number(counter.data()?.next ?? 1);
  transaction.set(counterReference, { workspaceId: knowledgeWorkspaceId, next: next + 1, updatedAt: new Date() }, { merge: true });
  transaction.create(slugReference, { workspaceId: knowledgeWorkspaceId, slug, createdAt: new Date() });
  return `KB-${String(next).padStart(5, "0")}`;
}

export async function recordKnowledgeActivity(data: Record<string, any>) {
  const actor = await currentUser();
  await (await import("@/lib/db")).prisma.knowledgeActivity.create({
    data: { id: randomUUID(), workspaceId: knowledgeWorkspaceId, actorId: actor?.id ?? null, createdAt: new Date(), ...data },
  });
}

export function canViewKnowledgeArticle(article: Record<string, any>, actor: CurrentUser | null, portalClientId?: string | null) {
  if (portalClientId || actor?.permissions.includes("knowledge.client.view")) return canAccessKnowledgeArticle(article as { status: string; visibility: string; clientId?: string | null }, actor, portalClientId);
  return Boolean(actor?.permissions.includes("knowledge.internal.view") && article.workspaceId === knowledgeWorkspaceId);
}

export async function searchKnowledgeArticles({ query = "", area, categoryId, articleType, tag, clientId, publicOnly = false, limit = 20 }: { query?: string; area?: string; categoryId?: string; articleType?: string; tag?: string; clientId?: string; publicOnly?: boolean; limit?: number }) {
  const { prisma } = await import("@/lib/db");
  const where: Record<string, any> = { workspaceId: knowledgeWorkspaceId, status: "PUBLISHED" };
  if (publicOnly) where.visibility = "PUBLIC";
  if (area) where.area = area;
  if (categoryId) where.categoryId = categoryId;
  if (articleType) where.articleType = articleType;
  if (tag) where.tags = { arrayContains: tag };
  const records: any[] = await prisma.knowledgeArticle.findMany({ where, orderBy: [{ updatedAt: "desc" }], take: Math.min(Math.max(limit * 5, 20), 250) });
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return records.filter((article) => {
    if (clientId && article.visibility === "CLIENT" && article.clientId !== clientId) return false;
    if (clientId && !["PUBLIC", "CLIENT"].includes(article.visibility)) return false;
    if (!terms.length) return true;
    return terms.every((term) => (article.searchTokens ?? []).some((token: string) => token.includes(term)) || `${article.title} ${article.summary}`.toLowerCase().includes(term));
  }).slice(0, limit);
}

export function safeArticleContent(contentHtml: string) {
  const sanitized = sanitizeKnowledgeHtml(contentHtml);
  return { contentHtml: sanitized, contentText: knowledgePlainTextFromHtml(sanitized), searchTokens: articleSearchTokens("", "", knowledgePlainTextFromHtml(sanitized)) };
}
