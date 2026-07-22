export async function GET() {
  return Response.json({
    openapi: "3.0.3",
    info: {
      title: "SourceHub API",
      version: "v1",
      description: "Tenant-scoped API for approved SourceHub integrations. Tenant context is derived from the server-issued credential; clients cannot select another tenant with a request parameter. Commercial billing and tenant activation are sandbox-only until the readiness gate is approved.",
    },
    servers: [{ url: "/api/v1" }],
    security: [{ sourceHubApiKey: [] }],
    components: {
      securitySchemes: { sourceHubApiKey: { type: "apiKey", in: "header", name: "X-SourceHub-Api-Key", description: "One-time-issued tenant-scoped SourceHub API credential." } },
      schemas: {
        Error: { type: "object", properties: { error: { type: "string" }, correlationId: { type: "string" } } },
        Ticket: { type: "object", properties: { id: { type: "string" }, reference: { type: "string" }, subject: { type: "string" }, status: { type: "string" }, priority: { type: "string" }, clientId: { type: "string", nullable: true } } },
        Page: { type: "object", properties: { items: { type: "array", items: {} }, nextCursor: { type: "string", nullable: true }, correlationId: { type: "string" } } },
      },
    },
    paths: {
      "/tickets": {
        get: { summary: "List authorised tenant tickets", parameters: [{ name: "limit", in: "query", schema: { type: "integer", maximum: 200 } }, { name: "cursor", in: "query", schema: { type: "string" } }, { name: "status", in: "query", schema: { type: "string" } }, { name: "clientId", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Tenant-scoped ticket page", content: { "application/json": { schema: { $ref: "#/components/schemas/Page" } } } }, "401": { description: "Invalid credential" }, "403": { description: "Missing scope or tenant restriction" } } },
        post: { summary: "Create an authorised tenant ticket", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["subject"], properties: { subject: { type: "string" }, description: { type: "string" }, priority: { type: "string" }, clientId: { type: "string" }, siteId: { type: "string" } } } } } }, responses: { "201": { description: "Created ticket" }, "409": { description: "Idempotency or state conflict" } } },
      },
      "/clients": { get: { summary: "List authorised tenant clients", responses: { "200": { description: "Tenant-scoped client page" } } } },
      "/assets": { get: { summary: "List authorised tenant assets", responses: { "200": { description: "Tenant-scoped asset page" } } } },
      "/endpoints": { get: { summary: "List authorised tenant endpoints", responses: { "200": { description: "Tenant-scoped endpoint page" } } } },
      "/projects": { get: { summary: "List authorised tenant projects", responses: { "200": { description: "Tenant-scoped project page" } } } },
      "/knowledge": { get: { summary: "List published authorised tenant knowledge articles", responses: { "200": { description: "Tenant-scoped knowledge page" } } } },
    },
    externalDocs: { description: "SourceHub developer guidance", url: "/developers" },
  });
}
