import Link from "next/link";
import { notFound } from "next/navigation";

import {
  archiveClientAction,
  createBillingProfileAction,
  createClientNoteAction,
  createContactAction,
  createContractAction,
  createPortalInvitationAction,
  createSiteAction,
  createSupportAgreementAction,
  restoreClientAction,
  updateClientAction,
  uploadClientFileAction,
} from "@/lib/actions/clients";
import { buttonClassName } from "@/lib/button";
import { AiContextLink } from "@/components/ai-context-link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, PageHeader, Select, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow, Textarea } from "@/components/ui";
import { calculateClientHealth, clientHealthReason, calculateContractStatus } from "@/lib/crm";
import { formatDate, formatDateTime } from "@/lib/utils";

const statusTone: Record<string, "success" | "warning" | "danger" | "info"> = {
  ACTIVE: "success",
  ONBOARDING: "info",
  PAUSED: "warning",
  FORMER: "danger",
};

const healthTone: Record<string, "success" | "warning" | "danger" | "info" | "outline"> = {
  EXCELLENT: "success",
  GOOD: "info",
  WATCH: "warning",
  RISK: "danger",
  CRITICAL: "danger",
  INACTIVE: "outline",
};

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [actor, { id }] = await Promise.all([requirePermission("clients.view"), params]);

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      contacts: true,
      sites: true,
      contracts: true,
      supportAgreements: true,
      billingProfiles: true,
      notes: true,
      files: true,
      portalInvitations: true,
    },
  });

  if (!client || client.workspaceId !== env.DEFAULT_WORKSPACE_ID) {
    notFound();
  }

  const [openTickets, overdueTickets, breachedTickets, expiringContracts, portalUsers, policyCount] = await Promise.all([
    prisma.ticket.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, clientId: client.id, status: { in: ["NEW", "IN_PROGRESS", "WAITING_FOR_CUSTOMER"] } } }),
    prisma.ticket.count({
      where: {
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        clientId: client.id,
        status: { in: ["NEW", "IN_PROGRESS", "WAITING_FOR_CUSTOMER"] },
        resolutionDueAt: { lt: new Date() },
      },
    }),
    prisma.ticket.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, clientId: client.id, slaState: "BREACHED" } }),
    prisma.contract.count({
      where: {
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        clientId: client.id,
        endDate: { gte: new Date(), lte: new Date(Date.now() + 30 * 86_400_000) },
      },
    }),
    prisma.portalAccount.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, clientId: client.id } }),
    prisma.slaPolicy.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, OR: [{ clientId: client.id }, { clientId: null }] } }),
  ]);

  const health = calculateClientHealth({
    status: client.status,
    openTickets,
    overdueTickets,
    openBreaches: breachedTickets,
    expiringContracts,
    portalUsers,
  });

  const latestContract = client.contracts.sort((left, right) => (right.endDate?.getTime() ?? 0) - (left.endDate?.getTime() ?? 0))[0] ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Clients & CRM"
        title={client.name}
        description={client.legalName ?? client.code}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <AiContextLink module="clients" type="client" id={client.id} enabled={actor.permissions.includes("ai.use") && actor.permissions.includes("ai.clients.use")} />
            <Link href="/clients" className={buttonClassName({ variant: "outline" })}>
              Back to clients
            </Link>
            {client.status === "FORMER" ? (
              <form action={restoreClientAction}>
                <input type="hidden" name="id" value={client.id} />
                <Button type="submit" variant="secondary">Restore</Button>
              </form>
            ) : (
              <form action={archiveClientAction}>
                <input type="hidden" name="id" value={client.id} />
                <Button type="submit" variant="danger">Archive</Button>
              </form>
            )}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Badge tone={statusTone[client.status] ?? "info"}>{client.status}</Badge>
        <Badge tone={healthTone[health] ?? "info"}>{health}</Badge>
        <Badge tone="outline">{client.contacts.length} contacts</Badge>
        <Badge tone="outline">{client.sites.length} sites</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-slate-500">Open tickets</p><p className="mt-1 text-3xl font-bold text-sourcehub-text">{openTickets}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-slate-500">Overdue</p><p className="mt-1 text-3xl font-bold text-sourcehub-text">{overdueTickets}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-slate-500">Breached</p><p className="mt-1 text-3xl font-bold text-sourcehub-text">{breachedTickets}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-slate-500">Portal users</p><p className="mt-1 text-3xl font-bold text-sourcehub-text">{portalUsers}</p></CardContent></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Edit client</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateClientAction} className="space-y-4">
              <input type="hidden" name="id" value={client.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text">Client name</label>
                  <Input name="name" defaultValue={client.name} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text">Client code</label>
                  <Input name="code" defaultValue={client.code} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text">Legal name</label>
                  <Input name="legalName" defaultValue={client.legalName ?? ""} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text">Status</label>
                  <Select name="status" defaultValue={client.status}>
                    <option value="ACTIVE">Active</option>
                    <option value="ONBOARDING">Onboarding</option>
                    <option value="PAUSED">Paused</option>
                    <option value="FORMER">Former</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text">Website</label>
                  <Input name="website" defaultValue={client.website ?? ""} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text">Support email</label>
                  <Input name="supportEmail" defaultValue={client.supportEmail ?? ""} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text">Phone</label>
                  <Input name="phone" defaultValue={client.phone ?? ""} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text">Industry</label>
                  <Input name="industry" defaultValue={client.industry ?? ""} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-sourcehub-text">Account manager user ID</label>
                  <Input name="accountManagerId" defaultValue={client.accountManagerId ?? ""} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit">Save client</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Client snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <div className="rounded-2xl bg-sourcehub-muted p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Client health</p>
              <p className="mt-1 text-lg font-semibold text-sourcehub-text">{health}</p>
              <p className="mt-1">{clientHealthReason({ status: client.status, overdueTickets, openBreaches: breachedTickets, expiringContracts, portalUsers })}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-sourcehub-muted p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Latest contract</p>
                <p className="mt-1 font-medium text-sourcehub-text">{latestContract ? latestContract.name : "None"}</p>
                <p className="mt-1 text-xs text-slate-500">{latestContract?.endDate ? formatDate(latestContract.endDate) : "No expiry set"}</p>
              </div>
              <div className="rounded-2xl bg-sourcehub-muted p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">SLA policies</p>
                <p className="mt-1 font-medium text-sourcehub-text">{policyCount}</p>
                <p className="mt-1 text-xs text-slate-500">Policies available to this workspace</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-sourcehub-muted p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Updated</p>
                <p className="mt-1 font-medium text-sourcehub-text">{formatDateTime(client.updatedAt)}</p>
              </div>
              <div className="rounded-2xl bg-sourcehub-muted p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Created</p>
                <p className="mt-1 font-medium text-sourcehub-text">{formatDateTime(client.createdAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Contacts</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form action={createContactAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="clientId" value={client.id} />
              <Input name="firstName" placeholder="First name" />
              <Input name="lastName" placeholder="Last name" />
              <Input name="email" type="email" placeholder="email@example.com" />
              <Input name="phone" placeholder="Phone" />
              <Input name="title" placeholder="Job title" />
              <div className="flex items-end gap-2">
                <Select name="isPrimary" defaultValue="false"><option value="false">Secondary</option><option value="true">Primary</option></Select>
                <Select name="portalAccess" defaultValue="false"><option value="false">No portal</option><option value="true">Portal access</option></Select>
                <Button type="submit" variant="secondary">Add contact</Button>
              </div>
            </form>
            {client.contacts.length === 0 ? (
              <EmptyState title="No contacts" description="Add the first contact for this client." />
            ) : (
              <Table>
                <TableHead><TableRow><TableHeadCell>Name</TableHeadCell><TableHeadCell>Email</TableHeadCell><TableHeadCell>Portal</TableHeadCell></TableRow></TableHead>
                <TableBody>
                  {client.contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell>{contact.firstName} {contact.lastName}</TableCell>
                      <TableCell>{contact.email}</TableCell>
                      <TableCell><Badge tone={contact.portalAccess ? "success" : "outline"}>{contact.portalAccess ? "Enabled" : "Disabled"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sites</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form action={createSiteAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="clientId" value={client.id} />
              <Input name="name" placeholder="Site name" />
              <Input name="code" placeholder="Site code" />
              <Input name="city" placeholder="City" />
              <Input name="province" placeholder="Province" />
              <Input name="country" placeholder="Country" />
              <Input name="addressLine1" placeholder="Address line 1" />
              <Input name="addressLine2" placeholder="Address line 2" />
              <Input name="postalCode" placeholder="Postal code" />
              <div className="flex items-end">
                <Button type="submit" variant="secondary">Add site</Button>
              </div>
            </form>
            {client.sites.length === 0 ? (
              <EmptyState title="No sites" description="Add the first site for this client." />
            ) : (
              <Table>
                <TableHead><TableRow><TableHeadCell>Site</TableHeadCell><TableHeadCell>Location</TableHeadCell><TableHeadCell>Primary</TableHeadCell></TableRow></TableHead>
                <TableBody>
                  {client.sites.map((site) => (
                    <TableRow key={site.id}>
                      <TableCell>{site.name}</TableCell>
                      <TableCell>{[site.city, site.province, site.country].filter(Boolean).join(", ")}</TableCell>
                      <TableCell><Badge tone={site.isPrimary ? "success" : "outline"}>{site.isPrimary ? "Yes" : "No"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Contracts</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form action={createContractAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="clientId" value={client.id} />
              <Input name="name" placeholder="Contract name" />
              <Select name="status" defaultValue="ACTIVE">
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="EXPIRING_SOON">Expiring soon</option>
                <option value="EXPIRED">Expired</option>
                <option value="ENDED">Ended</option>
              </Select>
              <Input name="startDate" type="date" />
              <Input name="endDate" type="date" />
              <Input name="value" placeholder="Contract value" />
              <Select name="autoRenew" defaultValue="false"><option value="false">No auto-renew</option><option value="true">Auto-renew</option></Select>
              <div className="flex items-end">
                <Button type="submit" variant="secondary">Add contract</Button>
              </div>
            </form>
            {client.contracts.length === 0 ? (
              <EmptyState title="No contracts" description="Add the first contract for this client." />
            ) : (
              <Table>
                <TableHead><TableRow><TableHeadCell>Name</TableHeadCell><TableHeadCell>Status</TableHeadCell><TableHeadCell>Ends</TableHeadCell></TableRow></TableHead>
                <TableBody>
                  {client.contracts.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell>{contract.name}</TableCell>
                      <TableCell><Badge tone={contract.status === "EXPIRED" || contract.status === "ENDED" ? "danger" : contract.status === "EXPIRING_SOON" ? "warning" : "success"}>{calculateContractStatus(contract)}</Badge></TableCell>
                      <TableCell>{contract.endDate ? formatDate(contract.endDate) : "No expiry"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Support agreements</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form action={createSupportAgreementAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="clientId" value={client.id} />
              <Input name="name" placeholder="Agreement name" />
              <Select name="priority" defaultValue=""><option value="">Any priority</option><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></Select>
              <Input name="categoryId" placeholder="Category ID" />
              <Input name="siteId" placeholder="Site ID" />
              <Input name="supportWindow" placeholder="Mon-Fri 08:00-17:00" />
              <Select name="active" defaultValue="true"><option value="true">Active</option><option value="false">Inactive</option></Select>
              <div className="flex items-end">
                <Button type="submit" variant="secondary">Add agreement</Button>
              </div>
            </form>
            {client.supportAgreements.length === 0 ? (
              <EmptyState title="No agreements" description="Add support agreements to drive SLA selection." />
            ) : (
              <Table>
                <TableHead><TableRow><TableHeadCell>Name</TableHeadCell><TableHeadCell>Status</TableHeadCell><TableHeadCell>Scope</TableHeadCell></TableRow></TableHead>
                <TableBody>
                  {client.supportAgreements.map((agreement) => (
                    <TableRow key={agreement.id}>
                      <TableCell>{agreement.name}</TableCell>
                      <TableCell><Badge tone={agreement.active ? "success" : "outline"}>{agreement.active ? "Active" : "Inactive"}</Badge></TableCell>
                      <TableCell>{agreement.priority ?? "Any priority"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Billing profiles</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form action={createBillingProfileAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="clientId" value={client.id} />
              <Input name="legalName" placeholder="Legal billing name" />
              <Input name="taxNumber" placeholder="Tax number" />
              <Input name="invoiceEmail" type="email" placeholder="billing@example.com" />
              <Select name="billingCycle" defaultValue="MONTHLY"><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUALLY">Annually</option></Select>
              <Input name="creditTerms" type="number" defaultValue={30} />
              <div className="flex items-end">
                <Button type="submit" variant="secondary">Add billing profile</Button>
              </div>
            </form>
            {client.billingProfiles.length === 0 ? (
              <EmptyState title="No billing profiles" description="Add billing details for this client." />
            ) : (
              <Table>
                <TableHead><TableRow><TableHeadCell>Legal name</TableHeadCell><TableHeadCell>Invoice email</TableHeadCell></TableRow></TableHead>
                <TableBody>
                  {client.billingProfiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell>{profile.legalName}</TableCell>
                      <TableCell>{profile.invoiceEmail ?? "Not set"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Client notes</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form action={createClientNoteAction} className="space-y-3">
              <input type="hidden" name="clientId" value={client.id} />
              <Textarea name="body" placeholder="Add internal context, onboarding notes, or risk flags." />
              <Select name="visibility" defaultValue="internal"><option value="internal">Internal</option><option value="shared">Shared</option></Select>
              <Button type="submit" variant="secondary">Add note</Button>
            </form>
            {client.notes.length === 0 ? (
              <EmptyState title="No notes" description="Capture account context for the team here." />
            ) : (
              <div className="space-y-3">
                {client.notes.map((note) => (
                  <div key={note.id} className="rounded-2xl border border-sourcehub-border p-4">
                    <div className="flex items-center gap-2">
                      <Badge tone={note.visibility === "shared" ? "info" : "outline"}>{note.visibility}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-sourcehub-text">{note.body}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Client files</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form action={uploadClientFileAction} encType="multipart/form-data" className="space-y-3">
              <input type="hidden" name="clientId" value={client.id} />
              <Input name="file" type="file" className="py-2" />
              <Button type="submit" variant="secondary">Upload file</Button>
            </form>
            {client.files.length === 0 ? (
              <EmptyState title="No files" description="Upload contracts, signed documents, and supporting files here." />
            ) : (
              <Table>
                <TableHead><TableRow><TableHeadCell>File</TableHeadCell><TableHeadCell>Type</TableHeadCell><TableHeadCell>Uploaded</TableHeadCell></TableRow></TableHead>
                <TableBody>
                  {client.files.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell>{file.originalName}</TableCell>
                      <TableCell>{file.mimeType}</TableCell>
                      <TableCell>{formatDateTime(file.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Portal invitations</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form action={createPortalInvitationAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="clientId" value={client.id} />
              <Input name="contactId" placeholder="Contact ID" />
              <Select name="role" defaultValue="REQUESTER">
                <option value="REQUESTER">Requester</option>
                <option value="APPROVER">Approver</option>
                <option value="BILLING">Billing</option>
                <option value="ADMIN">Admin</option>
              </Select>
              <div className="flex items-end">
                <Button type="submit" variant="secondary">Invite contact</Button>
              </div>
            </form>
            {client.portalInvitations.length === 0 ? (
              <EmptyState title="No invitations" description="Invite contacts to the portal when they are ready." />
            ) : (
              <Table>
                <TableHead><TableRow><TableHeadCell>Contact</TableHeadCell><TableHeadCell>Status</TableHeadCell><TableHeadCell>Expires</TableHeadCell></TableRow></TableHead>
                <TableBody>
                  {client.portalInvitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell>{invitation.contactId}</TableCell>
                      <TableCell>{invitation.status}</TableCell>
                      <TableCell>{formatDateTime(invitation.expiresAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
