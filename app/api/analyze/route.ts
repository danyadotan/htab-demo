import { zodTextFormat } from "openai/helpers/zod";
import { NextResponse } from "next/server";

import { getOpenAIClient } from "@/lib/openai";
import {
  EvidenceInputSchema,
  RepairPackSchema,
  type EvidenceInput,
} from "@/lib/repair-pack";

export const runtime = "nodejs";
export const maxDuration = 60;

const RequestSchema = zodRequestSchema();

function zodRequestSchema() {
  return EvidenceInputSchema.pick({
    caseId: true,
    workflow: true,
    periodDays: true,
    totalEvents: true,
    symptoms: true,
    workflowDescription: true,
    uploadedContext: true,
  });
}

function compactEvidence(evidence: EvidenceInput): string {
  return JSON.stringify(
    {
      case_id: evidence.caseId,
      workflow: evidence.workflow,
      observation_period_days: evidence.periodDays,
      visible_events: evidence.totalEvents,
      symptom_families: evidence.symptoms,
      workflow_description: evidence.workflowDescription,
      additional_anonymized_context: evidence.uploadedContext,
    },
    null,
    2,
  );
}

export async function POST(request: Request) {
  try {
    const body = RequestSchema.parse(await request.json());
    const client = getOpenAIClient();
    const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";

    const response = await client.responses.parse({
      model,
      store: false,
      reasoning: { effort: "medium" },
      instructions: [
        "You are HTAB, a governed operational diagnosis system.",
        "Analyze anonymized operational evidence to distinguish repeated symptoms from buried structural bottlenecks.",
        "Compress the evidence into one or two defensible fractures. Do not invent people, systems, policies, or proof.",
        "Every proposed change must state the required capability, authorized roles, and an action-specific human decision.",
        "Replay tests must be grounded in the evidence, safe, deterministic, and side-effect free.",
        "Closure must require an observation window and guardrails; replay success is not production closure.",
        "Write for an operations leader: precise, compact, and auditable.",
      ].join("\n"),
      input: compactEvidence(body),
      text: {
        format: zodTextFormat(RepairPackSchema, "htab_repair_pack"),
        verbosity: "medium",
      },
    });

    if (!response.output_parsed) {
      return NextResponse.json(
        { error: "OpenAI returned no structured Repair Pack." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      pack: response.output_parsed,
      provenance: {
        mode: "openai",
        model,
        responseId: response.id,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 400;

    return NextResponse.json(
      {
        error:
          status === 503
            ? "OpenAI is not configured for this deployment."
            : "The Repair Pack could not be generated. Check the evidence and try again.",
      },
      { status },
    );
  }
}

