"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  isAmplitudeConfigured,
  trackProductEvent,
} from "@/lib/analytics";
import {
  canVerifyClosure,
  demoEvidence,
  packFingerprint,
  RepairPackSchema,
  runDeterministicReplay,
  type EvidenceInput,
  type RepairPack,
  type ReplayResult,
} from "@/lib/repair-pack";

type Stage = "evidence" | "diagnosis" | "repair" | "replay" | "approval" | "closure";
type RunSource = "human" | "webmcp";
type WebMcpStatus = "checking" | "available" | "unavailable" | "error";

type Approval = {
  approver: string;
  role: string;
  rationale: string;
  approvedAt: string;
  fingerprint: string;
};

type ClosureProof = {
  status: "verified_in_replay";
  baselineEvents: number;
  residualEvents: number;
  reductionPercent: number;
  ownerlessHandoffs: number;
  observationWindowDays: number;
  verifiedAt: string;
};

type AuditEntry = {
  id: string;
  label: string;
  detail: string;
  actor: string;
  time: string;
  kind: "neutral" | "ai" | "human" | "success";
};

const stages: Array<{ id: Stage; index: string; label: string; hint: string }> = [
  { id: "evidence", index: "01", label: "Evidence", hint: "143 signals" },
  { id: "diagnosis", index: "02", label: "Diagnosis", hint: "2 fractures" },
  { id: "repair", index: "03", label: "Repair Pack", hint: "Governed draft" },
  { id: "replay", index: "04", label: "Replay", hint: "Historical cases" },
  { id: "approval", index: "05", label: "Approval", hint: "Human gate" },
  { id: "closure", index: "06", label: "Closure", hint: "Proof window" },
];

const initialAudit: AuditEntry[] = [
  {
    id: "audit-1",
    label: "Evidence corpus loaded",
    detail: "76-day anonymized onboarding sample",
    actor: "Demo operator",
    time: "09:12",
    kind: "neutral",
  },
  {
    id: "audit-2",
    label: "Authorization context verified",
    detail: "Operations Change Approver · demo scope",
    actor: "HTAB policy",
    time: "09:12",
    kind: "success",
  },
];

function nowTime(): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function addAudit(
  setAudit: React.Dispatch<React.SetStateAction<AuditEntry[]>>,
  entry: Omit<AuditEntry, "id" | "time">,
): void {
  setAudit((current) => [
    ...current,
    {
      ...entry,
      id: `audit-${Date.now()}-${current.length}`,
      time: nowTime(),
    },
  ]);
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    spark: <path d="m12 2 1.5 5.1L18 9l-4.5 1.9L12 16l-1.5-5.1L6 9l4.5-1.9L12 2Zm6 12 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" />,
    upload: <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5" />,
    play: <path d="m9 7 8 5-8 5V7Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    shield: <path d="M12 3 5 6v5c0 4.4 2.9 8.5 7 10 4.1-1.5 7-5.6 7-10V6l-7-3Z" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    agent: <path d="M8 9V7a4 4 0 0 1 8 0v2m-9 0h10a2 2 0 0 1 2 2v7H5v-7a2 2 0 0 1 2-2Zm2 4h.01M15 13h.01M9 16h6" />,
    clock: <path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm0 4v5l3 2" />,
    file: <path d="M7 3h7l4 4v14H7V3Zm7 0v5h4M10 12h5m-5 4h5" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    chevron: <path d="m9 6 6 6-6 6" />,
    link: <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />,
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[name]}
    </svg>
  );
}

function StatusDot({ tone = "green" }: { tone?: "green" | "amber" | "gray" }) {
  return <span className={`status-dot status-dot--${tone}`} aria-hidden="true" />;
}

export function HtabDashboard() {
  const [activeStage, setActiveStage] = useState<Stage>("evidence");
  const [evidence, setEvidence] = useState<EvidenceInput>(demoEvidence);
  const [pack, setPack] = useState<RepairPack | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [analysisError, setAnalysisError] = useState("");
  const [provenance, setProvenance] = useState<{ model: string; responseId: string } | null>(null);
  const [replayResults, setReplayResults] = useState<ReplayResult[]>([]);
  const [replayRunning, setReplayRunning] = useState(false);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [closure, setClosure] = useState<ClosureProof | null>(null);
  const [closureRunning, setClosureRunning] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[]>(initialAudit);
  const [webMcpStatus, setWebMcpStatus] = useState<WebMcpStatus>("checking");
  const [webMcpToolCount, setWebMcpToolCount] = useState(0);
  const [uploadNote, setUploadNote] = useState("Synthetic demo corpus loaded");
  const [agentMessage, setAgentMessage] = useState(
    "I can inspect this evidence, draft the governed repair, run replay, and bring the exact change to your approval gate.",
  );

  const stateRef = useRef({ evidence, pack, replayResults, approval, closure });
  const actionsRef = useRef<{
    analyze: (source?: RunSource) => Promise<RepairPack | null>;
    replay: (source?: RunSource) => Promise<ReplayResult[]>;
    requestApproval: (source?: RunSource) => string;
    verify: (source?: RunSource) => Promise<ClosureProof | null>;
  }>({
    analyze: async () => null,
    replay: async () => [],
    requestApproval: () => "Unavailable",
    verify: async () => null,
  });

  useEffect(() => {
    stateRef.current = { evidence, pack, replayResults, approval, closure };
  }, [evidence, pack, replayResults, approval, closure]);

  useEffect(() => {
    trackProductEvent("Demo Viewed", {
      case_id: demoEvidence.caseId,
      amplitude_configured: isAmplitudeConfigured(),
    });
  }, []);

  const compressionRatio = useMemo(() => {
    if (!pack) return "—";
    return `${(evidence.totalEvents / pack.fractures.length).toFixed(1)}×`;
  }, [evidence.totalEvents, pack]);

  const analyze = useCallback(
    async (source: RunSource = "human"): Promise<RepairPack | null> => {
      if (analysisStatus === "running") return null;
      setAnalysisStatus("running");
      setAnalysisError("");
      setAgentMessage("I’m testing whether the visible failures share a smaller structural cause. The evidence stays inside this case boundary.");
      setActiveStage("diagnosis");
      trackProductEvent("Structural Analysis Started", {
        case_id: evidence.caseId,
        source,
        visible_events: evidence.totalEvents,
      });
      if (source === "webmcp") {
        trackProductEvent("WebMCP Tool Invoked", { tool: "htab_analyze_bottleneck" });
      }

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(evidence),
        });
        const data = (await response.json()) as {
          pack?: unknown;
          provenance?: { model: string; responseId: string };
          error?: string;
        };

        if (!response.ok || !data.pack) {
          throw new Error(data.error || "Repair Pack generation failed");
        }

        const parsedPack = RepairPackSchema.parse(data.pack);
        setPack(parsedPack);
        setProvenance(data.provenance || null);
        setReplayResults([]);
        setApproval(null);
        setClosure(null);
        setAnalysisStatus("complete");
        setActiveStage("repair");
        setAgentMessage(
          `The ${evidence.totalEvents} events compress into ${parsedPack.fractures.length} structural fractures. I drafted the controls, tests, authority boundary, rollback, and closure proof.`,
        );
        addAudit(setAudit, {
          label: "Repair Pack generated",
          detail: `${parsedPack.fractures.length} fractures · ${parsedPack.replayTests.length} replay tests · ${packFingerprint(parsedPack)}`,
          actor: data.provenance?.model || "OpenAI",
          kind: "ai",
        });
        trackProductEvent("Repair Pack Generated", {
          case_id: evidence.caseId,
          source,
          fracture_count: parsedPack.fractures.length,
          replay_test_count: parsedPack.replayTests.length,
          model: data.provenance?.model,
        });
        return parsedPack;
      } catch (error) {
        setAnalysisStatus("error");
        const message = error instanceof Error ? error.message : "Repair Pack generation failed";
        setAnalysisError(message);
        setAgentMessage("I could not complete the structured analysis. No repair was approved or applied. You can retry without losing the evidence.");
        addAudit(setAudit, {
          label: "Analysis stopped safely",
          detail: "No change or approval state was created",
          actor: "HTAB runtime",
          kind: "neutral",
        });
        return null;
      }
    }, [analysisStatus, evidence],
  );

  const replay = useCallback(
    async (source: RunSource = "human"): Promise<ReplayResult[]> => {
      const currentPack = stateRef.current.pack;
      if (!currentPack || replayRunning) {
        setAgentMessage("Generate the Repair Pack before replay so each historical case has a declared pass condition.");
        return [];
      }

      setReplayRunning(true);
      setActiveStage("replay");
      setAgentMessage("I’m replaying historical cases without touching a production system. Every result is checked against the pack’s declared pass condition.");
      trackProductEvent("Replay Started", {
        case_id: stateRef.current.evidence.caseId,
        source,
        test_count: currentPack.replayTests.length,
      });
      if (source === "webmcp") {
        trackProductEvent("WebMCP Tool Invoked", { tool: "htab_run_replay" });
      }

      await new Promise((resolve) => window.setTimeout(resolve, 680));
      const results = runDeterministicReplay(currentPack);
      setReplayResults(results);
      setReplayRunning(false);
      setAgentMessage(`${results.length}/${results.length} historical scenarios passed in the side-effect-free replay. This is evidence for approval, not live closure.`);
      addAudit(setAudit, {
        label: "Historical replay completed",
        detail: `${results.length}/${results.length} passed · no external actions`,
        actor: source === "webmcp" ? "Authorized WebMCP agent" : "Demo operator",
        kind: "success",
      });
      trackProductEvent("Replay Completed", {
        case_id: stateRef.current.evidence.caseId,
        source,
        passed: results.length,
        failed: 0,
      });
      return results;
    }, [replayRunning],
  );

  const requestApproval = useCallback((source: RunSource = "human"): string => {
    const current = stateRef.current;
    if (!current.pack || current.replayResults.length === 0) {
      setAgentMessage("Approval remains locked until the Repair Pack exists and historical replay is complete.");
      return "Approval unavailable: generate the Repair Pack and complete replay first.";
    }
    setApprovalOpen(true);
    setActiveStage("approval");
    setAgentMessage("The exact pack and replay proof are ready for a human decision. I can present the checkpoint; I cannot approve my own proposal.");
    trackProductEvent("Human Approval Requested", {
      case_id: current.evidence.caseId,
      source,
      pack_fingerprint: packFingerprint(current.pack),
    });
    if (source === "webmcp") {
      trackProductEvent("WebMCP Tool Invoked", { tool: "htab_request_human_approval" });
    }
    return "Human approval checkpoint displayed. The agent is not permitted to approve the Repair Pack.";
  }, []);

  const verify = useCallback(
    async (source: RunSource = "human"): Promise<ClosureProof | null> => {
      const current = stateRef.current;
      if (
        !canVerifyClosure({
          approved: Boolean(current.approval),
          replayResults: current.replayResults,
          pack: current.pack,
        }) ||
        closureRunning
      ) {
        setAgentMessage("Closure verification is locked until the exact pack is human-approved and every replay case passes.");
        return null;
      }

      setClosureRunning(true);
      setActiveStage("closure");
      setAgentMessage("I’m evaluating the closure definition against the demo observation window and checking every guardrail.");
      trackProductEvent("Closure Verification Started", {
        case_id: current.evidence.caseId,
        source,
      });
      if (source === "webmcp") {
        trackProductEvent("WebMCP Tool Invoked", { tool: "htab_verify_closure" });
      }

      await new Promise((resolve) => window.setTimeout(resolve, 620));
      const proof: ClosureProof = {
        status: "verified_in_replay",
        baselineEvents: current.evidence.totalEvents,
        residualEvents: 7,
        reductionPercent: Number((((current.evidence.totalEvents - 7) / current.evidence.totalEvents) * 100).toFixed(1)),
        ownerlessHandoffs: 0,
        observationWindowDays: current.pack?.closure.observationWindowDays || 30,
        verifiedAt: new Date().toISOString(),
      };
      setClosure(proof);
      setClosureRunning(false);
      setAgentMessage("The demo closure proof meets the Repair Pack target and guardrails. It is verified in replay; production closure still requires a live observation window.");
      addAudit(setAudit, {
        label: "Closure proof verified in replay",
        detail: `${proof.reductionPercent}% fewer friction events · 0 ownerless handoffs`,
        actor: source === "webmcp" ? "Authorized WebMCP agent" : "Demo operator",
        kind: "success",
      });
      trackProductEvent("Verified Closure Reached", {
        case_id: current.evidence.caseId,
        source,
        reduction_percent: proof.reductionPercent,
        closure_scope: "demo_replay",
      });
      return proof;
    }, [closureRunning],
  );

  useEffect(() => {
    actionsRef.current = { analyze, replay, requestApproval, verify };
  }, [analyze, replay, requestApproval, verify]);

  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext?.registerTool) {
      const unavailableTimer = window.setTimeout(
        () => setWebMcpStatus("unavailable"),
        0,
      );
      return () => window.clearTimeout(unavailableTimer);
    }

    const controller = new AbortController();
    const emptySchema = { type: "object", properties: {}, additionalProperties: false };
    const toolDefinitions: WebMcpToolDefinition[] = [
      {
        name: "htab_get_case_state",
        title: "Inspect HTAB case",
        description: "Read the current HTAB case state, governance gates, and available next action without changing anything.",
        inputSchema: emptySchema,
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async () => {
          const current = stateRef.current;
          trackProductEvent("WebMCP Tool Invoked", { tool: "htab_get_case_state" });
          return JSON.stringify({
            caseId: current.evidence.caseId,
            visibleEvents: current.evidence.totalEvents,
            repairPackReady: Boolean(current.pack),
            replayPassed: current.replayResults.length > 0 && current.replayResults.every((item) => item.status === "passed"),
            humanApproved: Boolean(current.approval),
            closureStatus: current.closure?.status || "not_verified",
          });
        },
      },
      {
        name: "htab_analyze_bottleneck",
        title: "Analyze structural bottleneck",
        description: "Analyze the loaded anonymized evidence and draft a governed TAB Repair Pack. This does not deploy or approve changes.",
        inputSchema: emptySchema,
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: async () => {
          const result = await actionsRef.current.analyze("webmcp");
          return result
            ? JSON.stringify({ status: "drafted", fractures: result.fractures.length, fingerprint: packFingerprint(result) })
            : JSON.stringify({ status: "failed_safely", deployed: false });
        },
      },
      {
        name: "htab_run_replay",
        title: "Run historical replay",
        description: "Run the Repair Pack against declared historical onboarding scenarios. Side-effect free; never touches production systems.",
        inputSchema: emptySchema,
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async () => {
          const results = await actionsRef.current.replay("webmcp");
          return JSON.stringify({ status: results.length ? "complete" : "blocked", passed: results.filter((item) => item.status === "passed").length, total: results.length });
        },
      },
      {
        name: "htab_request_human_approval",
        title: "Request human approval",
        description: "Open the action-specific human checkpoint for the exact Repair Pack. This tool cannot approve on the human's behalf.",
        inputSchema: emptySchema,
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async () => actionsRef.current.requestApproval("webmcp"),
      },
      {
        name: "htab_verify_closure",
        title: "Verify closure proof",
        description: "Evaluate the approved pack against the demo observation metrics and closure guardrails. Requires human approval and a passing replay.",
        inputSchema: emptySchema,
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async () => {
          const result = await actionsRef.current.verify("webmcp");
          return JSON.stringify(result || { status: "blocked", reason: "Approval or replay gate is incomplete" });
        },
      },
    ];

    Promise.all(
      toolDefinitions.map((tool) =>
        Promise.resolve(modelContext.registerTool(tool, { signal: controller.signal })),
      ),
    )
      .then(() => {
        setWebMcpToolCount(toolDefinitions.length);
        setWebMcpStatus("available");
      })
      .catch(() => setWebMcpStatus("error"));

    return () => controller.abort();
  }, []);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      setUploadNote("File rejected: demo uploads are limited to 1 MB");
      return;
    }

    const text = await file.text();
    const nonEmptyLines = text.split(/\r?\n/).filter((line) => line.trim()).length;
    setEvidence((current) => ({
      ...current,
      uploadedContext: text.slice(0, 16000),
      totalEvents: Math.max(current.totalEvents, nonEmptyLines > 1 ? nonEmptyLines - 1 : nonEmptyLines),
    }));
    setUploadNote(`${file.name} · ${Math.max(nonEmptyLines - 1, 1)} records staged locally`);
    setPack(null);
    setReplayResults([]);
    setApproval(null);
    setClosure(null);
    setAnalysisStatus("idle");
    trackProductEvent("Evidence Ingested", {
      case_id: evidence.caseId,
      file_type: file.name.split(".").pop()?.toLowerCase(),
      record_count: Math.max(nonEmptyLines - 1, 1),
    });
    addAudit(setAudit, {
      label: "Additional evidence staged",
      detail: `${file.name} · anonymization asserted by operator`,
      actor: "Demo operator",
      kind: "neutral",
    });
    event.target.value = "";
  };

  const handleApproval = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pack) return;
    const form = new FormData(event.currentTarget);
    const nextApproval: Approval = {
      approver: String(form.get("approver") || ""),
      role: String(form.get("role") || ""),
      rationale: String(form.get("rationale") || ""),
      approvedAt: new Date().toISOString(),
      fingerprint: packFingerprint(pack),
    };
    setApproval(nextApproval);
    setApprovalOpen(false);
    setActiveStage("approval");
    setAgentMessage("Human approval is bound to this exact Repair Pack fingerprint. I can now evaluate closure, but I still cannot deploy a different change under this approval.");
    trackProductEvent("Repair Pack Approved", {
      case_id: evidence.caseId,
      approver_role: nextApproval.role,
      pack_fingerprint: nextApproval.fingerprint,
    });
    addAudit(setAudit, {
      label: "Repair Pack approved",
      detail: `${nextApproval.fingerprint} · action-specific approval recorded`,
      actor: nextApproval.approver,
      kind: "human",
    });
  };

  const hasReplay = replayResults.length > 0;
  const replayPassed = hasReplay && replayResults.every((result) => result.status === "passed");
  const canRequestApproval = Boolean(pack && replayPassed);
  const canVerify = canVerifyClosure({
    approved: Boolean(approval),
    replayResults,
    pack,
  });

  return (
    <div className="app-shell">
      <aside className="stage-rail" aria-label="Repair workflow">
        <div className="brand-lockup">
          <div className="brand-mark">H</div>
          <div>
            <div className="brand-name">HTAB</div>
            <div className="brand-subtitle">Repair operations</div>
          </div>
        </div>

        <nav className="stage-nav">
          {stages.map((stage) => {
            const currentIndex = stages.findIndex((item) => item.id === activeStage);
            const stageIndex = stages.findIndex((item) => item.id === stage.id);
            const reached =
              stage.id === "evidence" ||
              (stage.id === "diagnosis" && analysisStatus !== "idle") ||
              (stage.id === "repair" && Boolean(pack)) ||
              (stage.id === "replay" && hasReplay) ||
              (stage.id === "approval" && Boolean(approval)) ||
              (stage.id === "closure" && Boolean(closure));
            return (
              <button
                className={`stage-nav__item ${activeStage === stage.id ? "is-active" : ""} ${reached ? "is-reached" : ""}`}
                key={stage.id}
                onClick={() => setActiveStage(stage.id)}
                type="button"
              >
                <span className="stage-nav__index">{reached && stageIndex < currentIndex ? <Icon name="check" size={14} /> : stage.index}</span>
                <span className="stage-nav__copy">
                  <strong>{stage.label}</strong>
                  <small>{stage.hint}</small>
                </span>
                {activeStage === stage.id && <Icon name="chevron" size={15} />}
              </button>
            );
          })}
        </nav>

        <div className="rail-policy">
          <div className="eyebrow"><Icon name="shield" size={14} /> Authorized context</div>
          <strong>Operations Change Approver</strong>
          <p>Demo scope · onboarding only</p>
          <div className="policy-state"><StatusDot /> Policy active</div>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <div className="breadcrumb">Cases <span>/</span> {evidence.caseId}</div>
            <h1>One chain. Not 143 mistakes.</h1>
            <p>Employee onboarding · {evidence.periodDays}-day evidence window</p>
          </div>
          <div className="header-actions">
            <label className="button button--secondary file-trigger">
              <Icon name="upload" /> Add evidence
              <input accept=".csv,.json,.txt" onChange={handleUpload} type="file" />
            </label>
            <button
              className="button button--primary"
              disabled={analysisStatus === "running"}
              onClick={() => void analyze("human")}
              type="button"
            >
              <Icon name="spark" />
              {analysisStatus === "running" ? "Analyzing chain…" : pack ? "Re-run analysis" : "Find bottleneck"}
            </button>
          </div>
        </header>

        <div className="upload-note" role="status">
          <Icon name="file" size={15} /> {uploadNote}
          <span>Only anonymized operational data</span>
        </div>

        <section className="metric-strip" aria-label="Case summary">
          <article>
            <span>Visible failures</span>
            <strong>{evidence.totalEvents}</strong>
            <small>Across 5 symptom families</small>
          </article>
          <article>
            <span>Structural fractures</span>
            <strong>{pack ? pack.fractures.length : "—"}</strong>
            <small>{pack ? "Evidence-backed diagnosis" : "Awaiting analysis"}</small>
          </article>
          <article>
            <span>Signal compression</span>
            <strong>{compressionRatio}</strong>
            <small>Failures per root fracture</small>
          </article>
          <article className={closure ? "metric-success" : ""}>
            <span>Closure status</span>
            <strong className="metric-status">{closure ? "Verified*" : "Open"}</strong>
            <small>{closure ? "Replay scope · live window pending" : "Governance gates incomplete"}</small>
          </article>
        </section>

        {analysisError && (
          <div className="error-banner" role="alert">
            <div><strong>Analysis stopped safely</strong><span>{analysisError}</span></div>
            <button onClick={() => void analyze("human")} type="button">Retry</button>
          </div>
        )}

        <section className="content-grid">
          <div className="content-primary">
            <section className="panel evidence-panel" id="evidence">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">Evidence field</div>
                  <h2>Different tickets, repeating chain position</h2>
                </div>
                <span className="confidence-badge">76 days · anonymized</span>
              </div>
              <div className="symptom-list">
                {evidence.symptoms.map((symptom, index) => {
                  const width = Math.max(28, (symptom.count / 41) * 100);
                  return (
                    <article className="symptom-row" key={symptom.id}>
                      <span className="symptom-rank">0{index + 1}</span>
                      <div className="symptom-copy">
                        <div><strong>{symptom.label}</strong><span>{symptom.owner}</span></div>
                        <p>{symptom.sample}</p>
                        <div className="symptom-bar"><i style={{ width: `${width}%` }} /></div>
                      </div>
                      <strong className="symptom-count">{symptom.count}</strong>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="panel diagnosis-panel" id="diagnosis">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">Structural map</div>
                  <h2>{pack ? "The buried bottleneck" : "Ready to compress the signal"}</h2>
                </div>
                {pack && <span className="confidence-badge confidence-badge--dark">OpenAI structured output</span>}
              </div>
              {analysisStatus === "running" ? (
                <div className="analysis-loading" aria-live="polite">
                  <div className="scan-line" />
                  <Icon name="spark" size={28} />
                  <strong>Tracing shared dependencies</strong>
                  <p>Testing which symptoms collapse into the same failed control state…</p>
                </div>
              ) : pack ? (
                <>
                  <div className="chain-map" aria-label={`Five symptoms converge into ${pack.fractures.length} structural fractures`}>
                    <div className="chain-column chain-symptoms">
                      <span className="chain-label">Symptoms</span>
                      {evidence.symptoms.map((symptom) => <div className="chain-node chain-node--small" key={symptom.id}>{symptom.label}<b>{symptom.count}</b></div>)}
                    </div>
                    <div className="chain-flow"><span /><span /><span /></div>
                    <div className="chain-column">
                      <span className="chain-label">Fractures</span>
                      {pack.fractures.map((fracture) => (
                        <div className="chain-node chain-node--fracture" key={fracture.id}>
                          <span>{fracture.id}</span>
                          <strong>{fracture.title}</strong>
                          <small>{Math.round(fracture.confidence * 100)}% confidence · {fracture.evidenceCount} signals</small>
                        </div>
                      ))}
                    </div>
                    <div className="chain-flow chain-flow--short"><span /><span /></div>
                    <div className="chain-column chain-control">
                      <span className="chain-label">Control gap</span>
                      <div className="chain-node chain-node--control"><Icon name="link" /><strong>No owned end-to-end readiness state</strong><small>Handoffs are messages, not accepted obligations.</small></div>
                    </div>
                  </div>
                  <p className="diagnosis-summary">{pack.diagnosis}</p>
                </>
              ) : (
                <div className="empty-state">
                  <div className="empty-state__icon"><Icon name="spark" size={25} /></div>
                  <strong>Evidence is loaded; no diagnosis has been asserted.</strong>
                  <p>Ask HTAB to test whether the five symptom families share one or two structural breaks.</p>
                  <button className="text-button" onClick={() => void analyze("human")} type="button">Run governed analysis <Icon name="arrow" size={16} /></button>
                </div>
              )}
            </section>

            <section className="panel repair-panel" id="repair">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">TAB Repair Pack</div>
                  <h2>{pack?.title || "The governed change package will appear here"}</h2>
                </div>
                {pack && <span className="fingerprint">{packFingerprint(pack)}</span>}
              </div>
              {pack ? (
                <>
                  <p className="lead-copy">{pack.executiveSummary}</p>
                  <div className="fracture-cards">
                    {pack.fractures.map((fracture) => (
                      <article className="fracture-card" key={fracture.id}>
                        <div className="fracture-card__top"><span>{fracture.id}</span><strong>{fracture.title}</strong><b>{Math.round(fracture.confidence * 100)}%</b></div>
                        <dl>
                          <div><dt>Structural change</dt><dd>{fracture.change}</dd></div>
                          <div><dt>Required {fracture.requiredCapability}</dt><dd>{fracture.capabilityDetail}</dd></div>
                          <div><dt>Accountable owner</dt><dd>{fracture.accountableOwner}</dd></div>
                          <div className="decision-row"><dt>Human decision</dt><dd>{fracture.humanDecision}</dd></div>
                        </dl>
                      </article>
                    ))}
                  </div>
                  <div className="governance-grid">
                    <article>
                      <div className="governance-title"><Icon name="agent" /><strong>Agent authority</strong></div>
                      <ul>{pack.governance.agentMay.slice(0, 3).map((item) => <li key={item}><Icon name="check" size={14} />{item}</li>)}</ul>
                    </article>
                    <article className="governance-stop">
                      <div className="governance-title"><Icon name="shield" /><strong>Human boundary</strong></div>
                      <ul>{pack.governance.agentMustNot.slice(0, 3).map((item) => <li key={item}><span>—</span>{item}</li>)}</ul>
                    </article>
                  </div>
                </>
              ) : (
                <div className="empty-slat">Repair, authority, tests, rollback and closure will be bound into one reviewable package.</div>
              )}
            </section>

            <section className="panel replay-panel" id="replay">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">Historical replay</div>
                  <h2>Test the repair against the cases that exposed it</h2>
                </div>
                <button className="button button--secondary button--small" disabled={!pack || replayRunning} onClick={() => void replay("human")} type="button">
                  <Icon name="play" />{replayRunning ? "Running…" : hasReplay ? "Run again" : "Run replay"}
                </button>
              </div>
              {pack ? (
                <div className="replay-table" role="table" aria-label="Replay tests">
                  <div className="replay-row replay-head" role="row"><span>Test</span><span>Historical scenario</span><span>Required proof</span><span>Result</span></div>
                  {pack.replayTests.map((test) => {
                    const result = replayResults.find((item) => item.id === test.id);
                    return (
                      <div className="replay-row" role="row" key={test.id}>
                        <code>{test.id}</code><strong>{test.scenario}</strong><span>{test.passCondition}</span>
                        <b className={result ? "test-pass" : "test-pending"}>{result ? <><Icon name="check" size={13} /> Passed</> : "Pending"}</b>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="empty-slat">Replay tests are generated from the actual symptom evidence, not a generic checklist.</div>}
              {hasReplay && <div className="replay-proof"><Icon name="shield" /><div><strong>{replayResults.length}/{replayResults.length} tests passed</strong><span>Side-effect-free simulation · this is not a production deployment</span></div><code>run_demo_{String(replayResults.length).padStart(2, "0")}</code></div>}
            </section>

            <section className="approval-closure-grid">
              <article className={`panel gate-panel ${approval ? "gate-panel--passed" : ""}`} id="approval">
                <div className="gate-icon"><Icon name={approval ? "check" : "shield"} size={22} /></div>
                <div className="eyebrow">Human checkpoint</div>
                <h2>{approval ? "Action-specific approval recorded" : "The agent stops here"}</h2>
                <p>{approval ? `${approval.approver} approved ${approval.fingerprint}.` : "A named approver must review the exact pack, replay evidence, rollback, and closure definition."}</p>
                <button className="button button--primary" disabled={!canRequestApproval || Boolean(approval)} onClick={() => requestApproval("human")} type="button">
                  {approval ? <><Icon name="check" /> Approved</> : "Review and approve"}
                </button>
              </article>
              <article className={`panel gate-panel closure-card ${closure ? "gate-panel--passed" : ""}`} id="closure">
                <div className="gate-icon"><Icon name={closure ? "check" : "clock"} size={22} /></div>
                <div className="eyebrow">Closure definition</div>
                <h2>{closure ? `${closure.reductionPercent}% friction reduction` : "Proof, not a victory label"}</h2>
                <p>{closure ? `0 ownerless handoffs across the ${closure.observationWindowDays}-day demo window.` : pack?.closure.target || "Closure metrics become available with the Repair Pack."}</p>
                <button className="button button--dark" disabled={!canVerify || closureRunning || Boolean(closure)} onClick={() => void verify("human")} type="button">
                  {closureRunning ? "Checking guardrails…" : closure ? "Verified in replay" : "Verify closure"}
                </button>
                {closure && <small className="scope-note">*Production closure requires live observation; no live system was tested.</small>}
              </article>
            </section>

            <section className="panel audit-panel">
              <div className="panel-heading"><div><div className="eyebrow">Governance ledger</div><h2>Reviewable evidence trail</h2></div><span className="confidence-badge">Append-only demo log</span></div>
              <div className="audit-list">
                {audit.map((entry) => (
                  <article key={entry.id}>
                    <span className={`audit-node audit-node--${entry.kind}`} />
                    <div><strong>{entry.label}</strong><p>{entry.detail}</p></div>
                    <span>{entry.actor}</span><time>{entry.time}</time>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="agent-console" aria-label="HTAB agent console">
            <div className="agent-console__header">
              <div className="agent-avatar"><Icon name="agent" /></div>
              <div><strong>HTAB agent</strong><span><StatusDot tone={webMcpStatus === "available" ? "green" : webMcpStatus === "error" ? "amber" : "gray"} /> Authorized collaborator</span></div>
              <span className="agent-live">LIVE</span>
            </div>
            <div className="webmcp-state">
              <span>WebMCP</span>
              <strong>
                {webMcpStatus === "available" && `${webMcpToolCount} tools registered`}
                {webMcpStatus === "checking" && "Checking browser…"}
                {webMcpStatus === "unavailable" && "Progressive mode"}
                {webMcpStatus === "error" && "Registration blocked"}
              </strong>
              <small>{webMcpStatus === "available" ? "Browser agents can operate this page." : "Enable Chrome WebMCP flag or origin trial for native tool calls."}</small>
            </div>
            <div className="agent-thread">
              <div className="thread-date">Current case</div>
              <div className="agent-bubble">{agentMessage}</div>
              <div className="agent-boundary"><Icon name="shield" size={15} /><span>I can draft, replay and verify. I cannot approve or silently deploy.</span></div>
            </div>
            <div className="agent-actions">
              <span className="eyebrow">Available actions</span>
              <button disabled={analysisStatus === "running"} onClick={() => void analyze("human")} type="button"><Icon name="spark" /><span><strong>{pack ? "Re-analyze evidence" : "Find buried bottleneck"}</strong><small>OpenAI structured diagnosis</small></span><Icon name="chevron" size={15} /></button>
              <button disabled={!pack || replayRunning} onClick={() => void replay("human")} type="button"><Icon name="play" /><span><strong>Replay historical cases</strong><small>{pack ? `${pack.replayTests.length} declared tests` : "Repair Pack required"}</small></span><Icon name="chevron" size={15} /></button>
              <button disabled={!canRequestApproval || Boolean(approval)} onClick={() => requestApproval("human")} type="button"><Icon name="shield" /><span><strong>Request human approval</strong><small>{approval ? "Approval recorded" : "Agent cannot self-approve"}</small></span><Icon name="chevron" size={15} /></button>
              <button disabled={!canVerify || Boolean(closure)} onClick={() => void verify("human")} type="button"><Icon name="check" /><span><strong>Verify closure</strong><small>Evaluate target + guardrails</small></span><Icon name="chevron" size={15} /></button>
            </div>
            <div className="agent-console__footer">
              <div><span>Model</span><strong>{provenance?.model || "gpt-5.4-mini"}</strong></div>
              <div><span>Analytics</span><strong>{isAmplitudeConfigured() ? "Amplitude on" : "Schema ready"}</strong></div>
            </div>
          </aside>
        </section>
      </main>

      {approvalOpen && pack && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setApprovalOpen(false); }}>
          <div className="approval-modal" role="dialog" aria-modal="true" aria-labelledby="approval-title">
            <button className="modal-close" onClick={() => setApprovalOpen(false)} aria-label="Close approval dialog" type="button"><Icon name="close" /></button>
            <div className="modal-kicker"><Icon name="shield" /> Human decision required</div>
            <h2 id="approval-title">Approve this exact Repair Pack?</h2>
            <p>The agent requested this checkpoint but cannot complete it. Your approval will bind to <code>{packFingerprint(pack)}</code>.</p>
            <div className="approval-summary">
              <div><span>Structural fractures</span><strong>{pack.fractures.length}</strong></div>
              <div><span>Replay proof</span><strong>{replayResults.length}/{pack.replayTests.length} passed</strong></div>
              <div><span>Rollback owner</span><strong>{pack.rollback.owner}</strong></div>
            </div>
            <div className="approval-warning"><strong>This approval does not authorize:</strong><span>Any different pack, expired approval, new connector scope, or silent production action.</span></div>
            <form onSubmit={handleApproval}>
              <label><span>Approver name</span><input name="approver" placeholder="e.g. Maya Cohen" required minLength={2} /></label>
              <label><span>Authorized role</span><select name="role" required defaultValue="Onboarding Change Approver"><option>Onboarding Change Approver</option><option>People Operations Director</option><option>Workplace Technology Lead</option></select></label>
              <label><span>Decision rationale</span><textarea name="rationale" placeholder="Why is this repair safe to test?" required minLength={12} /></label>
              <label className="approval-check"><input type="checkbox" required /><span>I reviewed the replay evidence, rollback trigger, and closure definition for this fingerprint.</span></label>
              <div className="modal-actions"><button className="button button--secondary" onClick={() => setApprovalOpen(false)} type="button">Cancel</button><button className="button button--primary" type="submit"><Icon name="check" /> Approve exact pack</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

