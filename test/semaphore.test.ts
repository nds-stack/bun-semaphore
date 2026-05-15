import { describe, test, expect } from "bun:test";
import { Semaphore } from "../src/index.ts";

describe("Semaphore", () => {
  test("acquire/release basic", async () => {
    const s = new Semaphore(2);
    await s.acquire();
    expect(s.available).toBe(1);
    s.release();
    expect(s.available).toBe(2);
  });

  test("blocks when full", async () => {
    const s = new Semaphore(1);
    await s.acquire();
    let flag = false;
    s.acquire().then(() => { flag = true; });
    expect(flag).toBe(false);
    s.release();
    await Bun.sleep(0);
    expect(flag).toBe(true);
  });

  test("withLock acquires and releases", async () => {
    const s = new Semaphore(1);
    await s.withLock(async () => "result");
    expect(s.available).toBe(1);
  });

  test("withLock returns value", async () => {
    const s = new Semaphore(1);
    const result = await s.withLock(async () => 42);
    expect(result).toBe(42);
  });

  test("serializes concurrent access", async () => {
    const s = new Semaphore(1);
    let counter = 0;
    const tasks = Array.from({ length: 10 }, () =>
      s.withLock(async () => { counter++; await Bun.sleep(1); })
    );
    await Promise.all(tasks);
    expect(counter).toBe(10);
  });

  test("timeout rejects if not acquired", async () => {
    const s = new Semaphore(1);
    await s.acquire();
    await expect(s.acquire(10)).rejects.toThrow("timed out");
    s.release();
  });

  test("throws on invalid concurrency", () => {
    expect(() => new Semaphore(0)).toThrow();
  });
});
