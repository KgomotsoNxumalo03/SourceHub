"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { prisma, firestoreAdmin } from "@/lib/db";
import { collectionNames } from "@/lib/collections";
import { env } from "@/lib/env";
import { currentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { buildKnowledgeStoragePath, savePrivateBinaryToStorage, validateUpload } from "@/lib/storage";
import { articleSearchTokens, containsPotentialSecret, prerequisiteWouldCycle, sanitizeKnowledgeHtml, slugifyKnowledge } from "@/lib/knowledge-utils";
import { articleSnapshot, allocateKnowledgeReference, knowledgeWorkspaceId, loadKnowledgeArticle, recordKnowledgeActivity, revisionHash, safeArticleContent } from "@/lib/knowledge";
import { knowledgeArticleSchema, knowledgeCategorySchema, knowledgeFeedbackSchema, knowledgeImportSchema, knowledgeRelationSchema, knowledgeReviewDecisionSchema, knowledgeRevisionSchema } from "@/lib/validators";

function value(formData: FormData, name: string) { return String(formData.get(name) ?? "").trim(); }
function list(formData: FormData, name: string) { return value(formData, name).split(",").map((entry) => entry.trim()).filter(Boolean); }
function checked(formData: FormData, name: string) { return formData.get(name) === "on" || formData.get(name) === "true"; }
function fail(path: string, message: string): never { redirect(`${path}?error=${encodeURIComponent(message)}`); }
function rethrowRedirect(error: any): void { if (String(error?.digest ?? "").startsWith("NEXT_REDIRECT")) throw error; }
async function actorFor(permission: string) {
  const actor = await currentUser();
  if (!actor) redirect(`/login?next=${encodeURIComponent("/knowledge")}`);
  if (!hasPermission(actor, permission)) redirect(`/access-denied?required=${encodeURIComponent(permission)}`);
  return actor;
}
function articleInput(formData: FormData, status = "DRAFT") {
  const rawHtml = value(formData, "contentHtml");
  const safe = safeArticleContent(rawHtml);
  return knowledgeArticleSchema.parse({
    title: value(formData, "title"), slug: value(formData, "slug"), summary: value(formData, "summary"), ...safe,
    area: value(formData, "area") || "INTERNAL", categoryId: value(formData, "categoryId"), subcategoryId: value(formData, "subcategoryId"),
    tags: list(formData, "tags"), clientId: value(formData, "clientId"), siteIds: list(formData, "siteIds"), visibility: value(formData, "visibility") || "INTERNAL",
    status, articleType: value(formData, "articleType") || "GUIDE", readingTimeMinutes: value(formData, "readingTimeMinutes") || "5",
    featured: checked(formData, "featured"), pinned: checked(formData, "pinned"), ownerId: value(formData, "ownerId"), reviewerIds: list(formData, "reviewerIds"),
    reviewDate: value(formData, "reviewDate"), expiryDate: value(formData, "expiryDate"), confidential: checked(formData, "confidential"), credentialReferenceIds: list(formData, "credentialReferenceIds"),
  });
}
function rejectSecrets(input: { contentHtml: string; summary?: string }, hasCredentialPermission: boolean) {
  const matches = containsPotentialSecret(`${input.summary ?? ""}\n${input.contentHtml}`);
  if (matches.length && !hasCredentialPermission) throw new Error("Potential credentials or secrets were detected. Remove them or link an approved credential reference.");
}

export async function createKnowledgeArticleAction(formData: FormData) {
  const actor = await actorFor("knowledge.articles.create");
  const path = "/knowledge/new";
  try {
    const input = articleInput(formData);
    rejectSecrets(input, hasPermission(actor, "knowledge.credential_references.view"));
    if (input.visibility === "PUBLIC" && !hasPermission(actor, "knowledge.public.manage")) throw new Error("Public publishing access is required for public articles.");
    const id = randomUUID();
    const slug = slugifyKnowledge(input.slug || input.title);
    const now = new Date();
    const snapshot = { ...input, workspaceId: knowledgeWorkspaceId, id, slug, area: input.area, authorId: actor.id, ownerId: input.ownerId || actor.id, createdBy: actor.id, updatedBy: actor.id, createdAt: now, updatedAt: now, version: 1, draftVersion: 1, publishedVersion: null, publishedSnapshot: null, searchTokens: articleSearchTokens(input.title, input.summary, input.contentText, input.tags) };
    await firestoreAdmin.runTransaction(async (transaction) => {
      const reference = await allocateKnowledgeReference(transaction, slug);
      transaction.create(firestoreAdmin.collection(collectionNames.knowledgeArticles).doc(id), { ...snapshot, articleReference: reference });
      transaction.create(firestoreAdmin.collection(collectionNames.knowledgeRevisions).doc(`${id}:1`), { ...input, workspaceId: knowledgeWorkspaceId, articleId: id, version: 1, immutable: true, contentHash: revisionHash(input), createdBy: actor.id, createdAt: now });
    });
    await recordKnowledgeActivity({ articleId: id, action: "CREATED", metadata: { version: 1 } });
    await logAudit({ userId: actor.id, action: "knowledge.article.create", entityType: "KnowledgeArticle", entityId: id, newValues: { title: input.title, visibility: input.visibility } });
    revalidatePath("/knowledge");
    redirect(`/knowledge/${id}`);
  } catch (error: any) { rethrowRedirect(error); fail(path, error?.message ?? "Unable to create article."); }
}

export async function saveKnowledgeDraftAction(formData: FormData) {
  const actor = await actorFor("knowledge.articles.update");
  const id = value(formData, "articleId");
  const path = `/knowledge/${id}/edit`;
  try {
    const article = await loadKnowledgeArticle(id);
    if (!article) throw new Error("Article not found.");
    const input = knowledgeRevisionSchema.parse({ articleId: id, title: value(formData, "title"), summary: value(formData, "summary"), contentHtml: value(formData, "contentHtml"), contentText: value(formData, "contentText") || undefined, categoryId: value(formData, "categoryId"), tags: list(formData, "tags"), visibility: value(formData, "visibility"), clientId: value(formData, "clientId"), siteIds: list(formData, "siteIds"), changeDescription: value(formData, "changeDescription") });
    const safe = safeArticleContent(input.contentHtml);
    rejectSecrets(input, hasPermission(actor, "knowledge.credential_references.view"));
    const nextVersion = Number(article.version ?? 1) + 1;
    const now = new Date();
    const update = { title: input.title, summary: input.summary, contentHtml: safe.contentHtml, contentText: safe.contentText, searchTokens: articleSearchTokens(input.title, input.summary, safe.contentText, input.tags), categoryId: input.categoryId || null, tags: input.tags, visibility: input.visibility, clientId: input.clientId || null, siteIds: input.siteIds, version: nextVersion, draftVersion: nextVersion, status: article.status === "PUBLISHED" ? "DRAFT" : "DRAFT", updatedBy: actor.id, updatedAt: now };
    await prisma.knowledgeArticle.update({ where: { id }, data: update });
    await prisma.knowledgeRevision.create({ data: { id: `${id}:${nextVersion}`, workspaceId: knowledgeWorkspaceId, articleId: id, ...update, immutable: true, contentHash: revisionHash(update), changeDescription: input.changeDescription, createdBy: actor.id, createdAt: now } });
    await recordKnowledgeActivity({ articleId: id, action: "DRAFT_SAVED", metadata: { version: nextVersion } });
    revalidatePath("/knowledge"); revalidatePath(`/knowledge/${id}`); redirect(`/knowledge/${id}`);
  } catch (error: any) { rethrowRedirect(error); fail(path, error?.message ?? "Unable to save draft."); }
}

export async function submitKnowledgeReviewAction(formData: FormData) {
  const actor = await actorFor("knowledge.articles.review"); const id = value(formData, "articleId");
  try {
    const article = await loadKnowledgeArticle(id); if (!article || !["DRAFT", "CHANGES_REQUESTED"].includes(article.status)) throw new Error("Only drafts can be submitted for review.");
    await prisma.knowledgeArticle.update({ where: { id }, data: { status: "IN_REVIEW", updatedBy: actor.id } });
    await prisma.knowledgeReview.create({ data: { id: randomUUID(), workspaceId: knowledgeWorkspaceId, articleId: id, status: "PENDING", reviewerIds: article.reviewerIds ?? [], submittedBy: actor.id, dueAt: article.reviewDate ? new Date(article.reviewDate) : new Date(Date.now() + env.KNOWLEDGE_REVIEW_REMINDER_DAYS * 86400000), createdAt: new Date() } });
    await recordKnowledgeActivity({ articleId: id, action: "SUBMITTED_FOR_REVIEW" }); revalidatePath(`/knowledge/${id}`); redirect(`/knowledge/${id}`);
  } catch (error: any) { rethrowRedirect(error); fail(`/knowledge/${id}`, error?.message ?? "Unable to submit review."); }
}

export async function decideKnowledgeReviewAction(formData: FormData) {
  const actor = await actorFor("knowledge.articles.approve"); const id = value(formData, "articleId");
  try {
    const input = knowledgeReviewDecisionSchema.parse({ articleId: id, decision: value(formData, "decision"), comment: value(formData, "comment") });
    const article = await loadKnowledgeArticle(id); if (!article || article.status !== "IN_REVIEW") throw new Error("Article is not awaiting review.");
    if (article.authorId === actor.id || article.ownerId === actor.id) throw new Error("The article owner cannot approve their own article.");
    const status = input.decision === "APPROVE" ? "APPROVED" : "CHANGES_REQUESTED";
    const review = await prisma.knowledgeReview.findFirst({ where: { workspaceId: knowledgeWorkspaceId, articleId: id, status: "PENDING" }, orderBy: [{ createdAt: "desc" }] });
    if (review) await prisma.knowledgeReview.update({ where: { id: review.id }, data: { status: input.decision === "APPROVE" ? "APPROVED" : "CHANGES_REQUESTED", decision: input.decision, decidedBy: actor.id, decidedAt: new Date() } });
    await prisma.knowledgeReviewComment.create({ data: { id: randomUUID(), workspaceId: knowledgeWorkspaceId, articleId: id, reviewId: review?.id ?? null, body: input.comment, decision: input.decision, authorId: actor.id, createdAt: new Date() } });
    await prisma.knowledgeArticle.update({ where: { id }, data: { status, updatedBy: actor.id } });
    await recordKnowledgeActivity({ articleId: id, action: `REVIEW_${input.decision}`, metadata: { comment: input.comment } }); await logAudit({ userId: actor.id, action: "knowledge.article.review", entityType: "KnowledgeArticle", entityId: id, newValues: { decision: input.decision } });
    revalidatePath(`/knowledge/${id}`); redirect(`/knowledge/${id}`);
  } catch (error: any) { rethrowRedirect(error); fail(`/knowledge/${id}/review`, error?.message ?? "Unable to record review."); }
}

export async function publishKnowledgeArticleAction(formData: FormData) {
  const actor = await actorFor("knowledge.articles.publish"); const id = value(formData, "articleId");
  try {
    const article = await loadKnowledgeArticle(id); if (!article || article.status !== "APPROVED") throw new Error("Only approved articles can be published.");
    if (article.visibility === "PUBLIC" && !hasPermission(actor, "knowledge.public.manage")) throw new Error("Public publishing access is required.");
    rejectSecrets(article, hasPermission(actor, "knowledge.credential_references.view"));
    const publishedSnapshot = articleSnapshot(article); const now = new Date();
    await prisma.knowledgeArticle.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: now, publishedVersion: article.draftVersion ?? article.version, publishedSnapshot, updatedBy: actor.id, updatedAt: now } });
    await recordKnowledgeActivity({ articleId: id, action: "PUBLISHED", metadata: { version: article.draftVersion ?? article.version } }); await logAudit({ userId: actor.id, action: "knowledge.article.publish", entityType: "KnowledgeArticle", entityId: id, newValues: { version: article.draftVersion ?? article.version } });
    revalidatePath("/knowledge"); revalidatePath(`/knowledge/${id}`); redirect(`/knowledge/${id}`);
  } catch (error: any) { rethrowRedirect(error); fail(`/knowledge/${id}`, error?.message ?? "Unable to publish article."); }
}

export async function archiveKnowledgeArticleAction(formData: FormData) {
  const actor = await actorFor("knowledge.articles.archive"); const id = value(formData, "articleId");
  const article = await loadKnowledgeArticle(id); if (!article) fail("/knowledge", "Article not found.");
  await prisma.knowledgeArticle.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date(), updatedBy: actor.id } }); await recordKnowledgeActivity({ articleId: id, action: "ARCHIVED" }); await logAudit({ userId: actor.id, action: "knowledge.article.archive", entityType: "KnowledgeArticle", entityId: id }); revalidatePath("/knowledge"); redirect("/knowledge");
}

export async function createKnowledgeCategoryAction(formData: FormData) {
  const actor = await actorFor("knowledge.categories.manage"); const input = knowledgeCategorySchema.parse({ name: value(formData, "name"), description: value(formData, "description"), icon: value(formData, "icon") || "book-open", parentId: value(formData, "parentId"), area: value(formData, "area") || "INTERNAL", sortOrder: value(formData, "sortOrder") || "0", active: checked(formData, "active") });
  const id = randomUUID(); await prisma.knowledgeCategory.create({ data: { id, workspaceId: knowledgeWorkspaceId, ...input, parentId: input.parentId || null, createdBy: actor.id } }); revalidatePath("/knowledge/categories"); redirect("/knowledge/categories");
}

export async function createKnowledgeRelationAction(formData: FormData) {
  const actor = await actorFor("knowledge.relations.manage"); const input = knowledgeRelationSchema.parse({ articleId: value(formData, "articleId"), relatedArticleId: value(formData, "relatedArticleId"), relationType: value(formData, "relationType") });
  if (input.articleId === input.relatedArticleId) fail(`/knowledge/${input.articleId}`, "An article cannot relate to itself.");
  const [article, related, existing] = await Promise.all([loadKnowledgeArticle(input.articleId), loadKnowledgeArticle(input.relatedArticleId), prisma.knowledgeRelation.findMany({ where: { workspaceId: knowledgeWorkspaceId, relationType: "PREREQUISITE" } })]);
  if (!article || !related) fail(`/knowledge/${input.articleId}`, "Both articles must exist in this workspace.");
  if (input.relationType === "PREREQUISITE" && prerequisiteWouldCycle(existing.map((entry: any) => ({ from: entry.articleId, to: entry.relatedArticleId })), input.articleId, input.relatedArticleId)) fail(`/knowledge/${input.articleId}`, "That prerequisite would create a cycle.");
  await prisma.knowledgeRelation.create({ data: { id: randomUUID(), workspaceId: knowledgeWorkspaceId, ...input, createdBy: actor.id, createdAt: new Date() } }); revalidatePath(`/knowledge/${input.articleId}`); redirect(`/knowledge/${input.articleId}`);
}

export async function submitKnowledgeFeedbackAction(formData: FormData) {
  const input = knowledgeFeedbackSchema.parse({ articleId: value(formData, "articleId"), type: value(formData, "type") || "HELPFUL", comment: value(formData, "comment"), anonymous: formData.get("anonymous") !== "false" });
  const article = await loadKnowledgeArticle(input.articleId); if (!article || article.status !== "PUBLISHED") fail("/knowledge/public", "Article not found.");
  const requestHeaders = await headers(); const ip = (requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown").slice(0, 80); const minute = Math.floor(Date.now() / 60000); const rateId = `${knowledgeWorkspaceId}:${ip}:${minute}`; const rateRef = firestoreAdmin.collection(collectionNames.knowledgeSearchEvents).doc(rateId); const rate = await rateRef.get();
  if (Number(rate.data()?.feedbackCount ?? 0) >= env.KNOWLEDGE_PUBLIC_FEEDBACK_PER_MINUTE) fail(`/knowledge/public/${article.slug}`, "Please wait before sending more feedback.");
  await rateRef.set({ workspaceId: knowledgeWorkspaceId, feedbackCount: (rate.data()?.feedbackCount ?? 0) + 1, updatedAt: new Date() }, { merge: true });
  await prisma.knowledgeFeedback.create({ data: { id: randomUUID(), workspaceId: knowledgeWorkspaceId, articleId: article.id, type: input.type, comment: input.comment, anonymous: input.anonymous, createdAt: new Date() } }); revalidatePath(`/knowledge/public/${article.slug}`); redirect(`/knowledge/public/${article.slug}?feedback=received`);
}

export async function createPolicyAcknowledgementAction(formData: FormData) {
  const actor = await actorFor("knowledge.acknowledgements.view"); const articleId = value(formData, "articleId"); const article = await loadKnowledgeArticle(articleId);
  if (!article || article.status !== "PUBLISHED" || article.articleType !== "POLICY") fail(`/knowledge/${articleId}`, "Only published policies can be acknowledged.");
  const revisionId = `${article.id}:${article.publishedVersion}`; const id = `${knowledgeWorkspaceId}:${article.id}:${article.publishedVersion}:${actor.id}`;
  const reference = firestoreAdmin.collection(collectionNames.policyAcknowledgementUniqueness).doc(id); const existing = await reference.get(); if (!existing.exists) { await reference.create({ workspaceId: knowledgeWorkspaceId, articleId, revisionId, userId: actor.id, acknowledgedAt: new Date(), status: "ACKNOWLEDGED" }); await prisma.policyAcknowledgement.create({ data: { id, workspaceId: knowledgeWorkspaceId, articleId, revisionId, userId: actor.id, status: "ACKNOWLEDGED", acknowledgedAt: new Date(), immutable: true } }); }
  revalidatePath(`/knowledge/${articleId}`); redirect(`/knowledge/${articleId}?acknowledged=1`);
}

export async function uploadKnowledgeAttachmentAction(formData: FormData) {
  const actor = await actorFor("knowledge.files.manage"); const articleId = value(formData, "articleId"); const article = await loadKnowledgeArticle(articleId); const file = formData.get("file");
  if (!article || !(file instanceof File)) fail(`/knowledge/${articleId}`, "Article or file not found.");
  const error = validateUpload({ fileName: file.name, mimeType: file.type, sizeBytes: file.size, maxBytes: env.KNOWLEDGE_ATTACHMENT_MAX_MB * 1024 * 1024 }); if (error) fail(`/knowledge/${articleId}`, error);
  const storagePath = buildKnowledgeStoragePath(knowledgeWorkspaceId, articleId, file.name); const stored = await savePrivateBinaryToStorage({ storagePath, buffer: Buffer.from(await file.arrayBuffer()), contentType: file.type || "application/octet-stream" });
  await prisma.knowledgeAttachment.create({ data: { id: randomUUID(), workspaceId: knowledgeWorkspaceId, articleId, fileName: file.name, storagePath: stored.storagePath, provider: stored.provider, contentType: file.type, sizeBytes: file.size, uploadedBy: actor.id, createdAt: new Date() } }); revalidatePath(`/knowledge/${articleId}`); redirect(`/knowledge/${articleId}`);
}

export async function createKnowledgeImportAction(formData: FormData) {
  const actor = await actorFor("knowledge.import.manage"); const input = knowledgeImportSchema.parse({ format: value(formData, "format"), sourceName: value(formData, "sourceName"), idempotencyKey: value(formData, "idempotencyKey"), content: String(formData.get("content") ?? "") });
  const id = `${knowledgeWorkspaceId}:${input.idempotencyKey}`; const existing = await prisma.knowledgeImportJob.findUnique({ where: { id } }); if (existing) redirect("/knowledge/import?imported=1");
  const title = input.sourceName.replace(/\.(md|markdown|txt|html?|csv)$/i, ""); const html = input.format === "html" ? sanitizeKnowledgeHtml(input.content) : `<p>${input.content.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replace(/\n+/g, "</p><p>")}</p>`;
  const articleId = randomUUID(); const safe = safeArticleContent(html); const now = new Date(); await prisma.knowledgeImportJob.create({ data: { id, workspaceId: knowledgeWorkspaceId, sourceName: input.sourceName, format: input.format, status: "COMPLETED", createdBy: actor.id, createdAt: now } });
  await prisma.knowledgeArticle.create({ data: { id: articleId, workspaceId: knowledgeWorkspaceId, articleReference: `IMP-${articleId.slice(0, 8).toUpperCase()}`, slug: slugifyKnowledge(title), title, summary: "Imported draft", ...safe, searchTokens: articleSearchTokens(title, "Imported draft", safe.contentText), area: "INTERNAL", visibility: "INTERNAL", status: "DRAFT", articleType: "REFERENCE", ownerId: actor.id, authorId: actor.id, version: 1, draftVersion: 1, createdBy: actor.id, updatedBy: actor.id, createdAt: now, updatedAt: now } });
  revalidatePath("/knowledge"); redirect(`/knowledge/${articleId}`);
}
