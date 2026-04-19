import { z } from "zod";

export const rebalanceTaskSchema = z.object({
  type: z.literal("rebalance"),
  budget: z.number().positive(),
  targets: z.record(z.string(), z.number().min(0).max(100)),
});

export const remitTaskSchema = z.object({
  type: z.literal("remit"),
  amount: z.number().positive(),
  recipient: z.string().min(1),
});

export const taskSchema = z.union([rebalanceTaskSchema, remitTaskSchema]);

export const bidEventSchema = z.object({
  type: z.literal("bid"),
  agent: z.string(),
  feePct: z.number().nonnegative(),
});

export const winnerSelectedEventSchema = z.object({
  type: z.literal("winner_selected"),
  winner: z.string(),
  reason: z.string(),
});

export const executionStepEventSchema = z.object({
  type: z.literal("execution_step"),
  stepIndex: z.number().int().nonnegative(),
  label: z.string(),
  status: z.enum(["pending", "complete", "failed"]),
});

export const reputationUpdateEventSchema = z.object({
  type: z.literal("reputation_update"),
  agent: z.string(),
  delta: z.number().int(),
});

export const insuranceRefundEventSchema = z.object({
  type: z.literal("insurance_refund"),
  amount: z.number().nonnegative(),
  txSig: z.string().optional(),
});

export const taskCompleteEventSchema = z.object({
  type: z.literal("task_complete"),
});

export const taskEventSchema = z.union([
  bidEventSchema,
  winnerSelectedEventSchema,
  executionStepEventSchema,
  reputationUpdateEventSchema,
  insuranceRefundEventSchema,
  taskCompleteEventSchema,
]);

export type RebalanceTask = z.infer<typeof rebalanceTaskSchema>;
export type RemitTask = z.infer<typeof remitTaskSchema>;
export type Task = z.infer<typeof taskSchema>;
export type BidEvent = z.infer<typeof bidEventSchema>;
export type WinnerSelectedEvent = z.infer<typeof winnerSelectedEventSchema>;
export type ExecutionStepEvent = z.infer<typeof executionStepEventSchema>;
export type ReputationUpdateEvent = z.infer<typeof reputationUpdateEventSchema>;
export type InsuranceRefundEvent = z.infer<typeof insuranceRefundEventSchema>;
export type TaskCompleteEvent = z.infer<typeof taskCompleteEventSchema>;
export type TaskEvent = z.infer<typeof taskEventSchema>;
