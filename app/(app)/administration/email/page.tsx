import { retryEmailMessageAction, updateEmailIntegrationAction } from "@/lib/actions/email";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, PageHeader, Select, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow, Textarea } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export default async function EmailAdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("email.view");
  await requirePermission("email.manage");
  const params = (await searchParams) ?? {};
  const settings = await getSettings();
  const messages = await prisma.emailMessage.findMany({
    where: { workspaceId: env.DEFAULT_WORKSPACE_ID },
    orderBy: [{ createdAt: "desc" }],
    take: 20,
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Service Desk"
        title="Email integration"
        description="Configure the support mailbox and review inbound or outbound email processing."
      />

      {params.updated ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Email configuration saved.</div> : null}
      {params.retried ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Message queued for retry.</div> : null}
      {params.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{String(params.error)}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Mailbox settings</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateEmailIntegrationAction} className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="supportAddress">Support address</label>
              <Input id="supportAddress" name="supportAddress" type="email" defaultValue={settings.emailIntegration.supportAddress} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="provider">Provider</label>
              <Select id="provider" name="provider" defaultValue={settings.emailIntegration.provider}>
                <option value="dev">Development adapter</option>
                <option value="imap">IMAP mailbox</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="imapHost">IMAP host</label>
              <Input id="imapHost" name="imapHost" defaultValue={settings.emailIntegration.imapHost} placeholder="imap.example.com" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="imapPort">IMAP port</label>
              <Input id="imapPort" name="imapPort" type="number" defaultValue={Number(settings.emailIntegration.imapPort)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="imapUsername">IMAP username</label>
              <Input id="imapUsername" name="imapUsername" defaultValue={settings.emailIntegration.imapUsername} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="secure">Secure connection</label>
              <Select id="secure" name="secure" defaultValue={settings.emailIntegration.secure}>
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </Select>
            </div>
            <div className="xl:col-span-2 rounded-2xl border border-sourcehub-border bg-sourcehub-muted/40 p-4 text-sm text-slate-600">
              <p className="font-semibold text-sourcehub-text">Safe development adapter</p>
              <p className="mt-1">When mailbox credentials are unavailable, SourceHub can still ingest staged email records from the emulator or a local dev adapter.</p>
            </div>
            <div className="xl:col-span-2">
              <Button type="submit">Save email settings</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent email messages</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {messages.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No processed mail" description="Inbound and outbound message records will appear here after the email pipeline runs." />
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Subject</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                  <TableHeadCell>Attempts</TableHeadCell>
                  <TableHeadCell>Created</TableHeadCell>
                  <TableHeadCell>Action</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {messages.map((message) => (
                  <TableRow key={message.id}>
                    <TableCell>
                      <p className="font-medium text-sourcehub-text">{message.subject}</p>
                      <p className="mt-1 text-xs text-slate-500">{message.sender}</p>
                    </TableCell>
                    <TableCell>
                      <Badge tone={message.processingStatus === "FAILED" ? "danger" : message.processingStatus === "PENDING" ? "warning" : "success"}>
                        {message.processingStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>{message.attemptCount ?? 0}</TableCell>
                    <TableCell>{formatDateTime(message.createdAt)}</TableCell>
                    <TableCell>
                      {message.processingStatus === "FAILED" ? (
                        <form action={retryEmailMessageAction}>
                          <input type="hidden" name="id" value={message.id} />
                          <Button type="submit" variant="outline" size="sm">
                            Retry
                          </Button>
                        </form>
                      ) : (
                        <span className="text-sm text-slate-400">No action</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
