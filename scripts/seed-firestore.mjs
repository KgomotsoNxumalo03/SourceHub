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

  console.log("Seeded SourceHub workspace, CRM records, SLAs, automations, and service desk data.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
