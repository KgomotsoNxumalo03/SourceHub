import { Card, CardContent, CardHeader, CardTitle, EmptyState, Input, PageHeader, PaginationShell, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { parseJsonValue } from "@/lib/json";
import { listQuerySchema } from "@/lib/validators";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("audit.view");

  const query = (await searchParams) ?? {};
  const params = listQuerySchema.parse({
    page: query.page ?? 1,
    pageSize: 15,
    search: query.search ?? "",
    status: "",
    role: "",
  });

  const search = params.search.trim();
  const matchingUsers = search
    ? await prisma.user.findMany({
        where: {
          OR: [
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            { email: { contains: search } },
          ],
        },
        select: { id: true },
      })
    : [];

  const where = search
    ? {
      OR: [
          { action: { contains: search } },
          { entityType: { contains: search } },
          { entityId: { contains: search } },
          ...(matchingUsers.length > 0 ? [{ userId: { in: matchingUsers.map((entry) => entry.id) } }] : []),
        ],
      }
    : {};

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Audit logs"
        description="Review important platform events and trace administrative activity."
      />

      <Card>
        <CardHeader>
          <CardTitle>Search logs</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-4 md:grid-cols-[1fr_auto]">
            <Input name="search" defaultValue={search} placeholder="Search by action, entity, user, or identifier" />
            <button type="submit" className="hidden" />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No audit logs"
                description="Audit entries will appear here once the platform begins recording user and administrator activity."
              />
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Date</TableHeadCell>
                  <TableHeadCell>User</TableHeadCell>
                  <TableHeadCell>Action</TableHeadCell>
                  <TableHeadCell>Entity</TableHeadCell>
                  <TableHeadCell>IP</TableHeadCell>
                  <TableHeadCell>Details</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                    <TableCell>{entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : "System"}</TableCell>
                    <TableCell className="font-medium">{entry.action}</TableCell>
                    <TableCell>
                      <div>{entry.entityType}</div>
                      {entry.entityId ? <div className="text-xs text-slate-500">{entry.entityId}</div> : null}
                    </TableCell>
                    <TableCell>{entry.ipAddress ?? "—"}</TableCell>
                    <TableCell>
                      <details className="group">
                        <summary className="cursor-pointer text-sm font-medium text-sourcehub-primary">Expand</summary>
                        <pre className="mt-2 max-w-[28rem] overflow-x-auto rounded-2xl bg-sourcehub-muted p-3 text-xs text-sourcehub-text">
                          {JSON.stringify(
                            {
                              previousValues: parseJsonValue(entry.previousValues),
                              newValues: parseJsonValue(entry.newValues),
                              metadata: parseJsonValue(entry.metadata),
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PaginationShell page={params.page} totalPages={totalPages} basePath="/administration/audit-logs" query={search ? `search=${encodeURIComponent(search)}` : ""} />
    </div>
  );
}
