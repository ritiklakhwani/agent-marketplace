import Anthropic from "@anthropic-ai/sdk";
import { taskSchema } from "@agent-marketplace/types";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a task router for an AI agent marketplace. Parse the user's natural language request into a JSON object.

Output ONLY valid JSON matching one of these two schemas:

Rebalance task:
{ "type": "rebalance", "budget": <number in USD>, "targets": { "<SYMBOL>": <percentage 0-100>, ... } }

Remit task:
{ "type": "remit", "amount": <number in USD>, "recipient": "<solana address>" }

Rules:
- percentages must sum to 100 for rebalance tasks
- symbols should be uppercase (AAPL, TSLA, NVDA, etc.)
- output raw JSON only, no markdown, no explanation`;

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd !== -1) {
    return text.slice(braceStart, braceEnd + 1);
  }
  return text.trim();
}

export async function POST(request: Request) {
  const { prompt } = await request.json();

  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const message = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const parsed = taskSchema.safeParse(JSON.parse(extractJson(raw)));

  if (!parsed.success) {
    return Response.json(
      { error: "Failed to parse intent", details: parsed.error.issues },
      { status: 422 }
    );
  }

  return Response.json(parsed.data);
}