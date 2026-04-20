import { prisma } from "@/lib/prisma";
import { Task } from "@agent-marketplace/types";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

async function callRouter(prompt: string): Promise<Task> {
  const res = await fetch(`${BASE}/api/agents/router`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`Router failed: ${res.status}`);
  return res.json();
}

export async function POST(request: Request) {
  const { prompt, userWallet, insurance } = await request.json();

  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  try {
    const parsed = await callRouter(prompt);

    const task = await prisma.task.create({
      data: {
        userWallet: userWallet ?? "anonymous",
        type: parsed.type,
        payload: parsed,
        insurance: insurance ?? false,
      },
    });

    if (parsed.type === "remit") {
      void fetch(`${BASE}/api/agents/remit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, task: parsed }),
      }).catch(console.error);
    } else {
      void fetch(`${BASE}/api/coordinator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, task: parsed, userWallet, insurance }),
      }).catch(console.error);
    }

    return Response.json({ taskId: task.id, task: parsed });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}