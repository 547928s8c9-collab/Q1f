import { storage } from "../storage";
import { sessionRunner } from "./runner";
import { SimSessionStatus, SimSessionMode } from "@shared/schema";

interface SelfTestResult {
  passed: boolean;
  tests: {
    name: string;
    passed: boolean;
    details?: string;
    error?: string;
  }[];
  summary: string;
}

export async function runSimulationSelfTest(): Promise<SelfTestResult> {
  const tests: SelfTestResult["tests"] = [];
  let allPassed = true;

  console.log("[sim-selftest] Starting simulation core self-test...");

  const TEST_USER_ID = "selftest-user-" + Date.now();

  try {
    const profiles = await storage.getStrategyProfiles();
    if (profiles.length === 0) {
      await storage.seedStrategyProfiles();
    }
    const profile = (await storage.getStrategyProfiles())[0];
    
    if (!profile) {
      tests.push({
        name: "Prerequisite: Strategy profiles available",
        passed: false,
        error: "No strategy profiles found after seeding",
      });
      return {
        passed: false,
        tests,
        summary: "Self-test failed: No strategy profiles available",
      };
    }
    tests.push({
      name: "Prerequisite: Strategy profiles available",
      passed: true,
      details: `Found ${(await storage.getStrategyProfiles()).length} profiles, using: ${profile.slug}`,
    });

    const tfMs = profile.timeframe === "1h" ? 3600000 : 900000;
    const now = Date.now();
    const alignedNow = Math.floor(now / tfMs) * tfMs;
    const startMs = alignedNow - tfMs * 50;
    const endMs = alignedNow - tfMs * 10;

    const session = await storage.createSimSession({
      userId: TEST_USER_ID,
      profileSlug: profile.slug,
      symbol: profile.symbol,
      timeframe: profile.timeframe,
      startMs,
      endMs,
      speed: 100,
      mode: SimSessionMode.REPLAY,
      lagMs: 900000,
      replayMsPerCandle: 100,
      status: SimSessionStatus.CREATED,
    });

    tests.push({
      name: "Session creation with new schema fields",
      passed: true,
      details: `Created session ${session.id} with mode=${session.mode}, lagMs=${session.lagMs}, replayMsPerCandle=${session.replayMsPerCandle}`,
    });

    const transitioned = await storage.transitionSimSessionStatus(
      session.id,
      [SimSessionStatus.CREATED],
      SimSessionStatus.RUNNING
    );
    if (!transitioned) {
      tests.push({
        name: "Atomic status transition",
        passed: false,
        error: "transitionSimSessionStatus returned undefined",
      });
      allPassed = false;
    } else {
      tests.push({
        name: "Atomic status transition",
        passed: true,
        details: `CREATED → RUNNING succeeded`,
      });
    }

    const invalidTransition = await storage.transitionSimSessionStatus(
      session.id,
      [SimSessionStatus.CREATED],
      SimSessionStatus.PAUSED
    );
    if (invalidTransition) {
      tests.push({
        name: "Invalid transition rejection",
        passed: false,
        error: "Should have rejected transition from wrong status",
      });
      allPassed = false;
    } else {
      tests.push({
        name: "Invalid transition rejection",
        passed: true,
        details: "Correctly rejected CREATED→PAUSED when status was RUNNING",
      });
    }

    await storage.updateSimSession(session.id, { status: SimSessionStatus.RUNNING });

    await storage.insertSimEvent(session.id, 1, Date.now(), "test_event", { foo: "bar" });
    await storage.insertSimEvent(session.id, 2, Date.now(), "test_event_2", { baz: 123 });

    const lastSeq = await storage.getLastSimEventSeq(session.id);
    if (lastSeq === 2) {
      tests.push({
        name: "getLastSimEventSeq",
        passed: true,
        details: `Correctly returned lastSeq=2`,
      });
    } else {
      tests.push({
        name: "getLastSimEventSeq",
        passed: false,
        error: `Expected lastSeq=2, got ${lastSeq}`,
      });
      allPassed = false;
    }

    const events = await storage.getSimEvents(session.id, 1, 10);
    if (events.length !== 2) {
      tests.push({
        name: "getSimEvents with fromSeq",
        passed: false,
        error: `Expected 2 events, got ${events.length}`,
      });
      allPassed = false;
    } else {
      tests.push({
        name: "getSimEvents with fromSeq",
        passed: true,
        details: `Retrieved ${events.length} events starting from seq=1`,
      });
    }

    await storage.updateSimSession(session.id, { 
      cursorMs: startMs + tfMs * 5,
      status: SimSessionStatus.RUNNING,
    });
    const updatedSession = await storage.getSimSession(session.id);
    if (!updatedSession?.cursorMs) {
      tests.push({
        name: "cursorMs persistence",
        passed: false,
        error: "cursorMs not persisted",
      });
      allPassed = false;
    } else {
      tests.push({
        name: "cursorMs persistence",
        passed: true,
        details: `cursorMs updated to ${updatedSession.cursorMs}`,
      });
    }

    const resetCount = await storage.resetRunningSessions();
    tests.push({
      name: "resetRunningSessions",
      passed: true,
      details: `Reset ${resetCount} session(s) to PAUSED`,
    });

    const afterReset = await storage.getSimSession(session.id);
    if (afterReset?.status !== SimSessionStatus.PAUSED) {
      tests.push({
        name: "Session reset to PAUSED",
        passed: false,
        error: `Expected PAUSED, got ${afterReset?.status}`,
      });
      allPassed = false;
    } else {
      tests.push({
        name: "Session reset to PAUSED",
        passed: true,
        details: "Session correctly reset to PAUSED on restart",
      });
    }

    const liveSession = await storage.createSimSession({
      userId: TEST_USER_ID,
      profileSlug: profile.slug,
      symbol: profile.symbol,
      timeframe: profile.timeframe,
      startMs: alignedNow - tfMs * 100,
      endMs: null,
      speed: 1,
      mode: SimSessionMode.LAGGED_LIVE,
      lagMs: 900000,
      replayMsPerCandle: 15000,
      status: SimSessionStatus.CREATED,
    });

    if (liveSession.endMs !== null) {
      tests.push({
        name: "Nullable endMs for lagged_live mode",
        passed: false,
        error: `Expected endMs=null, got ${liveSession.endMs}`,
      });
      allPassed = false;
    } else {
      tests.push({
        name: "Nullable endMs for lagged_live mode",
        passed: true,
        details: "Session created with endMs=null for lagged_live mode",
      });
    }

    tests.push({
      name: "SessionRunnerManager singleton",
      passed: typeof sessionRunner.isRunning === "function",
      details: "sessionRunner instance is available with expected methods",
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    tests.push({
      name: "Unexpected error",
      passed: false,
      error: errorMessage,
    });
    allPassed = false;
  }

  const passedCount = tests.filter(t => t.passed).length;
  const summary = `Simulation selftest: ${passedCount}/${tests.length} tests passed`;

  console.log(`[sim-selftest] ${summary}`);
  for (const test of tests) {
    const status = test.passed ? "✓" : "✗";
    console.log(`[sim-selftest]   ${status} ${test.name}: ${test.details || test.error || ""}`);
  }

  return {
    passed: allPassed,
    tests,
    summary,
  };
}
