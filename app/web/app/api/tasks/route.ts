import { Task } from "@agent-marketplace/types";

async function callRouter(prompt: string): Promise<Task> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/agents/router`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`Router failed: ${res.status}`);
  return res.json();
}

function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(request: Request) {
  const { prompt, userWallet, insurance } = await request.json();

  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const parsed = await callRouter(prompt);

  // TODO: replace with prisma.task.create once P1's DB is ready
  const taskId = generateTaskId();

  // Fire coordinator async — don't await, let it run in background
  // TODO: replace stub with real coordinator call once built
  void fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/coordinator`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, task: parsed, userWallet, insurance }),
    }
  ).catch(() => {
    // coordinator not built yet — silent until P1's handoff
  });

  return Response.json({ taskId, task: parsed });
}