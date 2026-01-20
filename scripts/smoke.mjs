import { spawn } from "node:child_process";

const port = process.env.SMOKE_PORT || "5050";
const baseUrl = `http://localhost:${port}`;

const server = spawn("npm", ["run", "dev"], {
  env: { ...process.env, PORT: port, NODE_ENV: "development" },
  stdio: "inherit",
});

const timeoutMs = 60_000;
const intervalMs = 1_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHealth() {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch (error) {
      // ignore
    }
    await sleep(intervalMs);
  }
  throw new Error("Timed out waiting for /api/health");
}

async function runSmoke() {
  await waitForHealth();

  const apiRes = await fetch(`${baseUrl}/api/health`);
  if (!apiRes.ok) {
    throw new Error(`API health check failed: ${apiRes.status}`);
  }

  const uiRes = await fetch(`${baseUrl}/`);
  if (!uiRes.ok) {
    throw new Error(`UI check failed: ${uiRes.status}`);
  }
}

try {
  await runSmoke();
  // eslint-disable-next-line no-console
  console.log("Smoke checks passed.");
  server.kill();
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(error);
  server.kill();
  process.exit(1);
}
