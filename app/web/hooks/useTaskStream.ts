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
};

const INITIAL_STATE: StreamState = {
  taskId: null,
  isRunning: false,
  events: [],
  portfolio: initialPortfolio,
};

export function useTaskStream() {
  const [state, setState] = useState<StreamState>(INITIAL_STATE);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const reset = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    setState(INITIAL_STATE);
  };

  const startMockStream = (agent: AgentSlug, insurance: boolean) => {
    reset();

    const taskId = `mock-${Date.now()}`;
    const events = createMockTaskEvents(agent, insurance);

    setState({
      taskId,
      isRunning: true,
      events: [],
      portfolio: initialPortfolio,
    });

    events.forEach((event, index) => {
      const timer = window.setTimeout(() => {
        const parsedEvent = taskEventSchema.parse(event);
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
            taskId: current.taskId,
            isRunning: !isDone,
            events: nextEvents,
            portfolio,
          };
        });
      }, 900 * (index + 1));

      timersRef.current.push(timer);
    });
  };

  return {
    taskId: state.taskId,
    isRunning: state.isRunning,
    events: state.events,
    portfolio: state.portfolio,
    reset,
    startMockStream,
  };
}
