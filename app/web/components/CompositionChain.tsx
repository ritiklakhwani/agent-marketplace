import { TaskEvent } from "@agent-marketplace/types";

type CompositionChainProps = {
  events: TaskEvent[];
  subtitle?: string;
};

const B = "rgba(0,0,0,0.22)";

export function CompositionChain({ events, subtitle = "Portfolio → Oracle → Swap" }: CompositionChainProps) {
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
    <section className="flex-1 min-h-0 flex flex-col" style={{ borderBottom: `1px solid ${B}` }}>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${B}` }}>
        <div className="flex items-center gap-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Composition Chain</p>
          <p className="text-[12px] text-text-tertiary">{subtitle}</p>
        </div>
        <span className="text-[12px] font-medium px-3 py-1" style={{ background: "rgba(139,92,246,0.08)", color: "#7c3aed" }}>
          x402 on each edge
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {steps.length === 0 ? (
          <div className="px-6 py-10 flex items-center justify-center h-full">
            <p className="text-[13px] text-text-tertiary">No steps yet — start a task to see the chain.</p>
          </div>
        ) : (
          steps.map((step) => (
            <div
              key={`${step.stepIndex}-${step.label}`}
              className="flex items-center justify-between px-6 py-4 transition-colors duration-100"
              style={{ borderBottom: `1px solid ${B}` }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.02)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div className="flex items-center gap-4">
                <span className="text-[12px] font-mono text-text-tertiary tabular-nums">
                  {String(step.stepIndex + 1).padStart(2, "0")}
                </span>
                <span className="text-[14px] font-medium text-text-primary">{step.label}</span>
              </div>
              <span
                className="text-[12px] font-medium px-3 py-1"
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
      </div>
    </section>
  );
}
