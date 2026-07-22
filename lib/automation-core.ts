import { z } from "zod";

export const automationStatuses = ["DRAFT", "IN_REVIEW", "PUBLISHED", "ACTIVE", "PAUSED", "DISABLED", "ERROR", "ARCHIVED"] as const;
export type AutomationStatus = (typeof automationStatuses)[number];
export const executionStatuses = ["QUEUED", "RUNNING", "WAITING", "WAITING_FOR_APPROVAL", "RETRYING", "COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "DEAD_LETTER"] as const;
export type ExecutionStatus = (typeof executionStatuses)[number];
export const approvalStatuses = ["PENDING", "APPROVED", "REJECTED", "EXPIRED", "CANCELLED"] as const;
export type ApprovalStatus = (typeof approvalStatuses)[number];

export type AutomationModule = "service-desk" | "clients" | "assets" | "networks" | "employees" | "attendance" | "projects" | "finance" | "knowledge" | "reporting" | "platform";

type RegistryEntry = {
  key: string;
  label: string;
  module: AutomationModule;
  permission: string;
  highRisk?: boolean;
  description: string;
};

function registryEntry(key: string, label: string, module: AutomationModule, permission: string, description: string, highRisk = false): RegistryEntry {
  return { key, label, module, permission, description, ...(highRisk ? { highRisk: true } : {}) };
}

export const triggerRegistry: RegistryEntry[] = [
  ...[
    ["ticket.created", "Ticket created"], ["ticket.updated", "Ticket updated"], ["ticket.assigned", "Ticket assigned"], ["ticket.status_changed", "Ticket status changed"], ["ticket.priority_changed", "Ticket priority changed"], ["ticket.client_replied", "Client replied"], ["ticket.technician_replied", "Technician replied"], ["ticket.sla_at_risk", "SLA at risk"], ["ticket.sla_breached", "SLA breached"], ["ticket.resolved", "Ticket resolved"], ["ticket.reopened", "Ticket reopened"],
  ].map(([key, label]) => registryEntry(key, label, "service-desk", "tickets.view", `Service desk event: ${label}`)),
  ...[
    ["client.created", "Client created"], ["client.status_changed", "Client status changed"], ["client.health_changed", "Client health changed"], ["contract.created", "Contract created"], ["contract.expiring", "Contract expiring"], ["contract.expired", "Contract expired"], ["support_agreement.changed", "Support agreement changed"],
  ].map(([key, label]) => registryEntry(key, label, "clients", "clients.view", `Client event: ${label}`)),
  ...[
    ["asset.created", "Asset created"], ["asset.assigned", "Asset assigned"], ["asset.transferred", "Asset transferred"], ["asset.returned", "Asset returned"], ["asset.health_changed", "Asset health changed"], ["asset.warranty_expiring", "Warranty expiring"], ["asset.licence_expiring", "Licence expiring"], ["asset.lost_or_stolen", "Asset marked lost or stolen"],
  ].map(([key, label]) => registryEntry(key, label, "assets", "assets.view", `Asset event: ${label}`)),
  ...[
    ["endpoint.enrolled", "Endpoint enrolled"], ["endpoint.offline", "Endpoint offline"], ["endpoint.audit_received", "Endpoint audit received"], ["endpoint.compliance_changed", "Compliance changed"], ["network.alert_created", "Network alert created"], ["network.critical_alert_created", "Critical alert created"], ["network.alert_resolved", "Alert resolved"],
  ].map(([key, label]) => registryEntry(key, label, "networks", "networks.view", `Network event: ${label}`)),
  ...[
    ["employee.created", "Employee created"], ["employee.status_changed", "Employee status changed"], ["employee.onboarding_started", "Onboarding started"], ["employee.onboarding_completed", "Onboarding completed"], ["employee.offboarding_started", "Offboarding started"], ["employee.contract_expiring", "Contract expiring"], ["employee.qualification_expiring", "Qualification expiring"], ["employee.training_overdue", "Training overdue"],
  ].map(([key, label]) => registryEntry(key, label, "employees", "employees.view", `Employee event: ${label}`)),
  ...[
    ["attendance.clocked_in", "Employee clocked in"], ["attendance.clocked_out", "Employee clocked out"], ["attendance.late_arrival", "Late arrival"], ["attendance.missing_clock_out", "Missing clock-out"], ["attendance.overtime_threshold", "Overtime threshold reached"], ["attendance.correction_requested", "Correction requested"], ["attendance.timesheet_submitted", "Timesheet submitted"], ["attendance.timesheet_approved", "Timesheet approved"],
  ].map(([key, label]) => registryEntry(key, label, "attendance", "attendance.view", `Attendance event: ${label}`)),
  ...[
    ["project.created", "Project created"], ["project.approved", "Project approved"], ["project.status_changed", "Project status changed"], ["project.at_risk", "Project at risk"], ["project.task_assigned", "Task assigned"], ["project.task_overdue", "Task overdue"], ["project.task_blocked", "Task blocked"], ["project.milestone_approaching", "Milestone approaching"], ["project.milestone_missed", "Milestone missed"], ["project.completed", "Project completed"],
  ].map(([key, label]) => registryEntry(key, label, "projects", "projects.view", `Project event: ${label}`)),
  ...[
    ["finance.quote_created", "Quote created"], ["finance.quote_approved", "Quote approved"], ["finance.quote_accepted", "Quote accepted"], ["finance.invoice_issued", "Invoice issued"], ["finance.invoice_due_soon", "Invoice due soon"], ["finance.invoice_overdue", "Invoice overdue"], ["finance.payment_recorded", "Payment recorded"], ["finance.expense_submitted", "Expense submitted"], ["finance.expense_approved", "Expense approved"],
  ].map(([key, label]) => registryEntry(key, label, "finance", "finance.dashboard.view", `Finance event: ${label}`)),
  ...[
    ["knowledge.article_created", "Knowledge article created"], ["knowledge.article_review_due", "Knowledge article review due"], ["knowledge.article_expired", "Knowledge article expired"],
  ].map(([key, label]) => registryEntry(key, label, "knowledge", "knowledge.internal.view", `Knowledge event: ${label}`)),
  registryEntry("reporting.schedule_due", "Scheduled report due", "reporting", "reports.manage", "A controlled report schedule is due."),
];

export const actionRegistry: RegistryEntry[] = [
  registryEntry("create_ticket", "Create ticket", "service-desk", "tickets.create", "Create a controlled service-desk ticket."),
  registryEntry("update_ticket", "Update ticket", "service-desk", "tickets.update", "Update approved ticket fields."),
  registryEntry("assign_ticket", "Assign ticket", "service-desk", "tickets.assign", "Assign a ticket to an approved user or team."),
  registryEntry("change_priority", "Change priority", "service-desk", "tickets.update", "Change an approved ticket priority."),
  registryEntry("change_status", "Change status", "service-desk", "tickets.update", "Change an approved ticket status."),
  registryEntry("add_internal_note", "Add internal note", "service-desk", "tickets.note", "Add an internal ticket note."),
  registryEntry("add_public_reply_draft", "Add public reply draft", "service-desk", "tickets.reply", "Prepare a public reply draft for review."),
  registryEntry("create_project", "Create project", "projects", "projects.create", "Create a controlled project."),
  registryEntry("create_task", "Create task", "projects", "project_tasks.manage", "Create a project task."),
  registryEntry("assign_task", "Assign task", "projects", "project_tasks.manage", "Assign a project task."),
  registryEntry("add_client_note", "Add client note", "clients", "clients.update", "Add an internal client note."),
  registryEntry("update_client_health", "Update client health context", "clients", "clients.update", "Update approved client health context."),
  registryEntry("create_asset_task", "Create asset task", "assets", "asset_maintenance.manage", "Create an asset maintenance task."),
  registryEntry("update_asset_fields", "Update approved asset fields", "assets", "assets.update", "Update only approved asset fields."),
  registryEntry("create_alert", "Create alert", "networks", "network_alerts.manage", "Create a network alert."),
  registryEntry("acknowledge_alert", "Acknowledge alert", "networks", "network_alerts.manage", "Acknowledge a network alert."),
  registryEntry("create_onboarding", "Create onboarding workflow", "employees", "onboarding.manage", "Create an onboarding workflow."),
  registryEntry("create_offboarding_task", "Create offboarding task", "employees", "offboarding.manage", "Create an offboarding task.", true),
  registryEntry("create_knowledge_draft", "Create knowledge article draft", "knowledge", "knowledge.articles.create", "Create a knowledge article draft."),
  registryEntry("generate_report", "Generate report", "reporting", "reports.manage", "Queue a controlled report generation."),
  registryEntry("create_finance_follow_up", "Create finance follow-up task", "finance", "finance.dashboard.view", "Create a finance follow-up task."),
  registryEntry("create_in_app_notification", "Create in-app notification", "platform", "dashboard.view", "Create a scoped in-app notification."),
  registryEntry("send_approved_email", "Send approved email", "platform", "email.manage", "Send through the approved email provider.", true),
  registryEntry("prepare_email_draft", "Prepare email draft", "platform", "email.manage", "Prepare an email draft without delivery."),
  registryEntry("notify_user", "Notify user", "platform", "dashboard.view", "Notify an internal SourceHub user."),
  registryEntry("notify_team", "Notify team", "platform", "dashboard.view", "Notify an internal SourceHub team."),
  registryEntry("notify_manager", "Notify manager", "platform", "dashboard.view", "Notify an internal manager."),
  registryEntry("notify_account_manager", "Notify account manager", "clients", "clients.view", "Notify an approved account manager."),
  registryEntry("notify_client_contact", "Notify client contact", "clients", "clients.view", "Notify an approved client contact.", true),
  registryEntry("send_webhook", "Send webhook", "platform", "automations.webhooks.manage", "Send a signed outbound webhook.", true),
  registryEntry("delay", "Delay", "platform", "automations.execute", "Pause and resume at a durable future time."),
  registryEntry("wait_until", "Wait until date", "platform", "automations.execute", "Wait until a mapped date."),
  registryEntry("wait_for_condition", "Wait for condition", "platform", "automations.execute", "Wait for a condition or timeout."),
  registryEntry("stop_workflow", "Stop workflow", "platform", "automations.execute", "Stop the current execution."),
  registryEntry("require_approval", "Require approval", "platform", "automations.approve", "Pause until an authorised approver decides."),
  registryEntry("retry_action", "Retry action", "platform", "automations.retry", "Retry a failed allowlisted action."),
  registryEntry("run_child_workflow", "Run child workflow", "platform", "automations.execute", "Run another published workflow within depth limits."),
];

export const conditionOperators = ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "is_empty", "is_not_empty", "is_one_of", "is_not_one_of", "before", "after", "within_date_range", "changed_from", "changed_to"] as const;
export type ConditionOperator = (typeof conditionOperators)[number];
export type ConditionRule = { field: string; operator: ConditionOperator; value?: unknown };
export type ConditionGroup = { logic: "AND" | "OR"; conditions: Array<ConditionRule | ConditionGroup> };
export type AutomationStep = {
  id: string;
  type: "action" | "delay" | "approval" | "branch" | "stop";
  name: string;
  action?: string;
  enabled: boolean;
  conditions?: ConditionRule | ConditionGroup;
  config: Record<string, unknown>;
  onError?: "stop" | "continue" | "retry" | "dead_letter";
};
export type AutomationDefinition = {
  trigger: { key: string; conditions?: ConditionRule | ConditionGroup };
  steps: AutomationStep[];
  errorHandler?: "notify_owner" | "notify_admin" | "dead_letter" | "pause_workflow";
  retryPolicy?: { maxAttempts: number; initialDelaySeconds: number; maxDelaySeconds: number };
  testMode?: boolean;
};

export const workflowFormSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).default(""),
  module: z.string().trim().min(1).max(40),
  definitionJson: z.string().trim().min(2).max(50000),
});

export function registryEntryFor(registry: RegistryEntry[], key: string) {
  return registry.find((entry) => entry.key === key) ?? null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const conditionFields: Record<string, "string" | "number" | "boolean" | "date"> = {
  "trigger.eventType": "string", "trigger.recordId": "string", "trigger.clientId": "string", "trigger.workspaceId": "string", "trigger.status": "string", "trigger.priority": "string", "trigger.health": "string", "trigger.amountMinorUnits": "number", "previous.status": "string", "previous.priority": "string", "new.status": "string", "new.priority": "string", "new.health": "string", "metadata.source": "string", "metadata.stage": "string", "metadata.timestamp": "date",
};

function conditionCount(node: ConditionRule | ConditionGroup): number {
  return "logic" in node ? node.conditions.reduce((total, child) => total + conditionCount(child), 0) : 1;
}

export function validateConditionTree(node: unknown, maxDepth = 4): string[] {
  const errors: string[] = [];
  function visit(value: unknown, depth: number) {
    if (!isPlainObject(value)) { errors.push("Conditions must be objects."); return; }
    if (depth > maxDepth) { errors.push(`Conditions cannot be nested deeper than ${maxDepth} levels.`); return; }
    if ("logic" in value) {
      if (value.logic !== "AND" && value.logic !== "OR") errors.push("Condition groups must use AND or OR.");
      if (!Array.isArray(value.conditions) || value.conditions.length < 1 || value.conditions.length > 20) errors.push("Condition groups must contain 1 to 20 conditions.");
      else value.conditions.forEach((child) => visit(child, depth + 1));
      return;
    }
    const field = typeof value.field === "string" ? value.field : "";
    if (!Object.prototype.hasOwnProperty.call(conditionFields, field)) errors.push(`The condition field '${field || "unknown"}' is not approved.`);
    if (!conditionOperators.includes(value.operator as ConditionOperator)) errors.push("The condition operator is not approved.");
    if (field && value.value !== undefined && !validateConditionValue(conditionFields[field], value.value)) errors.push(`The value for '${field}' has the wrong type.`);
    if (field.includes("__") || field.includes("prototype") || field.includes("constructor") || Object.keys(value).some((key) => key.startsWith("__") || key.includes("prototype") || key.includes("constructor"))) errors.push("Unsafe condition property.");
  }
  visit(node, 0);
  if (isPlainObject(node) && conditionCount(node as ConditionRule | ConditionGroup) > 30) errors.push("A workflow cannot contain more than 30 conditions.");
  return errors;
}

function validateConditionValue(type: "string" | "number" | "boolean" | "date", value: unknown) {
  if (["is_empty", "is_not_empty"].includes(String(value))) return true;
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "date") return typeof value === "string" && !Number.isNaN(Date.parse(value));
  return typeof value === "string" || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

export function validateWorkflowDefinition(definition: unknown, limits = { maxSteps: 40, maxConditionDepth: 4 }): string[] {
  const errors: string[] = [];
  if (!isPlainObject(definition)) return ["Workflow definition must be an object."];
  const trigger = definition.trigger;
  if (!isPlainObject(trigger) || !registryEntryFor(triggerRegistry, String(trigger.key ?? ""))) errors.push("Select an approved trigger.");
  const triggerConditions = isPlainObject(trigger) ? trigger.conditions : undefined;
  if (isPlainObject(triggerConditions)) errors.push(...validateConditionTree(triggerConditions, limits.maxConditionDepth));
  if (!Array.isArray(definition.steps) || definition.steps.length < 1 || definition.steps.length > limits.maxSteps) errors.push(`A workflow must contain 1 to ${limits.maxSteps} steps.`);
  const ids = new Set<string>();
  if (Array.isArray(definition.steps)) for (const step of definition.steps) {
    if (!isPlainObject(step)) { errors.push("Every step must be an object."); continue; }
    const id = String(step.id ?? "");
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || ids.has(id)) errors.push("Step IDs must be unique and safe.");
    ids.add(id);
    if (!step.name || typeof step.name !== "string" || step.name.length > 160) errors.push("Every step needs a short name.");
    if (step.type === "action" && !registryEntryFor(actionRegistry, String(step.action ?? ""))) errors.push(`Action '${String(step.action ?? "unknown")}' is not approved.`);
    if (!["action", "delay", "approval", "branch", "stop"].includes(String(step.type))) errors.push("Step type is not approved.");
    if (step.conditions) errors.push(...validateConditionTree(step.conditions, limits.maxConditionDepth));
    if (step.config && !isPlainObject(step.config)) errors.push("Step configuration must be an object.");
  }
  return errors;
}

function readPath(source: unknown, path: string) {
  if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,100}$/.test(path)) return undefined;
  let current: any = source;
  for (const key of path.split(".")) {
    if (["__proto__", "prototype", "constructor"].includes(key)) return undefined;
    if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, key)) return undefined;
    current = current[key];
  }
  return current;
}

export function evaluateConditionTree(node: ConditionRule | ConditionGroup | undefined, context: Record<string, unknown>): boolean {
  if (!node) return true;
  if ("logic" in node) return node.logic === "AND" ? node.conditions.every((child) => evaluateConditionTree(child, context)) : node.conditions.some((child) => evaluateConditionTree(child, context));
  const actual = readPath(context, node.field);
  const expected = node.value;
  switch (node.operator) {
    case "equals": return actual === expected;
    case "not_equals": return actual !== expected;
    case "contains": return typeof actual === "string" && actual.toLowerCase().includes(String(expected).toLowerCase());
    case "not_contains": return typeof actual !== "string" || !actual.toLowerCase().includes(String(expected).toLowerCase());
    case "starts_with": return typeof actual === "string" && actual.startsWith(String(expected));
    case "ends_with": return typeof actual === "string" && actual.endsWith(String(expected));
    case "greater_than": return typeof actual === "number" && actual > Number(expected);
    case "greater_than_or_equal": return typeof actual === "number" && actual >= Number(expected);
    case "less_than": return typeof actual === "number" && actual < Number(expected);
    case "less_than_or_equal": return typeof actual === "number" && actual <= Number(expected);
    case "is_empty": return actual === null || actual === undefined || actual === "";
    case "is_not_empty": return !(actual === null || actual === undefined || actual === "");
    case "is_one_of": return Array.isArray(expected) && expected.includes(actual);
    case "is_not_one_of": return Array.isArray(expected) && !expected.includes(actual);
    case "before": return Date.parse(String(actual)) < Date.parse(String(expected));
    case "after": return Date.parse(String(actual)) > Date.parse(String(expected));
    case "within_date_range": return Array.isArray(expected) && expected.length === 2 && Date.parse(String(actual)) >= Date.parse(String(expected[0])) && Date.parse(String(actual)) <= Date.parse(String(expected[1]));
    case "changed_from": return context.previous !== undefined && actual === expected;
    case "changed_to": return context.new !== undefined && actual === expected;
  }
}

export function renderAutomationTemplate(template: string, context: Record<string, unknown>) {
  if (template.length > 10000) throw new Error("Automation templates cannot exceed 10,000 characters.");
  return template.replace(/{{\s*([a-zA-Z][a-zA-Z0-9_.-]{0,100})\s*}}/g, (_match, path: string) => {
    const value = readPath(context, path);
    return value === undefined || value === null ? "[missing value]" : String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
  });
}

export function conditionSummary(node: ConditionRule | ConditionGroup | undefined): string {
  if (!node) return "Always";
  if ("logic" in node) return node.conditions.map(conditionSummary).join(` ${node.logic} `);
  return `${node.field} ${node.operator.replaceAll("_", " ")} ${node.value === undefined ? "" : JSON.stringify(node.value)}`.trim();
}

export function dryRunWorkflow(definition: AutomationDefinition, context: Record<string, unknown>) {
  const triggerMatched = evaluateConditionTree(definition.trigger.conditions, context);
  const steps = definition.steps.filter((step) => step.enabled).map((step) => ({
    stepId: step.id,
    name: step.name,
    type: step.type,
    action: step.action ?? step.type,
    conditionMatched: evaluateConditionTree(step.conditions, context),
    requiresApproval: Boolean(step.action && registryEntryFor(actionRegistry, step.action)?.highRisk) || step.type === "approval",
    proposed: true,
  }));
  return { triggerMatched, steps, requiredPermissions: Array.from(new Set(definition.steps.map((step) => step.action ? registryEntryFor(actionRegistry, step.action)?.permission : "automations.execute").filter(Boolean))) };
}

export function redactAutomationData(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 100).map(redactAutomationData);
  if (!value || typeof value !== "object") return typeof value === "string" && value.length > 2000 ? `${value.slice(0, 2000)}...[truncated]` : value;
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, child]) => [key, /password|secret|token|credential|api.?key|authorization/i.test(key) ? "[REDACTED]" : redactAutomationData(child)]));
}
