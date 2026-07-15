import type { CurrentUser } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";

export const ticketStatusLabels = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  WAITING_FOR_CUSTOMER: "Waiting for customer",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
} as const;

export const ticketPriorityLabels = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
} as const;

export const ticketStatusTones = {
  NEW: "info",
  IN_PROGRESS: "warning",
  WAITING_FOR_CUSTOMER: "outline",
  RESOLVED: "success",
  CLOSED: "default",
} as const;

export const ticketPriorityTones = {
  LOW: "outline",
  NORMAL: "default",
  HIGH: "warning",
  URGENT: "danger",
} as const;

export const ticketQueueLabels = {
  all: "All tickets",
  mine: "My queue",
  assigned: "Assigned to me",
  unassigned: "Unassigned",
  open: "Open work",
  waiting: "Waiting for customer",
} as const;

export const ticketStatusOptions = Object.entries(ticketStatusLabels).map(([value, label]) => ({
  value,
  label,
}));

export const ticketPriorityOptions = Object.entries(ticketPriorityLabels).map(([value, label]) => ({
  value,
  label,
}));

export const ticketQueueOptions = Object.entries(ticketQueueLabels).map(([value, label]) => ({
  value,
  label,
}));

export function ticketStatusTone(status: keyof typeof ticketStatusLabels) {
  return ticketStatusTones[status];
}

export function ticketPriorityTone(priority: keyof typeof ticketPriorityLabels) {
  return ticketPriorityTones[priority];
}

export function formatTicketReference(referenceNumber: string) {
  return referenceNumber;
}

export function canSeeAllTickets(user: CurrentUser | null | undefined) {
  return hasPermission(user, "tickets.view");
}

export function canCreateTickets(user: CurrentUser | null | undefined) {
  return hasPermission(user, "tickets.create");
}

export function canEditTickets(user: CurrentUser | null | undefined) {
  return hasPermission(user, "tickets.edit");
}

export function canAssignTickets(user: CurrentUser | null | undefined) {
  return hasPermission(user, "tickets.assign");
}

export function canCommentOnTickets(user: CurrentUser | null | undefined) {
  return hasPermission(user, "tickets.comment");
}

export function canAttachToTickets(user: CurrentUser | null | undefined) {
  return hasPermission(user, "tickets.attach");
}

export function canAccessTicketRecord(user: CurrentUser | null | undefined, ticket: { requesterId: string; assigneeId: string | null; createdById: string | null }) {
  if (!user) return false;
  if (canSeeAllTickets(user)) return true;
  return ticket.requesterId === user.id || ticket.assigneeId === user.id || ticket.createdById === user.id;
}

export function ticketScopeWhere(user: CurrentUser) {
  if (canSeeAllTickets(user)) {
    return {};
  }

  return {
    OR: [
      { requesterId: user.id },
      { assigneeId: user.id },
      { createdById: user.id },
    ],
  };
}
