import { TaskEvent } from "@agent-marketplace/types";

type Controller = ReadableStreamDefaultController<Uint8Array>;

// Global singleton — survives Turbopack module re-instantiation across routes
const g = globalThis as typeof globalThis & {
  __sseSubscribers?: Map<string, Set<Controller>>;
};
if (!g.__sseSubscribers) g.__sseSubscribers = new Map();
const subscribers = g.__sseSubscribers;

const encoder = new TextEncoder();

export function subscribe(taskId: string, controller: Controller) {
  if (!subscribers.has(taskId)) subscribers.set(taskId, new Set());
  subscribers.get(taskId)!.add(controller);
}

export function unsubscribe(taskId: string, controller: Controller) {
  subscribers.get(taskId)?.delete(controller);
  if (subscribers.get(taskId)?.size === 0) subscribers.delete(taskId);
}

export function emitSSE(taskId: string, event: TaskEvent) {
  const controllers = subscribers.get(taskId);
  if (!controllers) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const controller of controllers) {
    try {
      controller.enqueue(encoder.encode(data));
    } catch {
      // client disconnected
    }
  }
}