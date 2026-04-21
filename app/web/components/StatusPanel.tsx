import type { TaskEvent, ReputationUpdateEvent, InsuranceRefundEvent } from "@agent-marketplace/types";

type StatusPanelProps = {
  taskId: string | null;
  isRunning: boolean;
  events: TaskEvent[];
};

const B = "rgba(0,0,0,0.22)";

export function StatusPanel({ taskId, isRunning, events }: StatusPanelProps) {
  const reputationEvents = events.filter((e): e is ReputationUpdateEvent => e.type === "reputation_update");
  const refundEvent      = events.find( (e): e is InsuranceRefundEvent   => e.type === "insurance_refund");

  const stats = [
    { label: "Task ID", value: taskId ?? "—",               mono: true  },
    { label: "Stream",  value: isRunning ? "Live" : "Idle",  mono: false },
    { label: "Events",  value: String(events.length),        mono: true  },
  ];

  return (
    <section className="shrink-0 flex flex-col" style={{ borderBottom: `1px solid ${B}` }}>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${B}` }}>
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Task Status</p>
        {isRunning && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-positive live-dot" />
            <span className="text-[12px] font-medium text-positive/80">Live</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3" style={{ borderBottom: `1px solid ${B}` }}>
        {stats.map(({ label, value, mono }, idx) => (
          <div key={label} className="px-6 py-5" style={idx < 2 ? { borderRight: `1px solid ${B}` } : {}}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">{label}</p>
            <p className={`mt-2 text-[14px] font-medium text-text-primary truncate ${mono ? "font-mono tabular-nums" : ""}`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {reputationEvents.map((event, i) => (
        <div
          key={`${event.agent}-${i}`}
          className="px-6 py-4 text-[13px] text-text-secondary"
          style={{ borderBottom: `1px solid ${B}` }}
        >
          Rep: <span className="text-text-primary">{event.agent}</span>{" "}
          {event.delta > 0 ? "↑" : "↓"}{Math.abs(event.delta)}
        </div>
      ))}

      {refundEvent && (
        <div
          className="px-6 py-4 text-[13px] text-positive"
          style={{ borderBottom: `1px solid ${B}`, background: "var(--color-positive-dim)" }}
        >
          Refund confirmed: ${refundEvent.amount.toFixed(2)}
          {refundEvent.txSig && (
            <a
              href={`https://explorer.solana.com/tx/${refundEvent.txSig}?cluster=devnet`}
              target="_blank" rel="noreferrer"
              className="ml-3 font-mono text-[12px] opacity-60 underline hover:opacity-100"
            >
              {refundEvent.txSig.slice(0, 8)}…
            </a>
          )}
        </div>
      )}
    </section>
  );
}
