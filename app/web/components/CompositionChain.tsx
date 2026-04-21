import { TaskEvent } from "@agent-marketplace/types";

type CompositionChainProps = {
  events: TaskEvent[];
};

const B = "rgba(0,0,0,0.08)";

export function CompositionChain({ events }: CompositionChainProps) {
  // Routes emit each step twice (pending -> complete) with the same
  // stepIndex+label. Collapse to the latest status per step so the UI shows
  // one row that animates its badge from pending to complete/failed.
  const stepsByKey = new Map<string, Extract<TaskEvent, { type: "execution_step" }>>();
  for (const event of events) {
    if (event.type !== "execution_step") continue;
    stepsByKey.set(`${event.stepIndex}-${event.label}`, event);
  }
  const steps = Array.from(stepsByKey.values());

  return (
    <section className="shrink-0 flex flex-col" style={{ borderBottom: `1px solid ${B}` }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${B}` }}>
        <div className="flex items-center gap-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Composition Chain</p>
          <p className="text-[10px] text-text-tertiary">Portfolio → Oracle → Swap</p>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5" style={{ background: "rgba(139,92,246,0.08)", color: "#7c3aed" }}>
          x402 on each edge
        </span>
      </div>

      {steps.length === 0 ? (
        <div className="px-4 py-6 flex items-center justify-center">
          <p className="text-[11px] text-text-tertiary">No steps yet — start a task to see the chain.</p>
        </div>
      ) : (
        steps.map((step) => (
          <div
            key={`${step.stepIndex}-${step.label}`}
            className="flex items-center justify-between px-4 py-2.5 transition-colors duration-100"
            style={{ borderBottom: `1px solid ${B}` }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.02)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-text-tertiary tabular-nums">
                {String(step.stepIndex + 1).padStart(2, "0")}
              </span>
              <span className="text-[11px] font-medium text-text-primary">{step.label}</span>
            </div>
            <span
              className="text-[10px] font-medium px-2 py-0.5"
              style={
                step.status === "complete"
                  ? { background: "var(--color-positive-dim)", color: "var(--color-positive)" }
                  : step.status === "failed"
                  ? { background: "var(--color-negative-dim)", color: "var(--color-negative)" }
                  : { background: "rgba(202,138,4,0.08)", color: "#92400e" }
              }
            >
              {step.status}
            </span>
          </div>
        ))
      )}
    </section>
  );
}
