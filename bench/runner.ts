import { Semaphore } from "../src/index.ts";

const iterations = 1000;

const baseline = async (): Promise<void> => {
  for (let i = 0; i < iterations; i++) {
    await Promise.resolve(1);
  }
};

const benchAcquireRelease = async (): Promise<void> => {
  const s = new Semaphore(iterations);
  for (let i = 0; i < iterations; i++) {
    await s.acquire();
  }
  for (let i = 0; i < iterations; i++) {
    s.release();
  }
};

const benchWithLock = async (): Promise<void> => {
  const s = new Semaphore(iterations);
  const tasks = [];
  for (let i = 0; i < iterations; i++) {
    tasks.push(s.withLock(async () => 1));
  }
  await Promise.all(tasks);
};

const benchContention = async (): Promise<void> => {
  const s = new Semaphore(1);
  const tasks = Array.from({ length: 10 }, () =>
    s.withLock(async () => {
      await Bun.sleep(0);
    })
  );
  await Promise.all(tasks);
};

const benchBaselineContention = async (): Promise<void> => {
  const tasks = Array.from({ length: 10 }, () =>
    (async () => {
      await Bun.sleep(0);
    })()
  );
  await Promise.all(tasks);
};

console.log(`Benchmark: @nds-stack/bun-semaphore (${iterations} iterations each)\n`);

const results: { name: string; opsPerSec: number }[] = [];

async function run(label: string, fn: () => Promise<void>, baselineOps?: number) {
  const start = performance.now();
  await fn();
  const elapsed = (performance.now() - start) / 1000;
  const opsPerSec = iterations / elapsed;
  results.push({ name: label, opsPerSec });
  const pct = baselineOps ? ((opsPerSec / baselineOps) * 100).toFixed(1) : "-";
  console.log(
    `  ${label.padEnd(50)} ${opsPerSec.toLocaleString(undefined, { maximumFractionDigits: 0 }).padStart(12)} ops/s  ${pct !== "-" ? `${pct}%` : "baseline"}`
  );
}

// Warmup: run baseline once to warm JIT before measuring
await baseline();

const bStart = performance.now();
await baseline();
const bElapsed = (performance.now() - bStart) / 1000;
const baselineOps = iterations / bElapsed;
results.push({ name: "baseline (no semaphore)", opsPerSec: baselineOps });

console.log("=".repeat(82));
console.log(
  `  ${"Operation".padEnd(50)} ${"Throughput".padStart(12)}      vs baseline`
);
console.log("=".repeat(82));

await run("baseline (no semaphore)", baseline);
await run("acquire/release (no contention)", benchAcquireRelease, baselineOps);
await run("withLock (no contention)", benchWithLock, baselineOps);
await run("baseline contention (10 tasks)", benchBaselineContention);
// contention baseline ops — computed from the second run above (warmed)
const contentionBaselineOps = results.find(r => r.name === "baseline contention (10 tasks)")?.opsPerSec;
await run("withLock contention sem(1) × 10 tasks", benchContention, contentionBaselineOps);

console.log("=".repeat(82));
console.log();
