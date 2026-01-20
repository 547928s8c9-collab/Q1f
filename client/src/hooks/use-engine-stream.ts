import { useState, useEffect, useCallback } from "react";

export interface EngineStreamState {
  status: "idle" | "connecting" | "connected" | "error";
  lastUpdated: Date | null;
  isRunning: boolean;
  error: string | null;
}

export function useEngineStream(): EngineStreamState {
  const [state, setState] = useState<EngineStreamState>({
    status: "idle",
    lastUpdated: null,
    isRunning: false,
    error: null,
  });

  return state;
}
