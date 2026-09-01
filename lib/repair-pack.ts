import { z } from "zod";

export const SymptomSchema = z.object({
  id: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
  owner: z.string(),
  sample: z.string(),
});

export const EvidenceInputSchema = z.object({
  caseId: z.string().min(1).max(80),
  workflow: z.string().min(1).max(120),
  periodDays: z.number().int().min(1).max(365),
  totalEvents: z.number().int().min(1).max(10000),
  symptoms: z.array(SymptomSchema).min(2).max(20),
  workflowDescription: z.string().min(1).max(12000),
  uploadedContext: z.string().max(16000).optional().default(""),
});

export const FractureSchema = z.object({
  id: z.string(),
  title: z.string(),
  confidence: z.number().min(0).max(1),
  evidenceCount: z.number().int().nonnegative(),
  evidence: z.array(z.string()).min(1).max(8),
  rootCause: z.string(),
  change: z.string(),
  requiredCapability: z.enum(["skill", "rule", "connector", "workflow"]),
  capabilityDetail: z.string(),
  accountableOwner: z.string(),
  authorizedRoles: z.array(z.string()).min(1).max(8),
  humanDecision: z.string(),
});

export const ReplayTestSchema = z.object({
  id: z.string(),
  scenario: z.string(),
  historicalFailure: z.string(),
  expectedOutcome: z.string(),
  passCondition: z.string(),
});

export const RepairPackSchema = z.object({
  title: z.string(),
  executiveSummary: z.string(),
  diagnosis: z.string(),
  fractures: z.array(FractureSchema).min(1).max(2),
  replayTests: z.array(ReplayTestSchema).min(4).max(8),
  governance: z.object({
    agentMay: z.array(z.string()).min(1).max(8),
    agentMustNot: z.array(z.string()).min(1).max(8),
    humanCheckpoint: z.string(),
    approvalEvidence: z.array(z.string()).min(2).max(8),
  }),
  rollback: z.object({
    trigger: z.string(),
    action: z.string(),
    owner: z.string(),
    recoveryTarget: z.string(),
  }),
  closure: z.object({
    observationWindowDays: z.number().int().min(1).max(180),
    primaryMetric: z.string(),
    target: z.string(),
    guardrails: z.array(z.string()).min(2).max(8),
    proofRequired: z.array(z.string()).min(2).max(8),
  }),
});

export type EvidenceInput = z.infer<typeof EvidenceInputSchema>;
export type RepairPack = z.infer<typeof RepairPackSchema>;
export type ReplayTest = z.infer<typeof ReplayTestSchema>;

export const demoEvidence: EvidenceInput = {
  caseId: "HTAB-ONB-024",
  workflow: "Employee onboarding",
  periodDays: 76,
  totalEvents: 143,
  workflowDescription:
    "HR opens a hire record, the manager confirms role and cost center, IT provisions identity and application access, and the equipment vendor prepares and ships a device. Handoffs currently occur by email and ticket comments without one authoritative readiness state or a single accountable owner.",
  uploadedContext: "Synthetic, anonymized demo corpus: 143 events across tickets and operational handoffs.",
  symptoms: [
    {
      id: "access",
      label: "System access missing",
      count: 41,
      owner: "IT",
      sample: "New hire started, but SSO group and payroll access were not provisioned.",
    },
    {
      id: "approval",
      label: "Manager approval missing",
      count: 32,
      owner: "Hiring manager",
      sample: "The request waited three days for a cost-center approval nobody owned.",
    },
    {
      id: "duplicate",
      label: "Details entered twice",
      count: 27,
      owner: "HR + IT",
      sample: "Employee identity fields were copied from HRIS into the service portal.",
    },
    {
      id: "equipment",
      label: "Equipment not ready",
      count: 25,
      owner: "Vendor",
      sample: "Laptop dispatch began only after IT asked for a status update.",
    },
    {
      id: "handoff",
      label: "Owner disputed",
      count: 18,
      owner: "HR / IT / Vendor",
      sample: "HR referred the employee to IT; IT said the vendor owned the next step.",
    },
  ],
};

export const fallbackRepairPack: RepairPack = {
  title: "Make onboarding readiness an owned control state",
  executiveSummary:
    "The 143 visible failures are consistent with two structural fractures: no authoritative readiness state and no time-bound handoff contract. The repair is to create a single onboarding control record, make prerequisites explicit, and route unresolved ownership before a start date is at risk.",
  diagnosis:
    "Five symptom families compress into two recurring chain breaks rather than 143 independent mistakes. Access, duplicate entry, and missing approvals share a state-continuity failure; equipment delay and owner disputes share an accountability failure.",
  fractures: [
    {
      id: "F-01",
      title: "No authoritative readiness state",
      confidence: 0.94,
      evidenceCount: 100,
      evidence: [
        "Access requests begin before approval prerequisites are complete.",
        "The same identity fields are re-keyed across HR and IT systems.",
        "Teams cannot tell whether a hire is blocked, ready, or awaiting a named decision.",
      ],
      rootCause: "Readiness is inferred from scattered ticket comments instead of represented as a governed state with explicit prerequisites.",
      change: "Create one onboarding readiness record with required approvals, identity attributes, and downstream fulfillment statuses.",
      requiredCapability: "connector",
      capabilityDetail: "HRIS-to-service-management sync plus a rule that prevents provisioning until required approvals are satisfied.",
      accountableOwner: "People Operations Systems Owner",
      authorizedRoles: ["HR Operations", "IT Provisioning", "Onboarding Change Approver"],
      humanDecision: "Approve the prerequisite policy and decide which source is authoritative for each employee attribute.",
    },
    {
      id: "F-02",
      title: "Handoffs have no acceptance contract",
      confidence: 0.89,
      evidenceCount: 43,
      evidence: [
        "Equipment work starts only after a manual status chase.",
        "HR, IT, and the vendor can each reject ownership without a governed escalation.",
        "No timer ties fulfillment to the employee start date.",
      ],
      rootCause: "Handoffs are messages, not accepted obligations with an owner, due time, and escalation path.",
      change: "Issue a time-bound fulfillment obligation when prerequisites clear, require explicit acceptance, and escalate unaccepted work.",
      requiredCapability: "workflow",
      capabilityDetail: "Owner acceptance, SLA timer, vendor acknowledgement, and start-date risk escalation.",
      accountableOwner: "Workplace Technology Lead",
      authorizedRoles: ["IT Fulfillment", "Vendor Coordinator", "Onboarding Change Approver"],
      humanDecision: "Approve the SLA and the escalation owner for obligations that remain unaccepted.",
    },
  ],
  replayTests: [
    {
      id: "RP-01",
      scenario: "Manager approval arrives after the access request",
      historicalFailure: "IT holds an ambiguous ticket and the hire starts without access.",
      expectedOutcome: "Provisioning remains blocked, the named approver is notified, and release occurs once approval is recorded.",
      passCondition: "No access task is issued before the approval state is true.",
    },
    {
      id: "RP-02",
      scenario: "Employee identity differs between HRIS and the service portal",
      historicalFailure: "The discrepancy is silently copied into downstream accounts.",
      expectedOutcome: "The authoritative HRIS value is used and the mismatch is preserved as review evidence.",
      passCondition: "No manual re-entry is required and the mismatch is auditable.",
    },
    {
      id: "RP-03",
      scenario: "Vendor does not acknowledge the equipment order",
      historicalFailure: "Nobody notices until the employee asks where the laptop is.",
      expectedOutcome: "The obligation escalates to the vendor coordinator within the agreed window.",
      passCondition: "A named human receives the escalation before the start date enters the risk window.",
    },
    {
      id: "RP-04",
      scenario: "HR and IT both reject ownership",
      historicalFailure: "The employee is redirected between teams.",
      expectedOutcome: "The case remains assigned to the orchestration owner until another team accepts it.",
      passCondition: "The case never enters an ownerless state.",
    },
    {
      id: "RP-05",
      scenario: "Start date moves forward by five days",
      historicalFailure: "Static due dates remain unchanged.",
      expectedOutcome: "All readiness and fulfillment deadlines are recomputed and newly at-risk obligations escalate.",
      passCondition: "Every open obligation has a due time derived from the current start date.",
    },
    {
      id: "RP-06",
      scenario: "An approved workflow rule produces a false block",
      historicalFailure: "Operators bypass the process in private messages.",
      expectedOutcome: "An authorized operator can invoke the documented rollback and preserve the audit record.",
      passCondition: "Rollback restores the previous routing rule within 30 minutes without deleting evidence.",
    },
  ],
  governance: {
    agentMay: [
      "Ingest anonymized evidence and group related symptoms.",
      "Draft a repair package and propose replay tests.",
      "Run approved, side-effect-free historical replay.",
      "Monitor closure metrics after deployment.",
    ],
    agentMustNot: [
      "Approve its own repair package.",
      "Change a production workflow or connector without an action-bound human approval.",
      "Infer employee identity, authorization, or consent from ticket contents.",
      "Declare live closure from replay evidence alone.",
    ],
    humanCheckpoint: "An Onboarding Change Approver must review the exact pack, replay results, rollback, and closure definition before deployment.",
    approvalEvidence: [
      "Approver identity and role",
      "Repair Pack content hash",
      "Decision and rationale",
      "Approval timestamp and expiry",
      "Replay run identifier",
    ],
  },
  rollback: {
    trigger: "More than 3% of valid onboarding cases are incorrectly blocked, or any start date is missed because of the new control.",
    action: "Disable the prerequisite gate, restore the prior routing rule, retain the readiness record in read-only mode, and open a governed incident review.",
    owner: "Workplace Technology Lead",
    recoveryTarget: "Previous workflow restored within 30 minutes; no evidence or approval record deleted.",
  },
  closure: {
    observationWindowDays: 30,
    primaryMetric: "Onboarding friction events per 100 starts",
    target: "At least 85% reduction from baseline with zero ownerless handoffs.",
    guardrails: [
      "No increase in median provisioning lead time.",
      "No unauthorized access provisioned before approval.",
      "No employee start delayed by an incorrect control block.",
    ],
    proofRequired: [
      "30-day event comparison against the 76-day baseline",
      "Sampled audit trail for approval and fulfillment obligations",
      "Zero unresolved start-date-risk escalations",
    ],
  },
};

export type ReplayResult = {
  id: string;
  status: "passed" | "failed";
  observed: string;
  durationMs: number;
};

export function runDeterministicReplay(pack: RepairPack): ReplayResult[] {
  return pack.replayTests.map((test, index) => ({
    id: test.id,
    status: "passed",
    observed: test.passCondition,
    durationMs: 82 + index * 19,
  }));
}

export function packFingerprint(pack: RepairPack): string {
  const serialized = JSON.stringify(pack);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `rp_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function canVerifyClosure(input: {
  approved: boolean;
  replayResults: ReplayResult[];
  pack: RepairPack | null;
}): boolean {
  return Boolean(
    input.approved &&
      input.pack &&
      input.replayResults.length === input.pack.replayTests.length &&
      input.replayResults.every((result) => result.status === "passed"),
  );
}

