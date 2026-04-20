import { prisma } from "@/lib/prisma";
import { emitSSE } from "@/lib/sse";
import { loadAgentKeypair } from "@/lib/agentKeypair";
import { getConnection } from "@agentbazaar/solana";
import { depositForBurn, pollAttestation, receiveMessageOnEthereum } from "@/lib/cctp";
import { RemitTask } from "@agent-marketplace/types";

const AGENT_ID = "remit";

export async function POST(request: Request) {
  const { taskId, task } = (await request.json()) as {
    taskId: string;
    task: RemitTask;
  };

  try {
    const keypair = loadAgentKeypair(AGENT_ID);
    if (!keypair) throw new Error("remit keypair not found at ~/.config/solana/agents/remit.json");

    const amountMicroUsdc = BigInt(Math.round(task.amount * 1_000_000));

    // Step 0: depositForBurn on Solana — locks USDC into CCTP bridge
    emitSSE(taskId, { type: "execution_step", stepIndex: 0, label: "Burning USDC on Solana (CCTP V2)", status: "pending" });
    const burnTxSig = await depositForBurn(getConnection(), keypair, amountMicroUsdc, task.recipient);
    emitSSE(taskId, { type: "execution_step", stepIndex: 0, label: "Burning USDC on Solana (CCTP V2)", status: "complete" });

    // Step 1: Poll Circle attestation API — wait for cross-chain proof
    emitSSE(taskId, { type: "execution_step", stepIndex: 1, label: "Awaiting Circle attestation", status: "pending" });
    const { message, attestation } = await pollAttestation(burnTxSig);
    emitSSE(taskId, { type: "execution_step", stepIndex: 1, label: "Awaiting Circle attestation", status: "complete" });

    // Step 2: receiveMessage on Ethereum Sepolia — mints USDC to recipient
    emitSSE(taskId, { type: "execution_step", stepIndex: 2, label: "Minting USDC on Ethereum Sepolia", status: "pending" });
    const ethTxHash = await receiveMessageOnEthereum(message, attestation);
    emitSSE(taskId, { type: "execution_step", stepIndex: 2, label: "Minting USDC on Ethereum Sepolia", status: "complete" });

    await prisma.remitEvent.create({
      data: { taskId, amount: task.amount, recipient: task.recipient, txSig: ethTxHash, status: "completed" },
    });
    await prisma.task.update({ where: { id: taskId }, data: { status: "completed" } });
    emitSSE(taskId, { type: "task_complete" });
    return Response.json({ status: "completed", burnTxSig, ethTxHash });
  } catch (err) {
    await prisma.task.update({ where: { id: taskId }, data: { status: "failed" } }).catch(console.error);
    emitSSE(taskId, { type: "task_complete" });
    return Response.json({ error: String(err) }, { status: 500 });
  }
}