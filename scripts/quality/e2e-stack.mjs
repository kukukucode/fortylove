import { spawn, spawnSync } from "node:child_process";

const mode = process.argv[2];
if (!new Set(["smoke", "experience", "ui"]).has(mode)) throw new Error("Usage: e2e-stack.mjs <smoke|experience|ui>");

const port = mode === "smoke" ? 3000 : 3011;
const baseUrl = `http://127.0.0.1:${port}`;
const children = [];
const appEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
  SUPABASE_SERVICE_ROLE_KEY: "test-only-key",
  SESSION_SECRET: "experience-test-only-secret-with-32-characters",
  GEMINI_API_KEY: "",
  BREVO_API_KEY: "",
};

function start(command, args, env = {}, stdio = "inherit") {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio, windowsHide: true });
  children.push(child);
  return child;
}
function finished(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`E2E command failed (${code})`)));
  });
}
function completedTestRun(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    const inspect = (chunk, target) => {
      target.write(chunk);
      output = `${output}${chunk}`.replace(/\x1b\[[0-9;]*m/g, "").slice(-20_000);
    };
    child.stdout.on("data", (chunk) => inspect(chunk, process.stdout));
    child.stderr.on("data", (chunk) => inspect(chunk, process.stderr));
    child.once("error", finish);
    child.once("exit", (code) => {
      if (code === 0 && !/\b\d+ failed\b/.test(output)) finish();
      else finish(new Error(`E2E command failed (${code})`));
    });
    const timeout = setTimeout(() => {
      stop(child);
      finish(new Error("E2E test runner timed out"));
    }, 10 * 60_000);
  });
}
async function ready(url) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return; }
    catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`E2E service not ready: ${url}`);
}
function stop(child) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
  } else if (child.exitCode === null) child.kill("SIGTERM");
}
function stopPort(targetPort) {
  if (process.platform !== "win32") return;
  const result = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8", windowsHide: true });
  const pids = new Set(String(result.stdout ?? "").split(/\r?\n/)
    .filter((line) => line.includes(`:${targetPort} `) && line.includes("LISTENING"))
    .map((line) => line.trim().split(/\s+/).at(-1))
    .filter(Boolean));
  for (const pid of pids) spawnSync("taskkill", ["/pid", pid, "/t", "/f"], { stdio: "ignore", windowsHide: true });
}

try {
  start(process.execPath, ["e2e/fixtures/experience-db.mjs"]);
  await ready("http://127.0.0.1:54329");
  await finished(start(process.execPath, ["node_modules/next/dist/bin/next", "build"], appEnv));
  start(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], appEnv);
  await ready(`${baseUrl}/login`);
  const testRuns = mode === "ui"
    ? [
        ["node_modules/@playwright/test/cli.js", "test", "e2e/public-auth.spec.ts"],
        ["node_modules/@playwright/test/cli.js", "test", "-c", "playwright.experience.config.ts"],
      ]
    : [mode === "experience"
        ? ["node_modules/@playwright/test/cli.js", "test", "-c", "playwright.experience.config.ts"]
        : ["node_modules/@playwright/test/cli.js", "test", "e2e/public-auth.spec.ts"]];
  for (const testArgs of testRuns) {
    const testProcess = start(process.execPath, testArgs, {
      E2E_EXTERNAL_TEST_SERVERS: "1",
      E2E_BASE_URL: baseUrl,
    }, ["ignore", "pipe", "pipe"]);
    await completedTestRun(testProcess);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  for (const child of children.reverse()) stop(child);
  stopPort(port);
  stopPort(54329);
}
process.exit(process.exitCode ?? 0);
