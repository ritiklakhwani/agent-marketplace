import { notFound } from "next/navigation";
import { AgentShell } from "@/components/AgentShell";
import { getAgentBySlug } from "@/lib/agents";

type AgentPageProps = {
  params: Promise<{
    agent: string;
  }>;
};

export default async function AgentPage({ params }: AgentPageProps) {
  const { agent: agentSlug } = await params;
  const agent = getAgentBySlug(agentSlug);

  if (!agent) {
    notFound();
  }

  return <AgentShell agent={agent} />;
}
