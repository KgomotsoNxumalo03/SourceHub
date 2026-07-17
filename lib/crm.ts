import type { CurrentUser } from "@/lib/permissions";

export type ClientStatus = "ACTIVE" | "ONBOARDING" | "PAUSED" | "FORMER";
export type ContractStatus = "DRAFT" | "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "ENDED";
export type ClientHealth = "EXCELLENT" | "GOOD" | "WATCH" | "RISK" | "CRITICAL" | "INACTIVE";

export type SupportAgreementLike = {
  id: string;
  workspaceId: string;
  clientId: string;
  active: boolean;
  priority: string | null;
  categoryId: string | null;
  siteId: string | null;
  supportWindow: string | null;
};

export type ContractLike = {
  id: string;
  workspaceId: string;
  clientId: string;
  status: ContractStatus | string;
  startDate: Date;
  endDate: Date | null;
  renewedAt?: Date | null;
  terminatedAt?: Date | null;
  autoRenew?: boolean;
};

export function calculateContractStatus(contract: ContractLike, now = new Date()) {
  if (contract.terminatedAt) return "ENDED" as const;
  if (contract.status === "DRAFT") return "DRAFT" as const;
  if (!contract.endDate) return "ACTIVE" as const;

  const remainingDays = Math.ceil((contract.endDate.getTime() - now.getTime()) / 86_400_000);
  if (remainingDays < 0) return "EXPIRED" as const;
  if (remainingDays <= 30) return "EXPIRING_SOON" as const;
  return "ACTIVE" as const;
}

export function calculateClientHealth({
  status,
  openTickets,
  overdueTickets,
  openBreaches,
  expiringContracts,
  portalUsers,
}: {
  status: ClientStatus;
  openTickets: number;
  overdueTickets: number;
  openBreaches: number;
  expiringContracts: number;
  portalUsers: number;
}): ClientHealth {
  if (status === "FORMER") return "INACTIVE";
  if (overdueTickets >= 5 || openBreaches >= 2) return "CRITICAL";
  if (overdueTickets >= 2 || openBreaches >= 1 || expiringContracts >= 2) return "RISK";
  if (openTickets >= 10 || expiringContracts >= 1 || portalUsers === 0) return "WATCH";
  if (openTickets > 0) return "GOOD";
  return "EXCELLENT";
}

export function clientHealthReason({
  status,
  overdueTickets,
  openBreaches,
  expiringContracts,
  portalUsers,
}: {
  status: ClientStatus;
  overdueTickets: number;
  openBreaches: number;
  expiringContracts: number;
  portalUsers: number;
}) {
  if (status === "FORMER") return "Archived client";
  if (overdueTickets >= 5 || openBreaches >= 2) return "Multiple overdue or breached tickets";
  if (overdueTickets >= 2 || openBreaches >= 1 || expiringContracts >= 2) return "Active risk indicators";
  if (portalUsers === 0) return "Portal access not yet enabled";
  if (expiringContracts >= 1) return "Contract renewal approaching";
  return "Stable engagement";
}

export function selectSupportAgreement<T extends SupportAgreementLike>(
  agreements: T[],
  ticket: { workspaceId: string; clientId: string; priority: string; categoryId: string | null; siteId: string | null },
) {
  const active = agreements.filter((agreement) => agreement.active && agreement.workspaceId === ticket.workspaceId && agreement.clientId === ticket.clientId);
  const ranked = active.map((agreement) => {
    let score = 0;
    if (!agreement.priority || agreement.priority === ticket.priority) score += agreement.priority ? 4 : 1;
    if (!agreement.categoryId || agreement.categoryId === ticket.categoryId) score += agreement.categoryId ? 3 : 1;
    if (!agreement.siteId || agreement.siteId === ticket.siteId) score += agreement.siteId ? 2 : 1;
    return { agreement, score };
  });
  ranked.sort((left, right) => right.score - left.score);
  return ranked[0]?.agreement ?? null;
}

export function canAccessClientRecord(user: CurrentUser | null | undefined, clientId: string) {
  if (!user) return false;
  if (user.permissions.includes("clients.view")) return true;
  return user.permissions.includes("portal_access.manage") && clientId.length > 0;
}

export function contractRenewalWarningDays(contract: ContractLike, now = new Date()) {
  if (!contract.endDate) return 0;
  return Math.ceil((contract.endDate.getTime() - now.getTime()) / 86_400_000);
}

