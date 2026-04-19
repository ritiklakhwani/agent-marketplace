"use client";

import { useEffect, useRef, useState } from "react";
import { taskEventSchema, TaskEvent } from "@agent-marketplace/types";
import { createMockTaskEvents } from "@/lib/mockData";

type StreamState = {
  taskId: string | null;
  isRunning: boolean;
  events: TaskEvent[];
};

const INITIAL_STATE: StreamState = {
  taskId: null,
  isRunning: false,
  events: [],
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

  const startMockStream = (insurance: boolean) => {
    reset();

    const taskId = `mock-${Date.now()}`;
    const events = createMockTaskEvents(insurance);

    setState({
      taskId,
      isRunning: true,
      events: [],
    });

    events.forEach((event, index) => {
      const timer = window.setTimeout(() => {
        const parsedEvent = taskEventSchema.parse(event);
        setState((current) => {
          const nextEvents = [...current.events, parsedEvent];
          const isDone = parsedEvent.type === "task_complete";

          return {
            taskId: current.taskId,
            isRunning: isDone ? false : true,
            events: nextEvents,
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
    reset,
    startMockStream,
  };
}
