import { engineScheduler } from "./engineScheduler";

export async function initializeEngineScheduler(): Promise<void> {
  engineScheduler.start();
}

export async function registerEngineLoop(userId: string, strategyId: string): Promise<void> {
}
