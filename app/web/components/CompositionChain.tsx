import { TaskEvent } from "@agent-marketplace/types";

type CompositionChainProps = {
  events: TaskEvent[];
};

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
    <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            Composition Chain
          </p>
          <p className="text-sm text-zinc-500">
            Portfolio Agent hires Oracle, then Swap legs.
          </p>
        </div>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
          x402 payments on each edge
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {steps.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500">
            No execution steps yet. Start a task to see the agent chain.
          </p>
        ) : null}

        {steps.map((step) => (
          <div
            key={`${step.stepIndex}-${step.label}`}
            className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-zinc-900">{step.label}</p>
              <p className="text-xs text-zinc-500">Step {step.stepIndex + 1}</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                step.status === "complete"
                  ? "bg-emerald-50 text-emerald-700"
                  : step.status === "failed"
                  ? "bg-rose-50 text-rose-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {step.status}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
