"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { automationDefinitionInputSchema, automationActionSchema, automationApprovalDecisionSchema } from "@/lib/validators-automation";
import { createAutomationDraft, updateAutomationDraft, publishAutomationWorkflow, setAutomationState, rollbackAutomationWorkflow, testAutomationWorkflow, decideAutomationApproval, updateAutomationExecution } from "@/lib/automation-engine";

function stringValue(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }
function errorPath(path: string, message: string): never { redirect(`${path}?error=${encodeURIComponent(message)}`); }
function parseDefinition(value: string) { try { return JSON.parse(value); } catch { throw new Error("Workflow definition must be valid JSON."); } }
async function actor() { const user = await currentUser(); if (!user) redirect("/login"); return user; }

export async function createAutomationWorkflowAction(formData: FormData) {
  const user = await actor();
  const path = "/administration/automations/new";
  try {
    const input = automationDefinitionInputSchema.parse({ name: stringValue(formData, "name"), description: stringValue(formData, "description"), module: stringValue(formData, "module"), triggerKey: stringValue(formData, "triggerKey"), definitionJson: stringValue(formData, "definitionJson") });
    const definition = parseDefinition(input.definitionJson);
    const id = await createAutomationDraft({ actor: user, name: input.name, description: input.description, module: input.module, definition });
    revalidatePath("/administration/automations");
    redirect(`/administration/automations/${id}`);
  } catch (error: any) { if (String(error?.digest ?? "").startsWith("NEXT_REDIRECT")) throw error; errorPath(path, error?.message ?? "Unable to create workflow."); }
}

export async function updateAutomationWorkflowAction(formData: FormData) {
  const user = await actor();
  const workflowId = stringValue(formData, "workflowId");
  const path = `/administration/automations/${workflowId}`;
  try {
    const input = automationDefinitionInputSchema.parse({ name: stringValue(formData, "name"), description: stringValue(formData, "description"), module: stringValue(formData, "module"), triggerKey: stringValue(formData, "triggerKey"), definitionJson: stringValue(formData, "definitionJson") });
    await updateAutomationDraft({ actor: user, workflowId, name: input.name, description: input.description, module: input.module, definition: parseDefinition(input.definitionJson) });
    revalidatePath(path);
    redirect(`${path}?saved=1`);
  } catch (error: any) { if (String(error?.digest ?? "").startsWith("NEXT_REDIRECT")) throw error; errorPath(path, error?.message ?? "Unable to save workflow."); }
}

export async function publishAutomationWorkflowAction(formData: FormData) { const user = await actor(); const id = stringValue(formData, "workflowId"); try { await publishAutomationWorkflow(user, id); revalidatePath(`/administration/automations/${id}`); revalidatePath("/administration/automations"); redirect(`/administration/automations/${id}?published=1`); } catch (error: any) { if (String(error?.digest ?? "").startsWith("NEXT_REDIRECT")) throw error; errorPath(`/administration/automations/${id}`, error?.message ?? "Unable to publish workflow."); } }

export async function setAutomationStateAction(formData: FormData) { const user = await actor(); const id = stringValue(formData, "workflowId"); const state = stringValue(formData, "state") as "ACTIVE" | "PAUSED" | "ARCHIVED"; try { await setAutomationState(user, id, state, stringValue(formData, "reason")); revalidatePath(`/administration/automations/${id}`); revalidatePath("/administration/automations"); redirect(`/administration/automations/${id}?state=${state.toLowerCase()}`); } catch (error: any) { if (String(error?.digest ?? "").startsWith("NEXT_REDIRECT")) throw error; errorPath(`/administration/automations/${id}`, error?.message ?? "Unable to change workflow state."); } }

export async function rollbackAutomationWorkflowAction(formData: FormData) { const user = await actor(); const id = stringValue(formData, "workflowId"); try { await rollbackAutomationWorkflow(user, id, Number(stringValue(formData, "version"))); revalidatePath(`/administration/automations/${id}`); redirect(`/administration/automations/${id}?rolledBack=1`); } catch (error: any) { if (String(error?.digest ?? "").startsWith("NEXT_REDIRECT")) throw error; errorPath(`/administration/automations/${id}`, error?.message ?? "Unable to roll back workflow."); } }

export async function testAutomationWorkflowAction(formData: FormData) { const user = await actor(); const id = stringValue(formData, "workflowId"); const path = `/administration/automations/${id}`; try { const context = JSON.parse(stringValue(formData, "contextJson") || "{}"); const result = await testAutomationWorkflow(user, id, context); redirect(`${path}?dryRun=${encodeURIComponent(JSON.stringify(result).slice(0, 6000))}`); } catch (error: any) { if (String(error?.digest ?? "").startsWith("NEXT_REDIRECT")) throw error; errorPath(path, error?.message ?? "Unable to test workflow."); } }

export async function decideAutomationApprovalAction(formData: FormData) { const user = await actor(); const path = "/administration/automations/monitoring"; try { const input = automationApprovalDecisionSchema.parse({ approvalId: stringValue(formData, "approvalId"), decision: stringValue(formData, "decision"), reason: stringValue(formData, "reason") }); await decideAutomationApproval(user, input.approvalId, input.decision, input.reason); revalidatePath(path); redirect(`${path}?decision=${input.decision.toLowerCase()}`); } catch (error: any) { if (String(error?.digest ?? "").startsWith("NEXT_REDIRECT")) throw error; errorPath(path, error?.message ?? "Unable to decide approval."); } }

export async function updateAutomationExecutionAction(formData: FormData) { const user = await actor(); const executionId = stringValue(formData, "executionId"); const path = `/administration/automations/executions/${executionId}`; try { const input = automationActionSchema.parse({ executionId, mode: stringValue(formData, "mode") }); await updateAutomationExecution(user, input.executionId, input.mode); revalidatePath(path); redirect(`${path}?action=${input.mode}`); } catch (error: any) { if (String(error?.digest ?? "").startsWith("NEXT_REDIRECT")) throw error; errorPath(path, error?.message ?? "Unable to update execution."); } }
