"use client";

import { useEffect, useRef, useState } from "react";
import { taskEventSchema, TaskEvent } from "@agent-marketplace/types";
import { createMockTaskEvents, initialPortfolio, PortfolioRow } from "@/lib/mockData";
import { AgentSlug } from "@/lib/agents";

type StreamState = {
  taskId: string | null;
  isRunning: boolean;
  events: TaskEvent[];
  portfolio: PortfolioRow[];
  error: string | null;
};

const INITIAL_STATE: StreamState = {
  taskId: null,
  isRunning: false,
  events: [],
  portfolio: initialPortfolio,
  error: null,
};

export function useTaskStream() {
  const [state, setState] = useState<StreamState>(INITIAL_STATE);
  const timersRef = useRef<number[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      eventSourceRef.current?.close();
    };
  }, []);

  const reset = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setState(INITIAL_STATE);
  };

  const applyEvent = (parsedEvent: TaskEvent) => {
    setState((current) => {
      const nextEvents = [...current.events, parsedEvent];
      const isDone = parsedEvent.type === "task_complete";
      const hasFailed = nextEvents.some(
        (e) => e.type === "execution_step" && e.status === "failed"
      );
      const portfolio =
        isDone && !hasFailed
          ? current.portfolio.map((row) => ({ ...row, current: row.target }))
          : current.portfolio;

      return {
        ...current,
        isRunning: !isDone,
        events: nextEvents,
        portfolio,
      };
    });
  };

  // Real SSE stream — calls backend, then subscribes to live events
  const startStream = async (
    prompt: string,
    userWallet: string,
    insurance: boolean
  ) => {
    reset();
    setState((s) => ({ ...s, isRunning: true, error: null }));

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, userWallet, insurance }),
      });

      if (!res.ok) throw new Error(`Task creation failed: ${res.status}`);
      const { taskId } = await res.json();

      setState((s) => ({ ...s, taskId }));

      const es = new EventSource(`/api/sse/task/${taskId}`);
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        try {
          const parsed = taskEventSchema.parse(JSON.parse(e.data));
          applyEvent(parsed);
          if (parsed.type === "task_complete") es.close();
        } catch {
          // ignore malformed events
        }
      };

      es.onerror = () => {
        es.close();
        setState((s) => ({ ...s, isRunning: false }));
      };
    } catch (err) {
      setState((s) => ({
        ...s,
        isRunning: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  };

  // Mock stream — kept as fallback when wallet not connected
  const startMockStream = (agent: AgentSlug, insurance: boolean) => {
    reset();
    const taskId = `mock-${Date.now()}`;
    const events = createMockTaskEvents(agent, insurance);

    setState({
      taskId,
      isRunning: true,
      events: [],
      portfolio: initialPortfolio,
      error: null,
    });

    events.forEach((event, index) => {
      const timer = window.setTimeout(() => {
        const parsedEvent = taskEventSchema.parse(event);
        applyEvent(parsedEvent);
      }, 900 * (index + 1));
      timersRef.current.push(timer);
    });
  };

  return {
    taskId: state.taskId,
    isRunning: state.isRunning,
    events: state.events,
    portfolio: state.portfolio,
    error: state.error,
    reset,
    startStream,
    startMockStream,
  };
}