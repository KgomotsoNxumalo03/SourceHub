import Link from "next/link";

import { requirePermission } from "@/lib/auth";
import { createNetworkEnvironmentAction } from "@/lib/actions/network";
import { buttonClassName } from "@/lib/button";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { networkTypeLabels } from "@/lib/network";
import { Card, CardContent, CardHeader, CardTitle, Input, PageHeader, Select, Textarea } from "@/components/ui";

export default async function NewNetworkEnvironmentPage() {
  await requirePermission("networks.create");
  const [clients, sites, users, agreements] = await Promise.all([
    prisma.client.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, status: { not: "FORMER" } }, orderBy: { name: "asc" } }),
    prisma.clientSite.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, status: "ACTIVE" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.supportAgreement.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID }, orderBy: { name: "asc" } }),
  ]);
  return <div className="space-y-8"><PageHeader eyebrow="Network Management" title="New network environment" description="Create a scoped network record for a client site." />
    <form action={createNetworkEnvironmentAction} className="space-y-6"><Card><CardHeader><CardTitle>Identity and scope</CardTitle></CardHeader><CardContent className="grid gap-5 md:grid-cols-2">
      <div><label className="text-sm font-medium">Environment name *</label><Input name="name" required placeholder="Johannesburg office LAN" /></div>
      <div><label className="text-sm font-medium">Network type *</label><Select name="networkType" defaultValue="OFFICE_LAN" required>{Object.entries(networkTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
      <div><label className="text-sm font-medium">Client *</label><Select name="clientId" required><option value="">Choose a client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</Select></div>
      <div><label className="text-sm font-medium">Site *</label><Select name="siteId" required><option value="">Choose a site</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</Select></div>
      <div className="md:col-span-2"><label className="text-sm font-medium">Description</label><Textarea name="description" placeholder="Purpose and operating context" /></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Connectivity</CardTitle></CardHeader><CardContent className="grid gap-5 md:grid-cols-2"><div><label className="text-sm font-medium">Primary subnet</label><Input name="primarySubnet" placeholder="192.168.10.0/24" /></div><div><label className="text-sm font-medium">Additional subnets</label><Textarea name="additionalSubnets" placeholder="One subnet per line" /></div><div><label className="text-sm font-medium">Default gateway</label><Input name="defaultGateway" placeholder="192.168.10.1" /></div><div><label className="text-sm font-medium">DNS servers</label><Textarea name="dnsServers" placeholder="One server per line" /></div><div><label className="text-sm font-medium">DHCP server</label><Input name="dhcpServer" /></div><div><label className="text-sm font-medium">Domain or workgroup</label><Input name="domainOrWorkgroup" /></div><div><label className="text-sm font-medium">Internet service provider</label><Input name="internetServiceProvider" /></div><div><label className="text-sm font-medium">Connection type</label><Input name="connectionType" placeholder="Fibre, LTE, VPN" /></div><div><label className="text-sm font-medium">Router</label><Input name="router" /></div><div><label className="text-sm font-medium">Firewall</label><Input name="firewall" /></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Ownership and monitoring</CardTitle></CardHeader><CardContent className="grid gap-5 md:grid-cols-2"><div><label className="text-sm font-medium">Responsible technician</label><Select name="responsibleTechnicianId"><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>)}</Select></div><div><label className="text-sm font-medium">Support agreement</label><Select name="supportAgreementId"><option value="">Not linked</option>{agreements.map((agreement) => <option key={agreement.id} value={agreement.id}>{agreement.name}</option>)}</Select></div><div><label className="text-sm font-medium">Monitoring state</label><Select name="monitoringState" defaultValue="ACTIVE"><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="NOT_MONITORED">Not monitored</option></Select></div><div><label className="text-sm font-medium">Public IP</label><Input name="publicIpAddress" placeholder="Only where appropriate" /></div><div className="md:col-span-2"><label className="text-sm font-medium">Notes</label><Textarea name="notes" /></div></CardContent></Card>
    <div className="flex justify-end gap-3"><Link href="/network/environments" className={buttonClassName({ variant: "ghost" })}>Cancel</Link><button className={buttonClassName({ variant: "primary" })}>Create environment</button></div></form>
  </div>;
}
