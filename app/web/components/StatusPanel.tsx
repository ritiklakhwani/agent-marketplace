import type { TaskEvent, ReputationUpdateEvent, InsuranceRefundEvent } from "@agent-marketplace/types";

type StatusPanelProps = {
  taskId: string | null;
  isRunning: boolean;
  events: TaskEvent[];
};

export function StatusPanel({ taskId, isRunning, events }: StatusPanelProps) {
  const reputationEvents = events.filter((e): e is ReputationUpdateEvent => e.type === "reputation_update");
  const refundEvent = events.find((e): e is InsuranceRefundEvent => e.type === "insurance_refund");

  return (
    <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-zinc-900">Task Status</p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Task Id
          </p>
          <p className="mt-2 text-sm font-medium text-zinc-900">
            {taskId ?? "Not started"}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Stream
          </p>
          <p className="mt-2 text-sm font-medium text-zinc-900">
            {isRunning ? "Streaming events" : "Idle"}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Events
          </p>
          <p className="mt-2 text-sm font-medium text-zinc-900">
            {events.length}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {reputationEvents.map((event, index) => (
          <div
            key={`${event.agent}-${index}`}
            className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700"
          >
            Reputation update: <strong>{event.agent}</strong>{" "}
            {event.delta > 0 ? "improved" : "decreased"} by {event.delta}
          </div>
        ))}

        {refundEvent ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Insurance refund queued: ${refundEvent.amount.toFixed(2)}{" "}
            {refundEvent.txSig ? `(${refundEvent.txSig})` : ""}
          </div>
        ) : null}
      </div>
    </section>
  );
}
