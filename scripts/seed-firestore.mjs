import { createHash } from "node:crypto";
import { env } from "../lib/env.ts";
import { firestoreAdmin } from "../lib/db.ts";
import { collectionNames } from "../lib/collections.ts";
import { assetQrcodeValue, assetSearchTokens, builtInAssetTypes, calculateWarrantyStatus } from "../lib/assets.ts";

const workspaceId = env.DEFAULT_WORKSPACE_ID;
const now = new Date();

async function upsert(collection, id, data) {
  await firestoreAdmin.collection(collection).doc(id).set(
    {
      ...data,
      updatedAt: now,
      createdAt: data.createdAt ?? now,
    },
    { merge: true },
  );
}

async function findUserIdByEmail(email) {
  const snapshot = await firestoreAdmin.collection(collectionNames.users).where("email", "==", email.toLowerCase()).limit(1).get();
  return snapshot.empty ? null : snapshot.docs[0].id;
}

async function main() {
  const adminId = (await findUserIdByEmail(env.DEV_ADMIN_EMAIL)) ?? null;
  if (!adminId) {
    throw new Error("Development admin account is missing. Run the superuser seed first.");
  }

  await upsert(collectionNames.workspaces, workspaceId, {
    id: workspaceId,
    name: env.DEFAULT_WORKSPACE_NAME,
    companyName: env.DEFAULT_COMPANY_NAME,
    tradingName: env.DEFAULT_TRADING_NAME,
    supportEmail: env.DEFAULT_SUPPORT_EMAIL,
    contactNumber: env.DEFAULT_CONTACT_NUMBER,
    website: env.DEFAULT_WEBSITE,
    timezone: env.DEFAULT_TIMEZONE,
    country: env.DEFAULT_COUNTRY,
    defaultDateFormat: env.DEFAULT_DATE_FORMAT,
  });

  const ticketCategories = [
    ["hardware", "Hardware", "Physical device or peripheral issue"],
    ["software", "Software", "Application, OS, or licensing issue"],
    ["network", "Network", "Connectivity or Wi-Fi issue"],
    ["access", "Access", "Permission or account access issue"],
    ["billing", "Billing", "Invoice or commercial issue"],
    ["security", "Security", "Security incident or request"],
  ];

  for (const [id, name, description] of ticketCategories) {
    await upsert(collectionNames.ticketCategories, id, {
      id,
      workspaceId,
      name,
      description,
      isActive: true,
      createdById: adminId,
      updatedById: adminId,
    });
  }

  await upsert(collectionNames.businessHours, "default-hours", {
    id: "default-hours",
    workspaceId,
    name: "Standard business hours",
    timezone: env.DEFAULT_TIMEZONE,
    start: env.DEFAULT_BUSINESS_START_TIME,
    end: env.DEFAULT_BUSINESS_END_TIME,
    workingDays: ["mon", "tue", "wed", "thu", "fri"],
    isDefault: true,
    createdById: adminId,
    updatedById: adminId,
  });

  const holidays = [
    ["2026-01-01", "New Year"],
    ["2026-03-21", "Human Rights Day"],
    ["2026-04-03", "Good Friday"],
    ["2026-04-06", "Family Day"],
    ["2026-06-16", "Youth Day"],
    ["2026-08-09", "National Women's Day"],
    ["2026-09-24", "Heritage Day"],
    ["2026-12-16", "Day of Reconciliation"],
    ["2026-12-25", "Christmas Day"],
    ["2026-12-26", "Day of Goodwill"],
  ];

  for (const [date, name] of holidays) {
    await upsert(collectionNames.publicHolidays, date, {
      id: date,
      workspaceId,
      name,
      date,
      createdById: adminId,
      updatedById: adminId,
    });
  }

  const clients = [
    {
      id: "acme-holdings",
      name: "Acme Holdings",
      legalName: "Acme Holdings (Pty) Ltd",
      code: "ACME",
      status: "ACTIVE",
      website: "https://acme.example.com",
      supportEmail: "help@acme.example.com",
      phone: "+27 11 555 2100",
      industry: "Financial Services",
    },
    {
      id: "blue-river",
      name: "Blue River Logistics",
      legalName: "Blue River Logistics (Pty) Ltd",
      code: "BRL",
      status: "ACTIVE",
      website: "https://blueriver.example.com",
      supportEmail: "support@blueriver.example.com",
      phone: "+27 11 555 2200",
      industry: "Logistics",
    },
    {
      id: "orbital-retail",
      name: "Orbital Retail",
      legalName: "Orbital Retail Group",
      code: "ORB",
      status: "ONBOARDING",
      website: "https://orbital.example.com",
      supportEmail: "it@orbital.example.com",
      phone: "+27 21 555 2300",
      industry: "Retail",
    },
    {
      id: "northstar-health",
      name: "Northstar Health",
      legalName: "Northstar Health Services",
      code: "NSH",
      status: "PAUSED",
      website: "https://northstar.example.com",
      supportEmail: "support@northstar.example.com",
      phone: "+27 31 555 2400",
      industry: "Healthcare",
    },
    {
      id: "legacy-corp",
      name: "Legacy Corp",
      legalName: "Legacy Corp (Pty) Ltd",
      code: "LEG",
      status: "FORMER",
      website: "https://legacy.example.com",
      supportEmail: "help@legacy.example.com",
      phone: "+27 11 555 2500",
      industry: "Manufacturing",
    },
  ];

  for (const client of clients) {
    await upsert(collectionNames.clients, client.id, {
      ...client,
      workspaceId,
      accountManagerId: adminId,
      archivedAt: client.status === "FORMER" ? now : null,
      createdById: adminId,
      updatedById: adminId,
    });
  }

  const sites = [
    ["acme-holdings-jhb", "acme-holdings", "Johannesburg HQ", "JHB-HQ", "Johannesburg", "Gauteng", "South Africa"],
    ["acme-holdings-cpt", "acme-holdings", "Cape Town Office", "CPT-OPS", "Cape Town", "Western Cape", "South Africa"],
    ["blue-river-jhb", "blue-river", "Johannesburg Depot", "BR-JHB", "Johannesburg", "Gauteng", "South Africa"],
    ["blue-river-dbn", "blue-river", "Durban Harbour", "BR-DBN", "Durban", "KwaZulu-Natal", "South Africa"],
    ["orbital-retail-jhb", "orbital-retail", "Johannesburg Head Office", "ORB-HQ", "Johannesburg", "Gauteng", "South Africa"],
    ["orbital-retail-cpt", "orbital-retail", "Cape Town Distribution", "ORB-CPT", "Cape Town", "Western Cape", "South Africa"],
    ["northstar-health-dbn", "northstar-health", "Durban Clinic", "NSH-DBN", "Durban", "KwaZulu-Natal", "South Africa"],
    ["legacy-corp-jhb", "legacy-corp", "Legacy Johannesburg", "LEG-JHB", "Johannesburg", "Gauteng", "South Africa"],
  ];

  for (const [id, clientId, name, code, city, province, country] of sites) {
    await upsert(collectionNames.clientSites, id, {
      id,
      workspaceId,
      clientId,
      name,
      code,
      city,
      province,
      country,
      addressLine1: `${name}, SourceHub Business Park`,
      addressLine2: null,
      postalCode: "2000",
      isPrimary: code.endsWith("HQ"),
      createdById: adminId,
      updatedById: adminId,
    });
  }

  const contacts = [
    ["acme-cio", "acme-holdings", "Mpho", "Molefe", "mpho.molefe@acme.example.com", "Technology Lead", "+27 11 555 2101", true],
    ["acme-billing", "acme-holdings", "Zanele", "Mokoena", "zanele.mokoena@acme.example.com", "Accounts Payable", "+27 11 555 2102", false],
    ["blue-river-it", "blue-river", "Thabo", "Ndlovu", "thabo.ndlovu@blueriver.example.com", "IT Manager", "+27 11 555 2201", true],
    ["orbital-it", "orbital-retail", "Naledi", "Radebe", "naledi.radebe@orbital.example.com", "Systems Coordinator", "+27 21 555 2301", true],
    ["northstar-admin", "northstar-health", "Sipho", "Khumalo", "sipho.khumalo@northstar.example.com", "Operations Manager", "+27 31 555 2401", true],
  ];

  for (const [id, clientId, firstName, lastName, email, title, phone, portalAccess] of contacts) {
    await upsert(collectionNames.clientContacts, id, {
      id,
      workspaceId,
      clientId,
      firstName,
      lastName,
      email,
      phone,
      title,
      isPrimary: portalAccess,
      portalAccess,
      createdById: adminId,
      updatedById: adminId,
    });
  }

  const billingProfiles = [
    ["acme-billing", "acme-holdings", "Acme Holdings (Pty) Ltd", "TAX-ACME-001", "billing@acme.example.com", "MONTHLY", 30],
    ["blue-river-billing", "blue-river", "Blue River Logistics (Pty) Ltd", "TAX-BRL-002", "billing@blueriver.example.com", "MONTHLY", 30],
    ["orbital-billing", "orbital-retail", "Orbital Retail Group", "TAX-ORB-003", "finance@orbital.example.com", "QUARTERLY", 45],
  ];

  for (const [id, clientId, legalName, taxNumber, invoiceEmail, billingCycle, creditTerms] of billingProfiles) {
    await upsert(collectionNames.billingProfiles, id, {
      id,
      workspaceId,
      clientId,
      legalName,
      taxNumber,
      invoiceEmail,
      billingCycle,
      creditTerms,
      createdById: adminId,
      updatedById: adminId,
    });
  }

  const contracts = [
    ["acme-contract", "acme-holdings", "Acme Managed Services 2026", "ACTIVE", "2026-01-01", "2026-12-31", true],
    ["blue-river-contract", "blue-river", "Blue River Support 2026", "ACTIVE", "2026-02-01", "2026-11-30", true],
    ["orbital-contract", "orbital-retail", "Orbital Onboarding", "DRAFT", "2026-07-01", "2027-06-30", false],
    ["northstar-contract", "northstar-health", "Northstar Support Renewal", "EXPIRING_SOON", "2025-08-01", "2026-08-31", true],
  ];

  for (const [id, clientId, name, status, startDate, endDate, autoRenew] of contracts) {
    await upsert(collectionNames.contracts, id, {
      id,
      workspaceId,
      clientId,
      name,
      status,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      autoRenew,
      value: "450000",
      createdById: adminId,
      updatedById: adminId,
    });
  }

  const supportAgreements = [
    ["acme-standard", "acme-holdings", "Standard Managed Support", true, "NORMAL", "network", "acme-holdings-jhb", "Mon-Fri 08:00-17:00"],
    ["acme-premium", "acme-holdings", "Premium Critical Support", true, "URGENT", "security", "acme-holdings-jhb", "24/7"],
    ["blue-river-standard", "blue-river", "Logistics Support", true, "HIGH", "software", "blue-river-jhb", "Mon-Fri 07:00-19:00"],
    ["orbital-onboarding", "orbital-retail", "Retail Onboarding Support", true, "NORMAL", "access", "orbital-retail-jhb", "Mon-Fri 08:00-17:00"],
  ];

  for (const [id, clientId, name, active, priority, categoryId, siteId, supportWindow] of supportAgreements) {
    await upsert(collectionNames.supportAgreements, id, {
      id,
      workspaceId,
      clientId,
      name,
      active,
      priority,
      categoryId,
      siteId,
      supportWindow,
      createdById: adminId,
      updatedById: adminId,
    });
  }

  const slaPolicies = [
    ["standard-support", null, null, "NORMAL", null, "Standard Support", 60, 480, "08:00", "17:00"],
    ["critical-support", "acme-holdings", "acme-premium", "URGENT", "security", "Critical Security Support", 15, 180, "00:00", "23:59"],
    ["onboarding-support", "orbital-retail", "orbital-onboarding", "NORMAL", "access", "Retail Onboarding", 30, 240, "08:00", "17:00"],
  ];

  for (const [id, clientId, supportAgreementId, priority, categoryId, name, firstResponseMinutes, resolutionMinutes, start, end] of slaPolicies) {
    await upsert(collectionNames.slaPolicies, id, {
      id,
      workspaceId,
      clientId,
      supportAgreementId,
      priority,
      categoryId,
      name,
      description: `${name} policy`,
      active: true,
      firstResponseMinutes,
      resolutionMinutes,
      businessHoursStart: start,
      businessHoursEnd: end,
      workingDays: ["mon", "tue", "wed", "thu", "fri"],
      publicHolidays: holidays.map(([date]) => date),
      pauseConditions: ["WAITING_FOR_CUSTOMER"],
      escalationRules: ["75% technician notification", "90% manager notification"],
      createdById: adminId,
      updatedById: adminId,
    });
  }

  const escalations = [
    ["critical-escalation", "Critical breach escalation", "sla.breached", "in_app_notification", 75, "Service Desk Manager"],
    ["manager-warning", "Manager warning", "sla.at_risk", "manager_notification", 90, "Service Desk Manager"],
    ["auto-reassign", "Auto reassign critical tickets", "sla.breached", "technician_reassignment", 100, "Technician"],
  ];

  for (const [id, name, trigger, action, thresholdPercent, targetRole] of escalations) {
    await upsert(collectionNames.escalations, id, {
      id,
      workspaceId,
      name,
      trigger,
      action,
      thresholdPercent,
      targetRole,
      enabled: true,
      createdById: adminId,
      updatedById: adminId,
    });
  }

  const automationRules = [
    ["auto-ack", "Auto acknowledgment", "ticket.created", "send_email", true],
    ["auto-tag", "Security tagging", "ticket.created", "update_ticket_fields", true],
    ["escalate-overdue", "Escalate overdue tickets", "sla.breached", "create_escalation", true],
  ];

  for (const [id, name, trigger, action, active] of automationRules) {
    await upsert(collectionNames.automationRules, id, {
      id,
      workspaceId,
      name,
      trigger,
      action,
      active,
      conditions: [],
      actions: [],
      createdById: adminId,
      updatedById: adminId,
    });
  }

  await upsert(collectionNames.ticketSequences, "default", {
    id: "default",
    workspaceId,
    currentValue: 24,
    prefix: "SH-TKT",
    padding: 6,
    createdById: adminId,
    updatedById: adminId,
  });

  const tickets = [
    {
      id: "ticket-001",
      referenceNumber: "SH-TKT-000021",
      workspaceId,
      clientId: "acme-holdings",
      siteId: "acme-holdings-jhb",
      supportAgreementId: "acme-standard",
      categoryId: "network",
      subject: "VPN instability affecting head office staff",
      description: "Users are experiencing frequent VPN drops during morning login hours.",
      status: "IN_PROGRESS",
      priority: "HIGH",
      queue: "open",
      requesterName: "Mpho Molefe",
      requesterEmail: "mpho.molefe@acme.example.com",
      requesterId: adminId,
      assigneeId: adminId,
      createdById: adminId,
      updatedById: adminId,
      openedAt: new Date("2026-07-10T07:30:00.000Z"),
      firstResponseAt: new Date("2026-07-10T08:05:00.000Z"),
      lastClientReplyAt: null,
      lastAgentReplyAt: new Date("2026-07-10T08:05:00.000Z"),
      firstResponseDueAt: new Date("2026-07-10T08:30:00.000Z"),
      resolutionDueAt: new Date("2026-07-10T15:30:00.000Z"),
      slaPolicyId: "critical-support",
      slaState: "AT_RISK",
      slaPausedMinutes: 0,
      pausedAt: null,
      dueAt: new Date("2026-07-10T15:30:00.000Z"),
      closedAt: null,
      resolvedAt: null,
      lastActivityAt: new Date("2026-07-10T08:05:00.000Z"),
    },
    {
      id: "ticket-002",
      referenceNumber: "SH-TKT-000022",
      workspaceId,
      clientId: "blue-river",
      siteId: "blue-river-dbn",
      supportAgreementId: "blue-river-standard",
      categoryId: "software",
      subject: "Warehouse scanning app crashes on login",
      description: "The Android scanning app closes immediately after a user signs in.",
      status: "WAITING_FOR_CUSTOMER",
      priority: "NORMAL",
      queue: "waiting",
      requesterName: "Thabo Ndlovu",
      requesterEmail: "thabo.ndlovu@blueriver.example.com",
      requesterId: adminId,
      assigneeId: null,
      createdById: adminId,
      updatedById: adminId,
      openedAt: new Date("2026-07-12T09:15:00.000Z"),
      firstResponseAt: new Date("2026-07-12T09:40:00.000Z"),
      lastClientReplyAt: new Date("2026-07-16T11:20:00.000Z"),
      lastAgentReplyAt: new Date("2026-07-15T10:00:00.000Z"),
      firstResponseDueAt: new Date("2026-07-12T10:15:00.000Z"),
      resolutionDueAt: new Date("2026-07-16T16:15:00.000Z"),
      slaPolicyId: "standard-support",
      slaState: "DUE_SOON",
      slaPausedMinutes: 90,
      pausedAt: new Date("2026-07-15T10:00:00.000Z"),
      dueAt: new Date("2026-07-16T16:15:00.000Z"),
      closedAt: null,
      resolvedAt: null,
      lastActivityAt: new Date("2026-07-16T11:20:00.000Z"),
    },
    {
      id: "ticket-003",
      referenceNumber: "SH-TKT-000023",
      workspaceId,
      clientId: "orbital-retail",
      siteId: "orbital-retail-cpt",
      supportAgreementId: "orbital-onboarding",
      categoryId: "access",
      subject: "New starter needs ERP and email access",
      description: "Provision access for three new onboarding employees.",
      status: "NEW",
      priority: "NORMAL",
      queue: "dueToday",
      requesterName: "Naledi Radebe",
      requesterEmail: "naledi.radebe@orbital.example.com",
      requesterId: adminId,
      assigneeId: null,
      createdById: adminId,
      updatedById: adminId,
      openedAt: new Date("2026-07-17T06:00:00.000Z"),
      firstResponseAt: null,
      lastClientReplyAt: null,
      lastAgentReplyAt: null,
      firstResponseDueAt: new Date("2026-07-17T09:00:00.000Z"),
      resolutionDueAt: new Date("2026-07-17T16:00:00.000Z"),
      slaPolicyId: "onboarding-support",
      slaState: "DUE_SOON",
      slaPausedMinutes: 0,
      pausedAt: null,
      dueAt: new Date("2026-07-17T16:00:00.000Z"),
      closedAt: null,
      resolvedAt: null,
      lastActivityAt: new Date("2026-07-17T06:00:00.000Z"),
    },
    {
      id: "ticket-004",
      referenceNumber: "SH-TKT-000024",
      workspaceId,
      clientId: "northstar-health",
      siteId: "northstar-health-dbn",
      supportAgreementId: null,
      categoryId: "security",
      subject: "Suspicious mailbox forwarding rule detected",
      description: "Security review required for an external mailbox forwarding rule.",
      status: "RESOLVED",
      priority: "URGENT",
      queue: "mine",
      requesterName: "Sipho Khumalo",
      requesterEmail: "sipho.khumalo@northstar.example.com",
      requesterId: adminId,
      assigneeId: adminId,
      createdById: adminId,
      updatedById: adminId,
      openedAt: new Date("2026-07-08T08:10:00.000Z"),
      firstResponseAt: new Date("2026-07-08T08:20:00.000Z"),
      lastClientReplyAt: new Date("2026-07-08T11:10:00.000Z"),
      lastAgentReplyAt: new Date("2026-07-08T11:00:00.000Z"),
      firstResponseDueAt: new Date("2026-07-08T08:25:00.000Z"),
      resolutionDueAt: new Date("2026-07-08T10:45:00.000Z"),
      slaPolicyId: "critical-support",
      slaState: "RESOLVED",
      slaPausedMinutes: 0,
      pausedAt: null,
      dueAt: new Date("2026-07-08T10:45:00.000Z"),
      closedAt: new Date("2026-07-08T11:30:00.000Z"),
      resolvedAt: new Date("2026-07-08T11:00:00.000Z"),
      lastActivityAt: new Date("2026-07-08T11:30:00.000Z"),
    },
    {
      id: "ticket-005",
      referenceNumber: "SH-TKT-000025",
      workspaceId,
      clientId: "legacy-corp",
      siteId: "legacy-corp-jhb",
      supportAgreementId: null,
      categoryId: "billing",
      subject: "Final invoice query before account closure",
      description: "Legacy Corp is asking for a final invoice breakdown.",
      status: "CLOSED",
      priority: "LOW",
      queue: "all",
      requesterName: "Finance Team",
      requesterEmail: "finance@legacy.example.com",
      requesterId: adminId,
      assigneeId: null,
      createdById: adminId,
      updatedById: adminId,
      openedAt: new Date("2026-06-30T09:00:00.000Z"),
      firstResponseAt: new Date("2026-06-30T09:35:00.000Z"),
      lastClientReplyAt: null,
      lastAgentReplyAt: new Date("2026-06-30T10:00:00.000Z"),
      firstResponseDueAt: new Date("2026-06-30T10:00:00.000Z"),
      resolutionDueAt: new Date("2026-06-30T15:00:00.000Z"),
      slaPolicyId: "standard-support",
      slaState: "RESOLVED",
      slaPausedMinutes: 0,
      pausedAt: null,
      dueAt: new Date("2026-06-30T15:00:00.000Z"),
      closedAt: new Date("2026-06-30T16:15:00.000Z"),
      resolvedAt: new Date("2026-06-30T10:00:00.000Z"),
      lastActivityAt: new Date("2026-06-30T16:15:00.000Z"),
    },
  ];

  for (const ticket of tickets) {
    await upsert(collectionNames.tickets, ticket.id, ticket);
    await upsert(collectionNames.ticketHistory, `${ticket.id}-created`, {
      id: `${ticket.id}-created`,
      ticketId: ticket.id,
      actorId: adminId,
      action: "tickets.create",
      newValues: {
        referenceNumber: ticket.referenceNumber,
        subject: ticket.subject,
        clientId: ticket.clientId,
        slaPolicyId: ticket.slaPolicyId,
      },
      createdAt: ticket.openedAt,
    });
    await upsert(collectionNames.slaEvents, `${ticket.id}-policy`, {
      id: `${ticket.id}-policy`,
      ticketId: ticket.id,
      slaPolicyId: ticket.slaPolicyId,
      actorId: adminId,
      type: "sla.policy_applied",
      payload: {
        firstResponseDueAt: ticket.firstResponseDueAt,
        resolutionDueAt: ticket.resolutionDueAt,
      },
      createdAt: ticket.openedAt,
    });
  }

  const emailMessages = [
    ["email-001", "Invoice dispute from Legacy Corp", "finance@legacy.example.com", "legacy-corp", "FAILED", 2],
    ["email-002", "New ticket from Acme", "help@acme.example.com", "acme-holdings", "PROCESSED", 1],
    ["email-003", "Retail onboarding reply", "it@orbital.example.com", "orbital-retail", "PENDING", 0],
  ];

  for (const [id, subject, sender, clientId, processingStatus, attemptCount] of emailMessages) {
    await upsert(collectionNames.emailMessages, id, {
      id,
      workspaceId,
      clientId,
      sender,
      recipients: [env.DEFAULT_SUPPORT_EMAIL],
      subject,
      messageId: `<${id}@sourcehub.local>`,
      duplicateKey: `${sender}|${subject}`,
      ticketReference: clientId === "legacy-corp" ? "SH-TKT-000025" : null,
      processingStatus,
      attemptCount,
      failureReason: processingStatus === "FAILED" ? "Mailbox credentials unavailable in development adapter." : null,
      createdAt: now,
      processedAt: processingStatus === "PROCESSED" ? now : null,
      createdById: adminId,
      updatedById: adminId,
    });
  }

  await upsert(collectionNames.portalAccounts, "acme-portal", {
    id: "acme-portal",
    workspaceId,
    clientId: "acme-holdings",
    contactId: "acme-cio",
    email: "mpho.molefe@acme.example.com",
    role: "REQUESTER",
    status: "ACTIVE",
    createdById: adminId,
    updatedById: adminId,
  });

  await upsert(collectionNames.portalInvitations, "acme-invite", {
    id: "acme-invite",
    workspaceId,
    clientId: "acme-holdings",
    contactId: "acme-cio",
    email: "mpho.molefe@acme.example.com",
    role: "REQUESTER",
    status: "SENT",
    token: "seed-acme-invite",
    expiresAt: new Date("2026-08-01T00:00:00.000Z"),
    createdById: adminId,
    updatedById: adminId,
  });

  await upsert(collectionNames.clientNotes, "acme-note", {
    id: "acme-note",
    workspaceId,
    clientId: "acme-holdings",
    title: "Quarterly review note",
    body: "Acme requested additional reporting on service stability and first-response times.",
    createdById: adminId,
    updatedById: adminId,
  });

  await upsert(collectionNames.clientFiles, "acme-file", {
    id: "acme-file",
    workspaceId,
    clientId: "acme-holdings",
    name: "Signed support agreement.pdf",
    fileName: "signed-support-agreement.pdf",
    storagePath: "workspaces/sourcehub/clients/acme-holdings/files/signed-support-agreement.pdf",
    mimeType: "application/pdf",
    sizeBytes: 204800,
    uploadedById: adminId,
    createdById: adminId,
    updatedById: adminId,
  });

  await upsert(collectionNames.technicianQueues, "default-queue", {
    id: "default-queue",
    workspaceId,
    name: "Default queue",
    description: "Primary service desk queue",
    createdById: adminId,
    updatedById: adminId,
  });

  for (const [id, type] of Object.entries(builtInAssetTypes)) {
    await upsert(collectionNames.assetTypes, id, {
      id,
      workspaceId,
      name: type.name,
      description: type.description,
      icon: type.icon,
      category: type.category,
      prefix: type.prefix,
      active: true,
      requiredFields: type.requiredFields,
      customFields: type.customFields,
      createdById: adminId,
      updatedById: adminId,
    });
  }

  const assetSeeds = [
    {
      id: "asset-laptop-acme-001",
      assetTypeId: "laptop",
      assetTag: "LAP-00001",
      name: "Acme Finance Laptop",
      status: "ACTIVE",
      ownershipType: "CLIENT",
      clientId: "acme-holdings",
      siteId: "acme-holdings-jhb",
      assignedUserId: adminId,
      responsibleTechnicianId: adminId,
      manufacturer: "Dell",
      model: "Latitude 7440",
      serialNumber: "DL-ACME-7440-001",
      hostname: "ACME-FIN-01",
      ipAddress: "10.10.10.21",
      macAddress: "00:11:22:33:44:01",
      operatingSystem: "Windows 11 Pro",
      windowsVersion: "23H2",
      cpu: "Intel Core i7",
      ram: "16 GB",
      storageCapacity: "512 GB SSD",
      freeDiskSpaceGb: 118,
      antivirusStatus: "ON",
      encryptionStatus: "ON",
      lastCheckIn: new Date("2026-07-16T15:00:00.000Z"),
      warrantyExpiryDate: new Date("2026-08-30T00:00:00.000Z"),
      monitoringState: "MONITORED",
      category: "Computer",
      purchaseDate: new Date("2025-08-12T00:00:00.000Z"),
      searchExtras: ["Finance", "Laptop"],
    },
    {
      id: "asset-desktop-brl-001",
      assetTypeId: "desktop",
      assetTag: "DESK-00001",
      name: "Blue River Control Desk",
      status: "UNDER_REPAIR",
      ownershipType: "CLIENT",
      clientId: "blue-river",
      siteId: "blue-river-dbn",
      assignedUserId: null,
      responsibleTechnicianId: adminId,
      manufacturer: "HP",
      model: "EliteDesk 800 G9",
      serialNumber: "HP-BRL-800-901",
      hostname: "BRL-CTRL-01",
      ipAddress: "10.10.20.15",
      macAddress: "00:11:22:33:44:02",
      operatingSystem: "Windows 11 Pro",
      windowsVersion: "23H2",
      cpu: "Intel Core i5",
      ram: "8 GB",
      storageCapacity: "256 GB SSD",
      freeDiskSpaceGb: 24,
      antivirusStatus: "ON",
      encryptionStatus: "ON",
      lastCheckIn: new Date("2026-07-14T12:00:00.000Z"),
      warrantyExpiryDate: new Date("2026-12-31T00:00:00.000Z"),
      monitoringState: "MONITORED",
      category: "Computer",
      purchaseDate: new Date("2024-11-05T00:00:00.000Z"),
      searchExtras: ["Control", "Desktop"],
    },
    {
      id: "asset-server-src-001",
      assetTypeId: "server",
      assetTag: "SRV-00001",
      name: "SourceHub Core App Server",
      status: "ACTIVE",
      ownershipType: "INTERNAL",
      clientId: null,
      siteId: null,
      assignedUserId: adminId,
      responsibleTechnicianId: adminId,
      manufacturer: "Lenovo",
      model: "ThinkSystem SR650",
      serialNumber: "SRV-SRC-650-001",
      hostname: "SRC-APP-01",
      ipAddress: "10.20.0.10",
      macAddress: "00:11:22:33:44:03",
      operatingSystem: "Ubuntu Server 22.04",
      cpu: "2 x Intel Xeon",
      ram: "64 GB",
      storageCapacity: "2 TB RAID 10",
      freeDiskSpaceGb: 512,
      antivirusStatus: "ON",
      encryptionStatus: "ON",
      lastCheckIn: new Date("2026-07-17T08:00:00.000Z"),
      warrantyExpiryDate: new Date("2027-01-15T00:00:00.000Z"),
      monitoringState: "MONITORED",
      category: "Infrastructure",
      purchaseDate: new Date("2024-02-10T00:00:00.000Z"),
      searchExtras: ["Core", "App"],
    },
    {
      id: "asset-printer-acme-001",
      assetTypeId: "printer",
      assetTag: "PRN-00001",
      name: "Acme Reception Printer",
      status: "IN_STOCK",
      ownershipType: "CLIENT",
      clientId: "acme-holdings",
      siteId: "acme-holdings-cpt",
      assignedUserId: null,
      responsibleTechnicianId: adminId,
      manufacturer: "Canon",
      model: "i-SENSYS LBP236dw",
      serialNumber: "CAN-PRN-236-001",
      hostname: "ACME-PRN-CPT-01",
      ipAddress: "10.10.30.20",
      macAddress: "00:11:22:33:44:04",
      category: "Peripherals",
      purchaseDate: new Date("2026-06-20T00:00:00.000Z"),
      searchExtras: ["Reception", "Printer"],
    },
    {
      id: "asset-firewall-nsh-001",
      assetTypeId: "firewall",
      assetTag: "FW-00001",
      name: "Northstar Edge Firewall",
      status: "IN_STORAGE",
      ownershipType: "CLIENT",
      clientId: "northstar-health",
      siteId: "northstar-health-dbn",
      assignedUserId: null,
      responsibleTechnicianId: adminId,
      manufacturer: "Fortinet",
      model: "FortiGate 60F",
      serialNumber: "FG-NSH-60F-001",
      hostname: "NSH-FW-01",
      category: "Security",
      purchaseDate: new Date("2025-04-15T00:00:00.000Z"),
      searchExtras: ["Firewall", "Edge"],
    },
    {
      id: "asset-phone-orb-001",
      assetTypeId: "mobilePhone",
      assetTag: "MOB-00001",
      name: "Orbital Field Phone",
      status: "LOANED",
      ownershipType: "CLIENT",
      clientId: "orbital-retail",
      siteId: "orbital-retail-jhb",
      assignedUserId: adminId,
      responsibleTechnicianId: adminId,
      manufacturer: "Samsung",
      model: "Galaxy S24",
      serialNumber: "S24-ORB-001",
      category: "Mobile",
      purchaseDate: new Date("2026-03-10T00:00:00.000Z"),
      searchExtras: ["Phone", "Loaned"],
    },
    {
      id: "asset-monitor-src-001",
      assetTypeId: "monitor",
      assetTag: "MON-00001",
      name: "SourceHub Support Monitor",
      status: "ACTIVE",
      ownershipType: "INTERNAL",
      clientId: null,
      siteId: null,
      assignedUserId: adminId,
      responsibleTechnicianId: adminId,
      manufacturer: "LG",
      model: "27UP850",
      serialNumber: "LG-MON-850-001",
      category: "Peripherals",
      purchaseDate: new Date("2025-10-01T00:00:00.000Z"),
      searchExtras: ["Support", "Monitor"],
    },
  ];

  for (const asset of assetSeeds) {
    const assetId = asset.id;
    const searchTokens = assetSearchTokens([
      asset.assetTag,
      asset.name,
      asset.serialNumber,
      asset.manufacturer,
      asset.model,
      asset.hostname,
      asset.ipAddress,
      asset.macAddress,
      ...(asset.searchExtras ?? []),
    ]);
    const warrantyState = calculateWarrantyStatus({ expiryDate: asset.warrantyExpiryDate ?? null });

    await upsert(collectionNames.assets, assetId, {
      id: assetId,
      workspaceId,
      assetTypeId: asset.assetTypeId,
      assetTag: asset.assetTag,
      name: asset.name,
      category: asset.category,
      status: asset.status,
      ownershipType: asset.ownershipType,
      clientId: asset.clientId,
      siteId: asset.siteId,
      contactId: null,
      assignedUserId: asset.assignedUserId,
      responsibleTechnicianId: asset.responsibleTechnicianId,
      department: asset.clientId === "acme-holdings" ? "Finance" : null,
      physicalLocation: asset.status === "IN_STORAGE" ? "Stores" : null,
      manufacturer: asset.manufacturer,
      model: asset.model,
      serialNumber: asset.serialNumber,
      barcode: asset.assetTag,
      qrCodeValue: assetQrcodeValue(env.NEXT_PUBLIC_APP_URL, assetId),
      description: `${asset.name} seeded for development testing.`,
      internalNotes: "Seeded asset record.",
      cpu: asset.cpu ?? null,
      ram: asset.ram ?? null,
      storageCapacity: asset.storageCapacity ?? null,
      storageType: asset.storageType ?? null,
      operatingSystem: asset.operatingSystem ?? null,
      windowsVersion: asset.windowsVersion ?? null,
      architecture: asset.architecture ?? null,
      hostname: asset.hostname ?? null,
      ipAddress: asset.ipAddress ?? null,
      macAddress: asset.macAddress ?? null,
      networkDomain: asset.networkDomain ?? null,
      biosVersion: asset.biosVersion ?? null,
      motherboard: asset.motherboard ?? null,
      screenSizeInches: asset.screenSizeInches ?? null,
      batteryHealth: asset.batteryHealth ?? null,
      antivirusProduct: asset.antivirusProduct ?? "Microsoft Defender",
      antivirusStatus: asset.antivirusStatus ?? null,
      encryptionStatus: asset.encryptionStatus ?? null,
      bitLockerStatus: "ON",
      firewallStatus: "ON",
      lastLoggedInUser: adminId,
      lastCheckIn: asset.lastCheckIn ?? null,
      uptime: "14 days",
      freeDiskSpaceGb: asset.freeDiskSpaceGb ?? null,
      healthState: asset.status === "UNDER_REPAIR" ? "AT_RISK" : "HEALTHY",
      complianceState: "COMPLIANT",
      monitoringState: asset.monitoringState ?? "MONITORED",
      supplier: asset.clientId ? "Source IT Services" : "Internal procurement",
      purchaseDate: asset.purchaseDate ?? null,
      purchasePrice: "24000",
      currency: "ZAR",
      invoiceReference: `INV-${asset.assetTag}`,
      warrantyStartDate: asset.purchaseDate ?? null,
      warrantyExpiryDate: asset.warrantyExpiryDate ?? null,
      warrantyProvider: asset.assetTypeId === "server" ? "Lenovo Warranty" : "Standard OEM Warranty",
      warrantyReference: `WARR-${asset.assetTag}`,
      warrantyStatus: warrantyState,
      replacementValue: "30000",
      expectedReplacementDate: null,
      acquisitionDate: asset.purchaseDate ?? null,
      deploymentDate: asset.status === "ACTIVE" ? asset.purchaseDate ?? null : null,
      lastServiceDate: asset.status === "UNDER_REPAIR" ? new Date("2026-07-14T00:00:00.000Z") : null,
      nextServiceDate: null,
      retirementDate: asset.status === "RETIRED" ? new Date("2026-07-01T00:00:00.000Z") : null,
      disposalDate: null,
      disposalMethod: null,
      disposalCertificate: null,
      customFields: {},
      searchTokens,
      createdById: adminId,
      updatedById: adminId,
    });

    await upsert(collectionNames.assetWarranties, `${assetId}-warranty`, {
      id: `${assetId}-warranty`,
      workspaceId,
      assetId,
      provider: asset.assetTypeId === "server" ? "Lenovo Warranty" : "Standard OEM Warranty",
      reference: `WARR-${asset.assetTag}`,
      startDate: asset.purchaseDate ?? null,
      expiryDate: asset.warrantyExpiryDate ?? null,
      warrantyType: "Standard",
      coverageDetails: "Parts and labour.",
      contactInfo: "support@sourceitservices.co.za",
      claimHistory: null,
      notes: null,
      status: warrantyState,
      createdById: adminId,
      updatedById: adminId,
    });

    await upsert(collectionNames.assetAssignments, `${assetId}-assignment`, {
      id: `${assetId}-assignment`,
      workspaceId,
      assetId,
      assignmentType: asset.clientId ? "SITE" : "USER",
      previousAssignment: null,
      newAssignment: {
        clientId: asset.clientId,
        siteId: asset.siteId,
        assignedUserId: asset.assignedUserId,
        responsibleTechnicianId: asset.responsibleTechnicianId,
      },
      notes: "Initial seed assignment.",
      transferNotes: null,
      assignedById: adminId,
      assignedAt: asset.purchaseDate ?? now,
      active: true,
      createdById: adminId,
      updatedById: adminId,
    });

    await upsert(collectionNames.assetEvents, `${assetId}-created`, {
      id: `${assetId}-created`,
      workspaceId,
      assetId,
      eventType: "asset.created",
      description: `Created ${asset.assetTag}.`,
      actorId: adminId,
      source: "seed",
      previousValue: null,
      newValue: {
        assetTag: asset.assetTag,
        name: asset.name,
        assetTypeId: asset.assetTypeId,
      },
      createdAt: asset.purchaseDate ?? now,
      createdById: adminId,
      updatedById: adminId,
    });

    if (asset.assetTypeId === "laptop") {
      await upsert(collectionNames.assetSoftware, `${assetId}-software`, {
        id: `${assetId}-software`,
        workspaceId,
        assetId,
        softwareName: "Microsoft 365 Apps",
        publisher: "Microsoft",
        version: "16.0",
        installationDate: asset.purchaseDate ?? null,
        installationSource: "Seed",
        licenceId: "m365-business-premium",
        detectionSource: "Seed",
        lastDetectedDate: now,
        approved: true,
        securityRiskState: "LOW",
        removalDate: null,
        createdById: adminId,
        updatedById: adminId,
      });
    }
  }

  const softwareLicences = [
    ["m365-business-premium", "Microsoft 365 Business Premium", "Microsoft", "SUBSCRIPTION", "LIC-M365-BP-001", "acme-holdings", 25, 12, "ACTIVE"],
    ["fortinet-support", "Fortinet Support", "Fortinet", "SUPPORT", "LIC-FTNT-SUP-001", "northstar-health", 10, 10, "FULLY_ALLOCATED"],
  ];

  for (const [id, productName, publisher, licenceType, licenceReference, clientId, totalSeats, usedSeats, status] of softwareLicences) {
    await upsert(collectionNames.softwareLicences, id, {
      id,
      workspaceId,
      productName,
      publisher,
      licenceType,
      licenceReference,
      clientId,
      totalSeats,
      usedSeats,
      availableSeats: Math.max(0, totalSeats - usedSeats),
      purchaseDate: new Date("2026-01-15T00:00:00.000Z"),
      renewalDate: new Date("2026-12-15T00:00:00.000Z"),
      expiryDate: new Date("2026-12-31T00:00:00.000Z"),
      cost: "24000",
      currency: "ZAR",
      supplier: "Source IT Services",
      status,
      secureNotes: "Stored securely in a real deployment.",
      contractId: null,
      createdById: adminId,
      updatedById: adminId,
    });
  }

  await upsert(collectionNames.licenceAssignments, "licence-m365-acme", {
    id: "licence-m365-acme",
    workspaceId,
    licenceId: "m365-business-premium",
    assetId: "asset-laptop-acme-001",
    userId: adminId,
    assignedAt: new Date("2026-07-10T00:00:00.000Z"),
    removedAt: null,
    assignedById: adminId,
    createdById: adminId,
    updatedById: adminId,
  });

  await upsert(collectionNames.assetFiles, "asset-laptop-acme-001-file", {
    id: "asset-laptop-acme-001-file",
    workspaceId,
    assetId: "asset-laptop-acme-001",
    category: "warranty",
    description: "Seed warranty certificate.",
    fileName: "warranty-certificate.pdf",
    originalName: "warranty-certificate.pdf",
    mimeType: "application/pdf",
    fileSize: 201212,
    storagePath: "workspaces/source-it-services/assets/asset-laptop-acme-001/warranty-certificate.pdf",
    storageProvider: "filesystem",
    downloadUrl: "/uploads/workspaces/source-it-services/assets/asset-laptop-acme-001/warranty-certificate.pdf",
    uploadedById: adminId,
    createdById: adminId,
    updatedById: adminId,
  });

  await upsert(collectionNames.assetHealthSnapshots, "asset-laptop-acme-001-snapshot", {
    id: "asset-laptop-acme-001-snapshot",
    workspaceId,
    assetId: "asset-laptop-acme-001",
    healthState: "HEALTHY",
    complianceState: "COMPLIANT",
    calculationVersion: "seed-v1",
    calculatedAt: now,
    factors: {
      lastCheckIn: new Date("2026-07-16T15:00:00.000Z"),
      freeDiskSpaceGb: 118,
      warrantyStatus: "EXPIRING_SOON",
    },
    createdById: adminId,
    updatedById: adminId,
  });

  for (const prefix of ["LAP", "DESK", "SRV", "PRN", "FW", "MOB", "MON"]) {
    const currentValue = assetSeeds.filter((asset) => asset.assetTag.startsWith(prefix)).length;
    await upsert(collectionNames.assetTagCounters, `${workspaceId}-${prefix}`, {
      id: `${workspaceId}-${prefix}`,
      workspaceId,
      prefix,
      currentValue,
      createdById: adminId,
      updatedById: adminId,
    });
  }

  const networkEnvironments = [
    {
      id: "network-acme-jhb",
      name: "Johannesburg office LAN",
      clientId: "acme-holdings",
      siteId: "acme-holdings-jhb",
      networkType: "OFFICE_LAN",
      primarySubnet: "192.0.2.0/24",
      additionalSubnets: ["198.51.100.0/28"],
      defaultGateway: "192.0.2.1",
      dnsServers: ["192.0.2.10", "192.0.2.11"],
      dhcpServer: "192.0.2.10",
      domainOrWorkgroup: "ACME.EXAMPLE",
      internetServiceProvider: "Fictional Fibre Provider",
      connectionType: "Fibre",
      router: "JHB-EDGE-RTR01",
      firewall: "JHB-EDGE-FW01",
      monitoringState: "ACTIVE",
      notes: "Fictional development network information.",
    },
    {
      id: "network-acme-cpt",
      name: "Cape Town branch network",
      clientId: "acme-holdings",
      siteId: "acme-holdings-cpt",
      networkType: "BRANCH_NETWORK",
      primarySubnet: "192.0.2.64/26",
      additionalSubnets: [],
      defaultGateway: "192.0.2.65",
      dnsServers: ["192.0.2.70"],
      dhcpServer: "192.0.2.70",
      domainOrWorkgroup: "ACME.EXAMPLE",
      internetServiceProvider: "Fictional LTE Provider",
      connectionType: "LTE failover",
      router: "CPT-EDGE-RTR01",
      firewall: "CPT-EDGE-FW01",
      monitoringState: "ACTIVE",
      notes: "Fictional development network information.",
    },
    {
      id: "network-blue-dbn",
      name: "Durban branch network",
      clientId: "blue-river",
      siteId: "blue-river-dbn",
      networkType: "BRANCH_NETWORK",
      primarySubnet: "198.51.100.0/26",
      additionalSubnets: [],
      defaultGateway: "198.51.100.1",
      dnsServers: ["198.51.100.10"],
      dhcpServer: "198.51.100.10",
      domainOrWorkgroup: "BRL.EXAMPLE",
      internetServiceProvider: "Fictional Business Fibre",
      connectionType: "Fibre",
      router: "DBN-EDGE-RTR01",
      firewall: "DBN-EDGE-FW01",
      monitoringState: "ACTIVE",
      notes: "Fictional development network information.",
    },
  ];

  for (const environment of networkEnvironments) {
    await upsert(collectionNames.networkEnvironments, environment.id, {
      ...environment,
      workspaceId,
      searchTokens: [environment.name.toLowerCase(), environment.primarySubnet, environment.domainOrWorkgroup.toLowerCase(), environment.connectionType.toLowerCase()],
      lastScan: now,
      lastSuccessfulCheck: now,
      archivedAt: null,
      createdById: adminId,
      updatedById: adminId,
    });
  }

  const networkDevices = [
    ["network-device-jhb-fw", "network-acme-jhb", "JHB-EDGE-FW01", "FIREWALL", "Fortinet", "FortiGate 60F", "192.0.2.1", "00:11:22:33:44:01", "HEALTHY", "COMPLIANT"],
    ["network-device-jhb-switch", "network-acme-jhb", "JHB-CORE-SW01", "SWITCH", "Cisco", "CBS350", "192.0.2.20", "00:11:22:33:44:02", "HEALTHY", "COMPLIANT"],
    ["network-device-cpt-router", "network-acme-cpt", "CPT-EDGE-RTR01", "ROUTER", "MikroTik", "RB4011", "192.0.2.65", "00:11:22:33:55:01", "AT_RISK", "AT_RISK"],
    ["network-device-dbn-ap", "network-blue-dbn", "DBN-WIFI-AP01", "WIRELESS_ACCESS_POINT", "Ubiquiti", "U6-LR", "198.51.100.20", "00:11:22:33:66:01", "HEALTHY", "COMPLIANT"],
  ];
  for (const [id, networkEnvironmentId, name, deviceType, manufacturer, model, ipAddress, macAddress, healthState, complianceState] of networkDevices) {
    const environment = networkEnvironments.find((item) => item.id === networkEnvironmentId);
    await upsert(collectionNames.networkDevices, id, {
      id,
      workspaceId,
      clientId: environment.clientId,
      siteId: environment.siteId,
      networkEnvironmentId,
      assetId: null,
      name,
      deviceType,
      manufacturer,
      model,
      serialNumber: `SEED-${id.toUpperCase()}`,
      hostname: name,
      ipAddress,
      macAddress,
      vlan: "10",
      subnet: environment.primarySubnet,
      defaultGateway: environment.defaultGateway,
      dnsInformation: environment.dnsServers.join(", "),
      firmwareVersion: "Seed firmware",
      operatingSystem: null,
      physicalLocation: "Communications room",
      rackInformation: "Rack A",
      responsibleTechnicianId: adminId,
      monitoringState: "ACTIVE",
      healthState,
      complianceState,
      firstDetected: now,
      lastDetected: now,
      lastCheckIn: now,
      lastSuccessfulCheck: now,
      archivedAt: null,
      notes: "Fictional development device.",
      searchTokens: [name.toLowerCase(), ipAddress, macAddress.toLowerCase(), manufacturer.toLowerCase(), model.toLowerCase()],
      createdById: adminId,
      updatedById: adminId,
    });
  }

  const makeAudit = ({ computerName, loggedInUser, manufacturer, model, serialNumber, buildNumber, usedPercent, antivirusEnabled, firewallEnabled, bitLockerEnabled, secureBootEnabled, tpmReady, pendingRestart, ipAddress, macAddress }) => ({
    schemaVersion: "1.0",
    scriptVersion: "1.0.0",
    auditId: `00000000-0000-4000-8000-${computerName.toLowerCase().replace(/[^a-z0-9]/g, "").padEnd(12, "0").slice(0, 12)}`,
    timestamp: now.toISOString(),
    device: { computerName, loggedInUser: loggedInUser ?? null, manufacturer, model, serialNumber, windowsDeviceId: `seed-${computerName}`, domainOrWorkgroup: "ACME.EXAMPLE", deviceType: "Computer" },
    operatingSystem: { edition: "Windows 11 Pro", version: "23H2", buildNumber, architecture: "64-bit", installationDate: "2025-05-01T08:00:00.000Z", lastBootTime: now.toISOString(), uptimeSeconds: 86400, timeZone: "Africa/Johannesburg" },
    hardware: { cpuManufacturer: "Intel", cpuModel: "Intel Core i5", physicalCores: 6, logicalProcessors: 12, totalRamBytes: 17179869184, availableRamBytes: 8589934592, memoryModules: [] },
    storage: [{ driveLetter: "C:", driveType: "Fixed", fileSystem: "NTFS", totalBytes: 512000000000, freeBytes: Math.round(512000000000 * (1 - usedPercent / 100)), usedPercent, health: "Healthy", bitLockerState: bitLockerEnabled ? "On" : "Off" }],
    network: { adapters: [{ name: "Ethernet", connectionType: "Ethernet", ipAddresses: [ipAddress], subnetPrefixes: [24], defaultGateways: ["192.0.2.1"], dnsServers: ["192.0.2.10"], dhcpEnabled: true, macAddress, linkSpeed: "1 Gbps" }], publicIp: null },
    security: { antivirusProduct: antivirusEnabled ? "Microsoft Defender" : "Microsoft Defender", antivirusEnabled, antivirusUpToDate: antivirusEnabled, firewallEnabled, bitLockerEnabled, secureBootEnabled, tpmPresent: true, tpmReady, pendingRestart, windowsUpdateState: "Current", localAdministrators: ["Administrator (summary only)"] },
    software: [{ name: "Microsoft 365 Apps", publisher: "Microsoft", version: "16.0", installDate: "2025-05-01" }],
    checkErrors: [],
  });

  const endpoints = [
    { id: "endpoint-acme-finance-01", networkEnvironmentId: "network-acme-jhb", assetId: "asset-laptop-acme-001", computerName: "ACME-FIN-01", loggedInUser: "dev.admin", manufacturer: "Dell", model: "Latitude 5440", serialNumber: "ACME-SEED-001", healthState: "HEALTHY", complianceState: "COMPLIANT", checkInState: "ONLINE", usedPercent: 48, antivirusEnabled: true, firewallEnabled: true, bitLockerEnabled: true, secureBootEnabled: true, tpmReady: true, pendingRestart: false, ipAddress: "192.0.2.41", macAddress: "00:AA:00:00:00:01", buildNumber: "22631" },
    { id: "endpoint-acme-finance-02", networkEnvironmentId: "network-acme-jhb", assetId: null, computerName: "ACME-FIN-02", loggedInUser: "analyst", manufacturer: "Lenovo", model: "ThinkPad T14", serialNumber: "ACME-SEED-002", healthState: "AT_RISK", complianceState: "AT_RISK", checkInState: "ONLINE", usedPercent: 84, antivirusEnabled: true, firewallEnabled: true, bitLockerEnabled: false, secureBootEnabled: true, tpmReady: true, pendingRestart: true, ipAddress: "192.0.2.42", macAddress: "00:AA:00:00:00:02", buildNumber: "22631" },
    { id: "endpoint-blue-ops-01", networkEnvironmentId: "network-blue-dbn", assetId: null, computerName: "BRL-OPS-01", loggedInUser: "operator", manufacturer: "HP", model: "ProBook 450", serialNumber: "BRL-SEED-001", healthState: "CRITICAL", complianceState: "NON_COMPLIANT", checkInState: "ONLINE", usedPercent: 96, antivirusEnabled: false, firewallEnabled: false, bitLockerEnabled: false, secureBootEnabled: false, tpmReady: false, pendingRestart: true, ipAddress: "198.51.100.41", macAddress: "00:BB:00:00:00:01", buildNumber: "19045" },
    { id: "endpoint-acme-cpt-01", networkEnvironmentId: "network-acme-cpt", assetId: null, computerName: "ACME-CPT-01", loggedInUser: null, manufacturer: "Dell", model: "OptiPlex 7010", serialNumber: "ACME-SEED-003", healthState: "OFFLINE", complianceState: "UNKNOWN", checkInState: "OFFLINE", usedPercent: 60, antivirusEnabled: null, firewallEnabled: null, bitLockerEnabled: null, secureBootEnabled: null, tpmReady: null, pendingRestart: null, ipAddress: "192.0.2.81", macAddress: "00:AA:00:00:00:03", buildNumber: "22621" },
  ];
  const endpointPepper = process.env.ENDPOINT_CREDENTIAL_PEPPER ?? "sourcehub-development-endpoint-pepper";
  for (const item of endpoints) {
    const environment = networkEnvironments.find((entry) => entry.id === item.networkEnvironmentId);
    const audit = makeAudit(item);
    await upsert(collectionNames.endpoints, item.id, {
      id: item.id,
      workspaceId,
      clientId: environment.clientId,
      siteId: environment.siteId,
      networkEnvironmentId: item.networkEnvironmentId,
      assetId: item.assetId,
      endpointIdentityId: item.id,
      computerName: item.computerName,
      loggedInUser: item.loggedInUser,
      manufacturer: item.manufacturer,
      model: item.model,
      serialNumber: item.serialNumber,
      deviceIdentifier: `seed-${item.computerName}`,
      operatingSystem: "Windows 11 Pro",
      windowsVersion: "23H2",
      buildNumber: item.buildNumber,
      architecture: "64-bit",
      responsibleTechnicianId: adminId,
      monitoringState: "ACTIVE",
      healthState: item.healthState,
      complianceState: item.complianceState,
      checkInState: item.checkInState,
      matchState: item.assetId ? "MANUALLY_LINKED" : "PENDING",
      matchCandidates: [],
      activeCredentialId: `${item.id}-credential`,
      activeAlertCount: item.healthState === "HEALTHY" ? 0 : 1,
      antivirusProduct: "Microsoft Defender",
      antivirusEnabled: item.antivirusEnabled,
      firewallEnabled: item.firewallEnabled,
      bitLockerEnabled: item.bitLockerEnabled,
      secureBootEnabled: item.secureBootEnabled,
      tpmReady: item.tpmReady,
      pendingRestart: item.pendingRestart,
      diskState: item.usedPercent >= 92 ? "CRITICAL" : item.usedPercent >= 80 ? "WARNING" : "HEALTHY",
      monitoringPolicyId: "monitoring-policy-default",
      lastAuditId: audit.auditId,
      lastAuditVersion: audit.scriptVersion,
      lastCheckIn: item.checkInState === "OFFLINE" ? new Date("2026-07-10T08:00:00.000Z") : now,
      lastSuccessfulCheck: item.checkInState === "OFFLINE" ? new Date("2026-07-10T08:00:00.000Z") : now,
      searchTokens: [item.computerName.toLowerCase(), item.serialNumber.toLowerCase(), item.loggedInUser ?? "", item.ipAddress, item.macAddress.toLowerCase(), item.manufacturer.toLowerCase(), item.model.toLowerCase()],
      revokedAt: null,
      createdById: adminId,
      updatedById: adminId,
    });
    await upsert(collectionNames.endpointSnapshots, item.id, { id: item.id, endpointId: item.id, workspaceId, clientId: environment.clientId, siteId: environment.siteId, assetId: item.assetId, sourceAuditId: audit.auditId, policyId: "monitoring-policy-default", audit, posture: { healthState: item.healthState, complianceState: item.complianceState, diskState: item.usedPercent >= 92 ? "CRITICAL" : item.usedPercent >= 80 ? "WARNING" : "HEALTHY", maximumDiskUsedPercent: item.usedPercent, failures: item.antivirusEnabled === false ? ["ANTIVIRUS_DISABLED"] : item.bitLockerEnabled === false ? ["BITLOCKER_DISABLED"] : [] } });
    await upsert(collectionNames.endpointAudits, audit.auditId, { id: audit.auditId, endpointId: item.id, workspaceId, clientId: environment.clientId, siteId: environment.siteId, assetId: item.assetId, schemaVersion: audit.schemaVersion, scriptVersion: audit.scriptVersion, auditTimestamp: now, payloadHash: createHash("sha256").update(JSON.stringify(audit)).digest("hex"), payload: audit, sizeBytes: Buffer.byteLength(JSON.stringify(audit)), immutable: true });
    await upsert(collectionNames.endpointCredentials, `${item.id}-credential`, { id: `${item.id}-credential`, endpointId: item.id, workspaceId, clientId: environment.clientId, siteId: environment.siteId, credentialHash: createHash("sha256").update(`${endpointPepper}:seed-only-${item.id}`).digest("hex"), status: "ACTIVE", expiresAt: new Date("2027-07-16T00:00:00.000Z"), lastUsedAt: now, revokedAt: null });
  }

  await upsert(collectionNames.monitoringPolicies, "monitoring-policy-default", { id: "monitoring-policy-default", workspaceId, name: "Workspace baseline", description: "Seeded development monitoring baseline.", scopeType: "WORKSPACE", clientId: null, siteId: null, assetId: null, checkInFrequencyMinutes: 1440, offlineThresholdMinutes: 2880, auditOverdueMinutes: 4320, lowDiskWarningPercent: 80, criticalDiskPercent: 92, requireAntivirus: true, requireFirewall: true, requireEncryption: true, requireSecureBoot: false, requireTpm: false, supportedWindowsBuilds: [], automaticTicketAlertTypes: ["CRITICAL_DISK_SPACE", "ANTIVIRUS_DISABLED"], notificationUserIds: [adminId], active: true, createdById: adminId, updatedById: adminId });

  const alerts = [
    ["endpoint-blue-ops-01:CRITICAL_DISK_SPACE", "endpoint-blue-ops-01", "blue-river", "blue-river-dbn", "CRITICAL_DISK_SPACE", "CRITICAL", "NEW", "Disk utilisation reached 96%.", 3],
    ["endpoint-blue-ops-01:ANTIVIRUS_DISABLED", "endpoint-blue-ops-01", "blue-river", "blue-river-dbn", "ANTIVIRUS_DISABLED", "CRITICAL", "ACKNOWLEDGED", "Antivirus protection is disabled or could not be verified.", 2],
    ["endpoint-acme-finance-02:BITLOCKER_DISABLED", "endpoint-acme-finance-02", "acme-holdings", "acme-holdings-jhb", "BITLOCKER_DISABLED", "HIGH", "NEW", "BitLocker encryption is disabled or could not be verified.", 1],
  ];
  for (const [id, endpointId, clientId, siteId, type, severity, status, description, occurrenceCount] of alerts) await upsert(collectionNames.networkAlerts, id, { id, workspaceId, clientId, siteId, assetId: endpoints.find((item) => item.id === endpointId)?.assetId ?? null, endpointId, networkEnvironmentId: endpoints.find((item) => item.id === endpointId)?.networkEnvironmentId ?? null, type, severity, status, description, detectedAt: now, lastDetectedAt: now, occurrenceCount, assignedTechnicianId: adminId, acknowledgedById: status === "ACKNOWLEDGED" ? adminId : null, acknowledgedAt: status === "ACKNOWLEDGED" ? now : null, resolvedById: null, resolvedAt: null, relatedTicketId: null, suppressionState: false, suppressionReason: null, sourceAuditId: endpoints.find((item) => item.id === endpointId)?.id ?? null, createdById: adminId, updatedById: adminId });

  await upsert(collectionNames.endpointChanges, "change-blue-ops-firewall", { id: "change-blue-ops-firewall", workspaceId, clientId: "blue-river", siteId: "blue-river-dbn", endpointId: "endpoint-blue-ops-01", assetId: null, changeType: "FIREWALL_STATE_CHANGED", previousValue: true, newValue: false, severity: "CRITICAL", sourceAuditId: "endpoint-blue-ops-01", detectedAt: now, acknowledgedAt: null, acknowledgedById: null, relatedAlertId: "endpoint-blue-ops-01:ANTIVIRUS_DISABLED", relatedTicketId: null, createdById: adminId, updatedById: adminId });

  await upsert(collectionNames.endpointEnrollments, "seed-enrolment-acme", { id: "seed-enrolment-acme", workspaceId, clientId: "acme-holdings", siteId: "acme-holdings-jhb", assetId: null, networkEnvironmentId: "network-acme-jhb", tokenHash: createHash("sha256").update(`${endpointPepper}:seed-enrolment-token`).digest("hex"), tokenHint: "TOKEN1", expiresAt: new Date("2026-12-31T00:00:00.000Z"), maxUses: 3, useCount: 0, revokedAt: null, lastUsedAt: null, notes: "Development seed token; do not use in production.", createdById: adminId, updatedById: adminId });

  const departments = [
    ["department-it", "IT Operations", "ITOPS", "Technology operations and service delivery."],
    ["department-people", "People and Culture", "PEOPLE", "Employee experience and people operations."],
    ["department-client", "Client Services", "CLIENT", "Client success and service coordination."],
  ];
  for (const [id, name, code, description] of departments) await upsert(collectionNames.departments, id, { id, workspaceId, name, code, description, active: true, headId: null, parentDepartmentId: null, costCentre: code, archivedAt: null, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.teams, "team-service-desk", { id: "team-service-desk", workspaceId, name: "Service Desk", description: "Frontline service desk team.", departmentId: "department-it", leaderId: adminId, active: true, createdBy: adminId, updatedBy: adminId });
  for (const [id, name, departmentId, seniority] of [["title-technician", "Support Technician", "department-it", "Professional"], ["title-consultant", "Client Consultant", "department-client", "Professional"], ["title-intern", "Technology Intern", "department-it", "Entry"]]) await upsert(collectionNames.jobTitles, id, { id, workspaceId, name, description: `${name} role`, departmentId, seniority, active: true, createdBy: adminId, updatedBy: adminId });

  const employeeSeed = [
    { id: "employee-adele", employeeNumber: "SH-0100", firstName: "Adele", lastName: "Mokoena", preferredName: "Adele", workEmail: "adele.mokoena@sourcehub.local", mobileNumber: "+27 71 000 0100", status: "ACTIVE", employmentType: "PERMANENT", jobTitle: "Support Technician", departmentId: "department-it", teamId: "team-service-desk", managerId: adminId, startDate: new Date("2024-04-15"), userId: null },
    { id: "employee-thabo", employeeNumber: "SH-0101", firstName: "Thabo", lastName: "Ndlovu", preferredName: "Thabo", workEmail: "thabo.ndlovu@sourcehub.local", mobileNumber: "+27 71 000 0101", status: "PREBOARDING", employmentType: "INTERN", jobTitle: "Technology Intern", departmentId: "department-it", teamId: "team-service-desk", managerId: adminId, startDate: new Date("2026-08-03"), userId: null },
    { id: "employee-nandi", employeeNumber: "SH-0102", firstName: "Nandi", lastName: "Jacobs", preferredName: "Nandi", workEmail: "nandi.jacobs@sourcehub.local", mobileNumber: "+27 71 000 0102", status: "ON_LEAVE", employmentType: "PERMANENT", jobTitle: "Client Consultant", departmentId: "department-client", teamId: null, managerId: adminId, startDate: new Date("2023-09-01"), userId: null },
    { id: "employee-pieter", employeeNumber: "SH-0103", firstName: "Pieter", lastName: "Van Wyk", preferredName: "Pieter", workEmail: "pieter.vanwyk@sourcehub.local", mobileNumber: "+27 71 000 0103", status: "ACTIVE", employmentType: "CONTRACTOR", jobTitle: "Security Consultant", departmentId: "department-it", teamId: null, managerId: adminId, startDate: new Date("2025-02-10"), userId: null },
  ];
  for (const employee of employeeSeed) await upsert(collectionNames.employees, employee.id, { ...employee, workspaceId, middleNames: null, personalEmail: null, alternativePhone: null, identityReference: null, identityReferenceMasked: null, nationality: "South African", preferredLanguage: "English", secondaryManagerId: null, workLocation: "Johannesburg", workingArrangement: "Hybrid", probationEndDate: null, contractEndDate: employee.id === "employee-pieter" ? new Date("2026-09-30") : null, terminationDate: null, terminationReason: null, noticePeriodDays: 30, standardHours: "08:00–17:00", costCentre: employee.departmentId === "department-it" ? "ITOPS" : "CLIENT", internalNotes: null, accountState: "NOT_LINKED", assignedAssetCount: 0, assignedEndpointCount: 0, openTicketCount: 0, createdBy: adminId, updatedBy: adminId, archivedAt: null, retentionState: "ACTIVE" });
  await upsert(collectionNames.employeeContracts, "contract-adele-2026", { id: "contract-adele-2026", workspaceId, employeeId: "employee-adele", contractReference: "CON-2026-0100", contractType: "Permanent employment", startDate: new Date("2024-04-15"), endDate: new Date("2027-04-14"), probationPeriodDays: 90, noticePeriodDays: 30, workingHours: "08:00–17:00", workLocation: "Johannesburg", jobTitle: "Support Technician", departmentId: "department-it", managerId: adminId, compensationSummary: "Restricted", status: "ACTIVE", signedDate: new Date("2024-04-10"), renewalDate: null, renewalType: null, internalNotes: null, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.employeeContracts, "contract-pieter-2025", { id: "contract-pieter-2025", workspaceId, employeeId: "employee-pieter", contractReference: "CON-2025-0103", contractType: "Fixed term consultancy", startDate: new Date("2025-02-10"), endDate: new Date("2026-09-30"), probationPeriodDays: 0, noticePeriodDays: 14, workingHours: "Flexible", workLocation: "Remote", jobTitle: "Security Consultant", departmentId: "department-it", managerId: adminId, compensationSummary: "Restricted", status: "ACTIVE", signedDate: new Date("2025-02-01"), renewalDate: new Date("2026-08-15"), renewalType: "Review", internalNotes: null, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.employeeEmergencyContacts, "contact-adele-primary", { id: "contact-adele-primary", workspaceId, employeeId: "employee-adele", fullName: "Lerato Mokoena", relationship: "Sibling", primaryPhone: "+27 72 000 0100", alternativePhone: null, email: "lerato@example.invalid", address: null, primary: true, notes: null, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.employeeQualifications, "qualification-adele-itil", { id: "qualification-adele-itil", workspaceId, employeeId: "employee-adele", name: "ITIL Foundation", institution: "Development Institute", qualificationType: "Certification", fieldOfStudy: "Service management", issueDate: new Date("2024-06-01"), completionDate: new Date("2024-06-01"), expiryDate: new Date("2027-06-01"), certificateNumber: "FICTIONAL-0100", verificationStatus: "VERIFIED", notes: null, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.employeeTraining, "training-thabo-security", { id: "training-thabo-security", workspaceId, employeeId: "employee-thabo", name: "Security awareness induction", provider: "Source IT Services", category: "Security", assignedDate: new Date("2026-07-21"), dueDate: new Date("2026-08-07"), completionDate: null, completionStatus: "ASSIGNED", score: null, expiryDate: new Date("2027-08-07"), required: true, notes: null, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.onboardingWorkflows, "onboarding-thabo", { id: "onboarding-thabo", workspaceId, employeeId: "employee-thabo", status: "IN_PROGRESS", ownerId: adminId, startedAt: new Date("2026-07-21"), completedAt: null, createdBy: adminId, updatedBy: adminId });
  const onboardingTasks = ["Confirm employee record", "Upload signed contract", "Assign laptop", "Configure MFA", "Complete security training"];
  for (const [index, title] of onboardingTasks.entries()) await upsert(collectionNames.onboardingTasks, `onboarding-thabo-task-${index + 1}`, { id: `onboarding-thabo-task-${index + 1}`, workspaceId, employeeId: "employee-thabo", workflowId: "onboarding-thabo", title, status: index === 0 ? "COMPLETED" : "NOT_STARTED", order: index + 1, required: true, dueDate: new Date(Date.now() + (index + 1) * 86_400_000), ownerId: adminId, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.employeeNotes, "note-adele-welcome", { id: "note-adele-welcome", workspaceId, employeeId: "employee-adele", authorId: adminId, category: "GENERAL", visibility: "HR", body: "Fictional development seed employee for workflow testing.", pinned: false, edited: false, createdBy: adminId, updatedBy: adminId });

  await upsert(collectionNames.attendanceProfiles, "attendance-profile-standard", { id: "attendance-profile-standard", workspaceId, name: "Standard hybrid profile", description: "Fictional development profile for normal office and remote work.", scopeType: "WORKSPACE", standardWorkingDays: ["MON", "TUE", "WED", "THU", "FRI"], standardStartTime: "08:00", standardEndTime: "17:00", expectedDailyHours: 8, expectedWeeklyHours: 40, breakEntitlementMinutes: 60, breakPaid: false, lateGraceMinutes: 15, earlyDepartureGraceMinutes: 15, overtimeAfterDailyHours: 8, overtimeMultiplier: 1.5, roundingMinutes: 1, allowedWorkModes: ["OFFICE", "REMOTE", "CLIENT_SITE"], officeRequired: false, locationVerificationRequired: false, manualEntryAllowed: false, submissionFrequency: "WEEKLY", active: true, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.workLocations, "location-source-jhb", { id: "location-source-jhb", workspaceId, name: "Source IT Services Johannesburg", locationType: "HEAD_OFFICE", address: "Fictional development address, Johannesburg", timeZone: env.DEFAULT_TIMEZONE, classification: "OFFICE", latitude: null, longitude: null, geofenceRadiusMetres: null, allowedNetworks: ["development-office-network"], verificationPolicy: "OPTIONAL", active: true, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.workLocations, "location-remote", { id: "location-remote", workspaceId, name: "Remote work", locationType: "REMOTE", address: null, timeZone: env.DEFAULT_TIMEZONE, classification: "REMOTE", latitude: null, longitude: null, geofenceRadiusMetres: null, allowedNetworks: [], verificationPolicy: "NONE", active: true, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.workSchedules, "schedule-standard-2026", { id: "schedule-standard-2026", workspaceId, name: "Standard Monday to Friday", description: "Fictional development schedule.", timeZone: env.DEFAULT_TIMEZONE, workingDays: ["MON", "TUE", "WED", "THU", "FRI"], startTime: "08:00", endTime: "17:00", expectedDailyHours: 8, breakMinutes: 60, flexibleMinutes: 30, coreStartTime: "09:00", coreEndTime: "15:00", overnight: false, effectiveStartDate: new Date("2026-01-01"), effectiveEndDate: null, active: true, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.attendanceAssignments, "attendance-assignment-workspace", { id: "attendance-assignment-workspace", workspaceId, profileId: "attendance-profile-standard", scheduleId: "schedule-standard-2026", scopeType: "WORKSPACE", active: true, createdBy: adminId, updatedBy: adminId });

  const projectSeed = [
    { id: "project-acme-m365", reference: "PRJ-2026-ACME01", name: "Acme Microsoft 365 migration", type: "M365_MIGRATION", status: "ACTIVE", priority: "HIGH", classification: "CLIENT", clientId: "acme-holdings", siteId: "acme-holdings-jhb", managerId: adminId, start: "2026-07-01", due: "2026-09-30", estimatedHours: 240, progress: 42, health: "MONITOR" },
    { id: "project-blue-network", reference: "PRJ-2026-BLUE01", name: "Blue River office network installation", type: "NETWORK_INSTALLATION", status: "AT_RISK", priority: "CRITICAL", classification: "CLIENT", clientId: "blue-river", siteId: "blue-river-dbn", managerId: adminId, start: "2026-06-15", due: "2026-08-15", estimatedHours: 180, progress: 58, health: "AT_RISK" },
    { id: "project-internal-laptop", reference: "PRJ-2026-INT01", name: "SourceHub laptop deployment", type: "HARDWARE_DEPLOYMENT", status: "COMPLETED", priority: "MEDIUM", classification: "INTERNAL", clientId: null, siteId: null, managerId: adminId, start: "2026-04-01", due: "2026-05-31", estimatedHours: 96, progress: 100, health: "COMPLETED" },
  ];
  for (const project of projectSeed) {
    await upsert(collectionNames.projects, project.id, { id: project.id, workspaceId, projectReference: project.reference, name: project.name, description: `Fictional development project for ${project.name}.`, projectType: project.type, status: project.status, priority: project.priority, classification: project.classification, clientId: project.clientId, siteId: project.siteId, managerId: project.managerId, ownerId: adminId, plannedStartDate: new Date(`${project.start}T00:00:00.000Z`), plannedCompletionDate: new Date(`${project.due}T00:00:00.000Z`), actualStartDate: new Date(`${project.start}T00:00:00.000Z`), actualCompletionDate: project.status === "COMPLETED" ? new Date(`${project.due}T00:00:00.000Z`) : null, estimatedDurationDays: 60, progressPercentage: project.progress, currentPhase: project.status === "COMPLETED" ? "Closure" : "Delivery", healthState: project.health, healthFactors: project.health === "AT_RISK" ? ["2 overdue tasks", "1 blocked task"] : [], healthCalculationVersion: 1, healthCalculatedAt: now, estimatedHours: project.estimatedHours, approvedBudget: null, internalCostEstimate: null, billable: project.classification === "CLIENT", billingMethod: project.classification === "CLIENT" ? "TIME_AND_MATERIALS" : "INTERNAL", purchaseOrderReference: project.clientId ? `PO-${project.clientId.toUpperCase()}-2026` : null, contractReference: project.clientId ? `CON-${project.clientId.toUpperCase()}-2026` : null, clientPortalVisible: project.classification === "CLIENT", archivedAt: null, completedAt: project.status === "COMPLETED" ? now : null, completionSummary: project.status === "COMPLETED" ? "Fictional deployment completed and handed over." : null, searchTokens: [project.reference.toLowerCase(), ...project.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean), project.type.toLowerCase()], createdBy: adminId, updatedBy: adminId });
    await upsert(collectionNames.projectUniqueness, `${workspaceId}:${project.reference}`, { id: `${workspaceId}:${project.reference}`, workspaceId, projectId: project.id, projectReference: project.reference });
    await upsert(collectionNames.projectMembers, `${project.id}:admin`, { id: `${project.id}:admin`, workspaceId, projectId: project.id, employeeId: "employee-adele", role: "PROJECT_MANAGER", clientVisible: false, active: true, createdBy: adminId, updatedBy: adminId });
    await upsert(collectionNames.projectStatusHistory, `${project.id}:status`, { id: `${project.id}:status`, workspaceId, projectId: project.id, fromStatus: null, toStatus: project.status, reason: "Development seed project.", changedBy: adminId, changedAt: now });
  }
  const projectTasks = [
    ["task-acme-discovery", "project-acme-m365", "PRJ-2026-ACME01-TDISC", "Discovery and tenant readiness", "COMPLETED", "HIGH", "employee-adele", "2026-07-01", "2026-07-10", 24],
    ["task-acme-pilot", "project-acme-m365", "PRJ-2026-ACME01-TPILOT", "Pilot mailbox migration", "IN_PROGRESS", "HIGH", "employee-adele", "2026-07-15", "2026-08-05", 48],
    ["task-blue-cabling", "project-blue-network", "PRJ-2026-BLUE01-TCAB", "Complete structured cabling", "BLOCKED", "CRITICAL", "employee-adele", "2026-06-20", "2026-07-20", 56],
    ["task-blue-firewall", "project-blue-network", "PRJ-2026-BLUE01-TFW", "Install replacement firewall", "TODO", "HIGH", "employee-adele", "2026-07-25", "2026-08-05", 32],
    ["task-int-handover", "project-internal-laptop", "PRJ-2026-INT01-THO", "Complete deployment handover", "COMPLETED", "MEDIUM", "employee-adele", "2026-05-20", "2026-05-31", 12],
  ];
  for (const [id, projectId, reference, title, status, priority, assigneeId, startDate, dueDate, estimatedHours] of projectTasks) await upsert(collectionNames.projectTasks, id, { id, workspaceId, projectId, taskReference: reference, title, description: `Fictional seeded task for ${title}.`, parentTaskId: null, status, priority, assigneeId, teamId: "team-service-desk", reporterId: adminId, startDate: new Date(`${startDate}T00:00:00.000Z`), dueDate: new Date(`${dueDate}T00:00:00.000Z`), completedDate: status === "COMPLETED" ? now : null, estimatedHours, loggedHours: status === "COMPLETED" ? estimatedHours : Math.round(estimatedHours / 2), billable: projectId !== "project-internal-laptop", labels: [priority.toLowerCase(), "seed"], checklist: [], progressPercentage: status === "COMPLETED" ? 100 : status === "IN_PROGRESS" ? 45 : 0, blocked: status === "BLOCKED", blockedReason: status === "BLOCKED" ? "Waiting for site access and cabling vendor." : null, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.projectMilestones, "milestone-acme-pilot", { id: "milestone-acme-pilot", workspaceId, projectId: "project-acme-m365", name: "Pilot migration complete", description: "Pilot users migrated and validated.", ownerId: adminId, plannedDate: new Date("2026-08-10T00:00:00.000Z"), actualCompletionDate: null, status: "UPCOMING", relatedTaskIds: ["task-acme-pilot"], completionCriteria: "Pilot sign-off recorded.", clientVisible: true, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.projectMilestones, "milestone-blue-handover", { id: "milestone-blue-handover", workspaceId, projectId: "project-blue-network", name: "Network handover", description: "Network installation tested and handed over.", ownerId: adminId, plannedDate: new Date("2026-08-15T00:00:00.000Z"), actualCompletionDate: null, status: "AT_RISK", relatedTaskIds: ["task-blue-cabling", "task-blue-firewall"], completionCriteria: "Test results and diagrams approved.", clientVisible: true, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.projectTaskDependencies, "dependency-blue-cabling-firewall", { id: "dependency-blue-cabling-firewall", workspaceId, projectId: "project-blue-network", predecessorTaskId: "task-blue-cabling", successorTaskId: "task-blue-firewall", dependencyType: "FINISH_TO_START", createdBy: adminId });
  await upsert(collectionNames.projectRisks, "risk-blue-access", { id: "risk-blue-access", workspaceId, projectId: "project-blue-network", type: "RISK", title: "Site access window may slip", description: "The site access window is not yet confirmed.", probability: "HIGH", impact: "HIGH", severity: "CRITICAL", ownerId: adminId, mitigationPlan: "Confirm access with the client sponsor and vendor.", contingencyPlan: "Move installation to the next approved weekend window.", targetResolutionDate: new Date("2026-07-28T00:00:00.000Z"), status: "OPEN", relatedTaskId: "task-blue-cabling", relatedMilestoneId: "milestone-blue-handover", relatedTicketId: null, createdBy: adminId, updatedBy: adminId, resolvedAt: null });
  await upsert(collectionNames.projectComments, "comment-acme-update", { id: "comment-acme-update", workspaceId, projectId: "project-acme-m365", taskId: null, authorId: adminId, body: "Fictional client-visible update: pilot validation is progressing against the agreed scope.", mentions: [], visibility: "CLIENT_VISIBLE", parentCommentId: null, editedAt: null, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.projectTimeEntries, "time-acme-discovery", { id: "time-acme-discovery", workspaceId, projectId: "project-acme-m365", taskId: "task-acme-discovery", employeeId: "employee-adele", date: new Date("2026-07-08T00:00:00.000Z"), startAt: null, endAt: null, durationMinutes: 420, description: "Discovery workshops and readiness review.", billable: true, workType: "DISCOVERY", approvalState: "APPROVED", submittedAt: new Date("2026-07-08T16:00:00.000Z"), approvedBy: adminId, approvedAt: new Date("2026-07-09T09:00:00.000Z"), rejectionReason: null, source: "MANUAL", originalDurationMinutes: 420, correctionHistory: [], createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.projectTemplates, "template-m365-migration", { id: "template-m365-migration", workspaceId, name: "Microsoft 365 migration", description: "Reusable fictional migration plan.", projectType: "M365_MIGRATION", version: 1, defaultPriority: "HIGH", phases: ["Discovery", "Pilot", "Migration", "Handover"], defaultRoles: ["PROJECT_MANAGER", "TECHNICIAN"], requiredDocuments: ["Scope", "Migration plan", "Handover"], active: true, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.projectTemplateTasks, "template-m365-discovery", { id: "template-m365-discovery", workspaceId, templateId: "template-m365-migration", title: "Discovery and tenant readiness", phase: "Discovery", estimatedHours: 24, relativeStartDay: 0, relativeDueDay: 7, defaultStatus: "TODO", defaultPriority: "HIGH", labels: ["discovery"], checklist: ["Confirm users", "Confirm domains"], order: 1, createdBy: adminId, updatedBy: adminId });

  await upsert(collectionNames.financeSettings, `${workspaceId}:default`, {
    id: `${workspaceId}:default`, workspaceId, legalCompanyName: "Source IT Services (Pty) Ltd", tradingName: "SourceHub",
    registrationNumber: "FICTIONAL-2019-000001", vatNumber: "FICTIONAL-VAT-000001", companyAddress: "Fictional development address, Johannesburg",
    billingEmail: env.DEFAULT_SUPPORT_EMAIL, telephone: env.DEFAULT_CONTACT_NUMBER, website: env.DEFAULT_WEBSITE, defaultCurrency: "ZAR",
    defaultVatRateBps: 1500, defaultPaymentTermsDays: 30, quoteValidityDays: 30, quoteNumberFormat: "Q-{YYYY}-{SEQ}",
    invoiceNumberFormat: "INV-{YYYY}-{SEQ}", creditNoteNumberFormat: "CN-{YYYY}-{SEQ}", purchaseOrderNumberFormat: "PO-{YYYY}-{SEQ}",
    expenseNumberFormat: "EXP-{YYYY}-{SEQ}", financialYearStart: "03-01", invoiceFooter: "Development data only. Not an accounting or SARS compliance record.",
    bankingDetailDisplay: false, approvalThresholds: null, createdBy: adminId, updatedBy: adminId,
  });
  for (const client of [
    ["acme-holdings", "Acme Holdings (Pty) Ltd", "finance@acme.example.invalid", "Fictional Acme billing address, Johannesburg"],
    ["blue-river", "Blue River Retail (Pty) Ltd", "accounts@blueriver.example.invalid", "Fictional Blue River billing address, Durban"],
  ]) await upsert(collectionNames.clientBillingProfiles, client[0], { id: client[0], workspaceId, clientId: client[0], legalBillingName: client[1], vatNumber: "FICTIONAL-VAT", registrationNumber: "FICTIONAL-REG", billingEmail: client[2], billingAddress: client[3], accountReference: `ACC-${client[0].toUpperCase()}`, paymentTermsDays: 30, currency: "ZAR", purchaseOrderRequired: false, defaultVatRateBps: 1500, creditLimitMinorUnits: 2500000, accountStatus: "ACTIVE", financeNotes: "Fictional development billing profile." });
  for (const supplier of [
    ["supplier-coretech", "CoreTech Distribution (Pty) Ltd", "sales@coretech.example.invalid"],
    ["supplier-cloudworks", "Cloudworks South Africa (Pty) Ltd", "accounts@cloudworks.example.invalid"],
  ]) await upsert(collectionNames.suppliers, supplier[0], { id: supplier[0], workspaceId, name: supplier[1], tradingName: supplier[1], registrationNumber: "FICTIONAL-SUPPLIER-REG", vatNumber: "FICTIONAL-SUPPLIER-VAT", category: "Technology", primaryContact: "Fictional supplier contact", email: supplier[2], telephone: "+27 11 000 2000", website: "https://example.invalid", physicalAddress: "Fictional supplier address", billingAddress: "Fictional supplier billing address", paymentTermsDays: 30, currency: "ZAR", bankingVerificationStatus: "VERIFIED", internalNotes: "Fictional development supplier.", status: "ACTIVE", createdBy: adminId, updatedBy: adminId });
  const quoteLines = [{ description: "Microsoft 365 migration planning", quantity: "1", unit: "project", unitPrice: "8500.00", unitPriceMinorUnits: 850000, discountBps: 0, vatRateBps: 1500, vatClassification: "STANDARD", lineSubtotalMinorUnits: 850000, discountMinorUnits: 0, vatMinorUnits: 127500, lineTotalMinorUnits: 977500, sortOrder: 0 }];
  await upsert(collectionNames.quotes, "quote-acme-seed", { id: "quote-acme-seed", workspaceId, quoteNumber: "Q-2026-00001", clientId: "acme-holdings", clientNameSnapshot: "Acme Holdings", quoteDate: new Date("2026-07-10T00:00:00.000Z"), expiryDate: new Date("2026-08-09T00:00:00.000Z"), currency: "ZAR", terms: "Payment due within 30 days.", clientNotes: "Fictional development quote.", internalNotes: null, purchaseOrderRequired: false, lines: quoteLines, subtotalMinorUnits: 850000, discountMinorUnits: 0, vatMinorUnits: 127500, totalMinorUnits: 977500, status: "APPROVED", approvedBy: adminId, revision: 1, createdBy: adminId, updatedBy: adminId });
  const invoiceLines = [{ description: "Managed support services", quantity: "1", unit: "month", unitPrice: "2500.00", unitPriceMinorUnits: 250000, discountBps: 0, vatRateBps: 1500, vatClassification: "STANDARD", lineSubtotalMinorUnits: 250000, discountMinorUnits: 0, vatMinorUnits: 37500, lineTotalMinorUnits: 287500, sortOrder: 0 }];
  await upsert(collectionNames.invoices, "invoice-acme-seed", { id: "invoice-acme-seed", workspaceId, invoiceNumber: "INV-2026-00001", clientId: "acme-holdings", clientNameSnapshot: "Acme Holdings", invoiceDate: new Date("2026-07-01T00:00:00.000Z"), dueDate: new Date("2026-07-31T00:00:00.000Z"), currency: "ZAR", paymentTermsDays: 30, lines: invoiceLines, subtotalMinorUnits: 250000, discountMinorUnits: 0, vatMinorUnits: 37500, totalMinorUnits: 287500, amountPaidMinorUnits: 100000, status: "PARTIALLY_PAID", createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.payments, "payment-acme-seed", { id: "payment-acme-seed", workspaceId, paymentNumber: "PAY-2026-00001", clientId: "acme-holdings", paymentDate: new Date("2026-07-15T00:00:00.000Z"), amount: "1000.00", amountMinorUnits: 100000, currency: "ZAR", method: "EFT", bankReference: "ACME-FICTIONAL-001", notes: "Fictional development receipt.", allocatedMinorUnits: 100000, status: "ALLOCATED", createdBy: adminId });
  await upsert(collectionNames.paymentAllocations, "allocation-acme-seed", { id: "allocation-acme-seed", workspaceId, paymentId: "payment-acme-seed", invoiceId: "invoice-acme-seed", amountMinorUnits: 100000, allocatedBy: adminId });
  await upsert(collectionNames.expenses, "expense-seed-cloud-hosting", { id: "expense-seed-cloud-hosting", workspaceId, employeeId: "employee-adele", supplierId: "supplier-cloudworks", category: "Cloud services", description: "Fictional cloud hosting expense", expenseDate: new Date("2026-07-12T00:00:00.000Z"), currency: "ZAR", amountExcludingVatMinorUnits: 120000, vatRateBps: 1500, vatMinorUnits: 18000, totalMinorUnits: 138000, billable: false, reimbursable: false, status: "APPROVED", approvedBy: adminId, createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.purchaseOrders, "po-seed-coretech", { id: "po-seed-coretech", workspaceId, purchaseOrderNumber: "PO-2026-00001", supplierId: "supplier-coretech", supplierNameSnapshot: "CoreTech Distribution (Pty) Ltd", requesterId: adminId, orderDate: new Date("2026-07-05T00:00:00.000Z"), expectedDeliveryDate: new Date("2026-07-25T00:00:00.000Z"), currency: "ZAR", lines: [{ description: "Fictional firewall appliance", quantity: "1", unitPriceMinorUnits: 400000, lineSubtotalMinorUnits: 400000, discountMinorUnits: 0, vatMinorUnits: 60000, lineTotalMinorUnits: 460000 }], subtotalMinorUnits: 400000, discountMinorUnits: 0, vatMinorUnits: 60000, totalMinorUnits: 460000, status: "APPROVED", createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.budgets, "budget-seed-it-2026", { id: "budget-seed-it-2026", workspaceId, name: "IT Operations FY2026", ownerId: adminId, scopeType: "department", departmentId: "department-it", periodStart: new Date("2026-03-01T00:00:00.000Z"), periodEnd: new Date("2027-02-28T00:00:00.000Z"), currency: "ZAR", approvedAmount: "50000.00", approvedAmountMinorUnits: 5000000, warningThresholdBps: 8000, criticalThresholdBps: 10000, committedMinorUnits: 460000, actualMinorUnits: 138000, status: "ACTIVE", notes: "Fictional development budget.", createdBy: adminId, updatedBy: adminId });
  await upsert(collectionNames.financialActivities, "finance-activity-seed", { id: "finance-activity-seed", workspaceId, entityType: "invoice", entityId: "invoice-acme-seed", action: "INVOICE_SEEDED", description: "Fictional development finance activity.", actorId: adminId, createdAt: now });

  const knowledgeCategories = [
    ["knowledge-service-desk", "Service Desk", "Internal troubleshooting and support runbooks.", "INTERNAL"],
    ["knowledge-microsoft-365", "Microsoft 365", "Approved Microsoft 365 guidance.", "PUBLIC"],
    ["knowledge-security", "Security", "Security procedures and policy guidance.", "INTERNAL"],
  ];
  for (const [id, name, description, area] of knowledgeCategories) await upsert(collectionNames.knowledgeCategories, id, { id, workspaceId, name, description, icon: "book-open", area, sortOrder: 10, active: true, createdBy: adminId });
  const knowledgeArticles = [
    { id: "knowledge-public-mfa", articleReference: "KB-00001", slug: "set-up-multi-factor-authentication", title: "Set up multi-factor authentication", summary: "A fictional public guide for securing a SourceHub-connected account.", contentHtml: "<h2>Before you start</h2><p>Use an approved authenticator application and keep recovery options protected.</p><ol><li>Open your account security settings.</li><li>Choose multi-factor authentication.</li><li>Complete the verification steps.</li></ol>", area: "PUBLIC", visibility: "PUBLIC", status: "PUBLISHED", articleType: "GUIDE", categoryId: "knowledge-microsoft-365", tags: ["security", "mfa"], publishedVersion: 1, publishedAt: new Date("2026-07-01T00:00:00.000Z") },
    { id: "knowledge-client-printer", articleReference: "KB-00002", slug: "acme-printer-troubleshooting", title: "Acme printer troubleshooting", summary: "Fictional client-specific steps for a shared office printer.", contentHtml: "<p>Confirm the device has power, check the network indicator, and contact the service desk if the issue continues.</p>", area: "CLIENT", visibility: "CLIENT", clientId: "acme-holdings", siteIds: ["acme-johannesburg"], status: "PUBLISHED", articleType: "TROUBLESHOOTING", categoryId: "knowledge-service-desk", tags: ["printer", "acme"], publishedVersion: 1, publishedAt: new Date("2026-07-02T00:00:00.000Z") },
    { id: "knowledge-internal-m365", articleReference: "KB-00003", slug: "m365-joiner-checklist", title: "Microsoft 365 joiner checklist", summary: "Internal checklist for onboarding a fictional employee.", contentHtml: "<h2>Checklist</h2><ul><li>Confirm approved request.</li><li>Assign the correct licence.</li><li>Record the handover.</li></ul>", area: "INTERNAL", visibility: "INTERNAL", status: "DRAFT", articleType: "CHECKLIST", categoryId: "knowledge-microsoft-365", tags: ["onboarding", "m365"] },
    { id: "knowledge-policy-access", articleReference: "KB-00004", slug: "acceptable-access-policy", title: "Acceptable access policy", summary: "Fictional development policy used to exercise acknowledgement flows.", contentHtml: "<p>Use company systems only for authorised business purposes and report suspected misuse to the service desk.</p>", area: "INTERNAL", visibility: "INTERNAL", status: "PUBLISHED", articleType: "POLICY", categoryId: "knowledge-security", tags: ["policy", "access"], publishedVersion: 1, publishedAt: new Date("2026-07-03T00:00:00.000Z"), reviewDate: new Date("2026-08-03T00:00:00.000Z") },
  ];
  for (const article of knowledgeArticles) {
    const snapshot = { title: article.title, summary: article.summary, contentHtml: article.contentHtml, contentText: article.contentHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), categoryId: article.categoryId, tags: article.tags, visibility: article.visibility, clientId: article.clientId ?? null, siteIds: article.siteIds ?? [], articleType: article.articleType, readingTimeMinutes: 3 };
    await upsert(collectionNames.knowledgeArticles, article.id, { ...article, workspaceId, authorId: adminId, ownerId: adminId, reviewerIds: [adminId], version: 1, draftVersion: 1, publishedSnapshot: article.status === "PUBLISHED" ? snapshot : null, searchTokens: [article.title, article.summary, ...article.tags].join(" ").toLowerCase().match(/[a-z0-9][a-z0-9-]{1,39}/g) ?? [], createdBy: adminId, updatedBy: adminId });
    await upsert(collectionNames.knowledgeRevisions, `${article.id}:1`, { id: `${article.id}:1`, workspaceId, articleId: article.id, version: 1, ...snapshot, immutable: true, contentHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"), changeDescription: "Seeded fictional development revision", createdBy: adminId });
    await upsert(collectionNames.knowledgeSlugUniqueness, `${workspaceId}:${article.slug}`, { id: `${workspaceId}:${article.slug}`, workspaceId, slug: article.slug });
  }
  await upsert(collectionNames.knowledgeRelations, "knowledge-relation-mfa", { id: "knowledge-relation-mfa", workspaceId, articleId: "knowledge-public-mfa", relatedArticleId: "knowledge-internal-m365", relationType: "RELATED", createdBy: adminId });
  await upsert(collectionNames.knowledgeFeedback, "knowledge-feedback-seed", { id: "knowledge-feedback-seed", workspaceId, articleId: "knowledge-public-mfa", type: "HELPFUL", comment: "Fictional seeded feedback.", anonymous: true });
  await upsert(collectionNames.policyAcknowledgements, "knowledge-ack-seed", { id: "knowledge-ack-seed", workspaceId, articleId: "knowledge-policy-access", revisionId: "knowledge-policy-access:1", userId: adminId, status: "ACKNOWLEDGED", acknowledgedAt: new Date("2026-07-10T00:00:00.000Z"), immutable: true });

  const reportingKpis = [
    ["tickets.open", "Open tickets", "Count tickets whose status is not RESOLVED or CLOSED.", "tickets", "tickets.open"],
    ["tickets.sla_compliance", "SLA compliance", "Resolved within SLA divided by measurable resolved tickets, multiplied by 100.", "tickets,slaEvents", "reports.service_desk.view"],
    ["finance.outstanding_invoices", "Outstanding invoices", "Sum of invoice totals minus authoritative amountPaidMinorUnits for issued invoices.", "invoices,paymentAllocations", "reports.finance.view"],
    ["projects.progress", "Project progress", "Completed non-cancelled tasks divided by non-cancelled tasks, multiplied by 100.", "projectTasks", "reports.projects.view"],
    ["endpoints.compliance", "Endpoint compliance", "Compliant managed endpoints divided by managed endpoints, multiplied by 100.", "endpoints", "reports.networks.view"],
    ["knowledge.helpfulness", "Knowledge helpfulness", "HELPFUL feedback divided by HELPFUL plus NOT_HELPFUL feedback, multiplied by 100.", "knowledgeFeedback", "reports.knowledge.view"],
  ];
  for (const [key, name, calculation, source, permission] of reportingKpis) await upsert(collectionNames.kpiDefinitions, key, { id: key, key, workspaceId, name, description: `Versioned KPI definition for ${name}.`, purpose: "Fictional development reporting insight.", source: source.split(","), calculation, included: "Workspace-scoped authoritative records.", excluded: "Records outside the documented scope.", dateBasis: "Source record timestamps or current state as documented.", unit: key.includes("compliance") || key.includes("helpfulness") ? "percent" : "count or minor currency units", refreshFrequency: "Hourly aggregate; eventual consistency.", owner: "Source IT Services", version: 1, effectiveFrom: "2026-01-01", requiredPermission: permission, active: true });
  for (const area of ["executive", "service-desk", "clients", "assets", "networks", "employees", "projects", "finance", "knowledge", "security"]) await upsert(collectionNames.reportingAggregates, `${workspaceId}:${area}:current`, { id: `${workspaceId}:${area}:current`, workspaceId, area, metricKey: `${area}.summary`, calculationVersion: 1, metrics: { seeded: 0 }, sourceCollections: [], periodKey: now.toISOString().slice(0, 10), dataFreshness: "SEEDED_DEVELOPMENT", generatedBy: adminId, generatedAt: now });
  await upsert(collectionNames.reportingSnapshots, `${workspaceId}:executive:day:2026-07-10`, { id: `${workspaceId}:executive:day:2026-07-10`, workspaceId, area: "executive", metricKey: "executive.summary", calculationVersion: 1, metrics: { openTickets: 12, activeClients: 2, managedAssets: 18, managedEndpoints: 14, activeProjects: 2, publishedArticles: 3 }, sourceCollections: ["tickets", "clients", "assets", "endpoints", "projects", "knowledgeArticles"], periodKey: "2026-07-10", snapshotType: "DAILY", dataFreshness: "SEEDED_DEVELOPMENT", generatedBy: adminId, generatedAt: new Date("2026-07-10T01:30:00.000Z") });
  await upsert(collectionNames.reportDefinitions, "report-definition-executive", { id: "report-definition-executive", workspaceId, area: "executive", name: "Executive dashboard", reportType: "DASHBOARD", active: true, requiredPermission: "reports.executive.view", calculationVersion: 1, createdBy: adminId });
  await upsert(collectionNames.savedReports, "saved-report-executive-seed", { id: "saved-report-executive-seed", workspaceId, ownerId: adminId, name: "Seed executive operating view", description: "Fictional saved report for development workflows.", reportType: "executive-dashboard", area: "executive", filtersJson: JSON.stringify({ preset: "this-month" }), grouping: "status", sorting: "value_desc", columns: ["metric", "value"], chartType: "KPI", sharedUserIds: [], sharedRoleIds: [], clientVisible: false, favourite: true, archivedAt: null, createdBy: adminId });
  await upsert(collectionNames.reportSchedules, "report-schedule-seed", { id: "report-schedule-seed", workspaceId, ownerId: adminId, reportId: "saved-report-executive-seed", area: "executive", frequency: "WEEKLY", timezone: env.DEFAULT_TIMEZONE, deliveryTime: "08:00", recipients: [env.DEV_ADMIN_EMAIL], format: "CSV", dateRangeBehaviour: "PREVIOUS_PERIOD", active: true, nextRunAt: new Date("2026-07-27T06:00:00.000Z"), lastResult: "SEEDED_DEVELOPMENT" });
  await upsert(collectionNames.reportExecutions, "report-execution-seed", { id: "report-execution-seed", workspaceId, ownerId: adminId, scheduleId: "report-schedule-seed", reportId: "saved-report-executive-seed", status: "COMPLETED", idempotencyKey: "seed:report-execution", generatedRowCount: 6, createdAt: new Date("2026-07-10T08:00:00.000Z"), completedAt: new Date("2026-07-10T08:01:00.000Z") });
  await upsert(collectionNames.reportExports, "report-export-seed", { id: "report-export-seed", workspaceId, requestedBy: adminId, area: "executive", format: "CSV", status: "COMPLETED", storagePath: null, rowCount: 6, expiresAt: new Date("2026-08-10T00:00:00.000Z"), idempotencyKey: "seed:report-export", createdAt: new Date("2026-07-10T08:00:00.000Z") });

  const automationTemplates = [
    ["critical-ticket-escalation", "Critical Ticket Escalation", "ticket.sla_breached", "service-desk", "Notify a manager and prepare a controlled escalation task."],
    ["client-contract-renewal", "Client Contract Renewal", "contract.expiring", "clients", "Notify the account manager and create a renewal follow-up."],
    ["asset-warranty-expiry", "Asset Warranty Expiry", "asset.warranty_expiring", "assets", "Create a maintenance task and notify the responsible technician."],
    ["endpoint-security-alert", "Endpoint Security Alert", "network.critical_alert_created", "networks", "Create an alert and notify the service desk team."],
    ["employee-onboarding", "Employee Onboarding", "employee.created", "employees", "Start an onboarding workflow and prepare account requests."],
    ["overdue-invoice-reminder", "Overdue Invoice Reminder", "finance.invoice_overdue", "finance", "Prepare a payment reminder for review."],
    ["knowledge-article-review", "Knowledge Article Review", "knowledge.article_review_due", "knowledge", "Notify reviewers when an article review is due."],
    ["executive-report", "Scheduled Executive Report", "reporting.schedule_due", "reporting", "Queue an approved executive reporting workflow."],
  ];
  for (const [id, name, triggerKey, module, description] of automationTemplates) await upsert(collectionNames.automationTemplates, id, { id, workspaceId, templateVersion: 1, name, triggerKey, module, description, requiredPermissions: ["automations.create", "automations.review", "automations.publish"], requiredIntegrations: [], definition: { trigger: { key: triggerKey }, steps: [{ id: "step_1", type: "action", action: "create_in_app_notification", name: "Notify internal owner", enabled: true, config: { title: name, message: "Review this automation template before publishing.", userId: adminId }, onError: "stop" }], retryPolicy: { maxAttempts: 2, initialDelaySeconds: 5, maxDelaySeconds: 300 }, errorHandler: "dead_letter", testMode: true }, active: true, immutable: true, createdBy: adminId, updatedBy: adminId });

  await upsert(collectionNames.aiSettings, workspaceId, { id: workspaceId, workspaceId, enabled: true, emergencyDisabled: false, allowedModules: ["tickets", "clients", "assets", "networks", "employees", "attendance", "projects", "finance", "knowledge", "reports"], dailyRequestLimit: 100, monthlyRequestLimit: 2000, retentionDays: 90, provider: env.AI_PROVIDER, modelIdentifier: env.AI_MODEL, updatedBy: adminId, updatedAt: now });
  await upsert(collectionNames.aiPromptVersions, "sourcehub-ai-v1", { id: "sourcehub-ai-v1", workspaceId, version: "sourcehub-ai-v1", purpose: "Secure SourceHub assistant baseline instructions.", active: true, createdBy: adminId, createdAt: now });
  await upsert(collectionNames.aiFeaturePolicies, "ai-policy-default", { id: "ai-policy-default", workspaceId, feature: "assistant", enabled: true, allowedRoles: ["Super Administrator", "Service Desk Manager", "Technician", "CRM Manager"], requiresConfirmationForActions: true, createdBy: adminId, updatedAt: now });

  console.log("Seeded SourceHub workspace, CRM, service desk, asset, network, employee, attendance, project, finance, knowledge, reporting, automation, and AI development data.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
