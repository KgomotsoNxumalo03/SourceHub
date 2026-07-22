export type KnowledgeActor = {
  id?: string;
  permissions?: string[];
  clientId?: string | null;
  portal?: boolean;
};

const allowedTags = new Set([
  "p", "br", "strong", "em", "u", "h1", "h2", "h3", "h4", "ul", "ol", "li",
  "blockquote", "pre", "code", "table", "thead", "tbody", "tr", "th", "td", "hr",
  "a", "img", "span", "div",
]);
const allowedAttributes = new Set(["href", "src", "alt", "title", "target", "rel"]);

function safeUrl(value: string, allowImages = false) {
  try {
    const parsed = new URL(value, "https://sourcehub.invalid");
    if (!/^https?:$|^mailto:$/.test(parsed.protocol)) return false;
    if (parsed.protocol === "mailto:") return true;
    if (allowImages && parsed.protocol === "https:") return true;
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function sanitizeKnowledgeHtml(input: string) {
  let html = String(input ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|meta|link|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|meta|link|base)[^>]*\/?>/gi, "");

  html = html.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (full, rawTag: string, rawAttributes: string) => {
    const tag = rawTag.toLowerCase();
    if (!allowedTags.has(tag)) return full.startsWith("</") ? "" : "";
    if (full.startsWith("</")) return `</${tag}>`;
    if (tag === "br" || tag === "hr") return `<${tag}>`;
    const attributes: string[] = [];
    rawAttributes.replace(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g, (_match: string, name: string, doubleValue: string, singleValue: string, bareValue: string) => {
      const lowerName = name.toLowerCase();
      if (!allowedAttributes.has(lowerName)) return "";
      const value = doubleValue ?? singleValue ?? bareValue ?? "";
      if ((lowerName === "href" && !safeUrl(value)) || (lowerName === "src" && !safeUrl(value, true))) return "";
      if (lowerName === "target" && !["_blank", "_self"].includes(value)) return "";
      attributes.push(`${lowerName}="${value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`);
      return "";
    });
    if (tag === "a" && attributes.some((attribute) => attribute.startsWith('target="_blank"'))) attributes.push('rel="noopener noreferrer"');
    return `<${tag}${attributes.length ? ` ${attributes.join(" ")}` : ""}>`;
  });

  return html.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

export function knowledgePlainTextFromHtml(html: string) {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsPotentialSecret(input: string) {
  const patterns = [
    /(?:password|passwd|pwd)\s*[:=]/i,
    /(?:api[_ -]?key|secret[_ -]?key|access[_ -]?token)\s*[:=]/i,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    /firebase[_ -]?service[_ -]?account/i,
    /\b(?:ghp|github_pat|sk|xoxb|xoxp|AKIA)[_-][A-Za-z0-9_-]{8,}/,
    /(?:vpn|wireguard|pre[- ]shared)\s+key\s*[:=]/i,
  ];
  return patterns.filter((pattern) => pattern.test(input)).map((pattern) => pattern.source);
}

export function slugifyKnowledge(input: string) {
  return String(input ?? "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160) || "article";
}

export function articleSearchTokens(title: string, summary: string, text: string, tags: string[] = []) {
  const words = `${title} ${summary} ${text} ${tags.join(" ")}`.toLowerCase().match(/[a-z0-9][a-z0-9-]{1,39}/g) ?? [];
  return Array.from(new Set(words)).slice(0, 250);
}

export function prerequisiteWouldCycle(edges: Array<{ from: string; to: string }>, source: string, target: string) {
  if (source === target) return true;
  const graph = new Map<string, string[]>();
  for (const edge of edges) graph.set(edge.from, [...(graph.get(edge.from) ?? []), edge.to]);
  graph.set(source, [...(graph.get(source) ?? []), target]);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(node: string): boolean {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const child of graph.get(node) ?? []) if (visit(child)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  }
  return visit(source);
}

function privateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".local") || host === "::1" || host === "127.0.0.1" || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.startsWith("169.254.");
}

export function safeKnowledgeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !privateHost(url.hostname);
  } catch {
    return false;
  }
}

export function canAccessKnowledgeArticle(article: { status: string; visibility: string; clientId?: string | null }, actor?: KnowledgeActor | null, portalClientId?: string | null) {
  if (article.status !== "PUBLISHED") return false;
  if (article.visibility === "PUBLIC") return true;
  if (!portalClientId && !actor?.permissions?.includes("knowledge.internal.view")) return false;
  const clientId = portalClientId ?? actor?.clientId;
  return article.visibility === "CLIENT" && Boolean(clientId && article.clientId === clientId);
}

export function knowledgeStatusTone(status: string): "success" | "warning" | "danger" | "info" | "outline" {
  if (status === "PUBLISHED" || status === "APPROVED") return "success";
  if (status === "EXPIRED" || status === "ARCHIVED") return "danger";
  if (status === "IN_REVIEW" || status === "CHANGES_REQUESTED") return "warning";
  return "outline";
}
