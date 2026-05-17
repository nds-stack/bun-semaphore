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
    expect(() => new Semaphore(0)).toThrow("positive integer");
  });

  test("release without acquire does not exceed max", () => {
    const s = new Semaphore(2);
    expect(s.available).toBe(2);
    s.release();
    expect(s.available).toBe(2);
    s.release();
    s.release();
    expect(s.available).toBe(2);
  });

  test("acquire with timeout = 0 behaves like no timeout", async () => {
    const s = new Semaphore(1);
    await s.acquire(0);
    expect(s.available).toBe(0);
    s.release();
    expect(s.available).toBe(1);
  });

  test("acquire with timeout that does not fire", async () => {
    const s = new Semaphore(1);
    await s.acquire();
    const p = s.acquire(500);
    s.release();
    await p;
    expect(s.available).toBe(0);
    s.release();
  });

  test("withLock propagates errors and releases semaphore", async () => {
    const s = new Semaphore(1);
    await expect(
      s.withLock(async () => { throw new Error("boom"); })
    ).rejects.toThrow("boom");
    expect(s.available).toBe(1);
  });

  test("multiple acquires and releases in sequence", async () => {
    const s = new Semaphore(3);
    await s.acquire();
    await s.acquire();
    await s.acquire();
    expect(s.available).toBe(0);
    s.release();
    s.release();
    s.release();
    expect(s.available).toBe(3);
  });

  test("pending count tracking", async () => {
    const s = new Semaphore(1);
    await s.acquire();
    const p1 = s.acquire();
    const p2 = s.acquire();
    expect(s.pending).toBe(2);
    s.release();
    await p1;
    expect(s.pending).toBe(1);
    s.release();
    await p2;
    expect(s.pending).toBe(0);
  });

  test("withLock with custom timeout", async () => {
    const s = new Semaphore(1);
    await s.acquire();
    await expect(
      s.withLock(async () => "too late", 10)
    ).rejects.toThrow("timed out");
    s.release();
  });

  test("fairness: FIFO order of waiters", async () => {
    const s = new Semaphore(1);
    await s.acquire();
    const order: number[] = [];
    const p1 = s.acquire().then(() => order.push(1));
    const p2 = s.acquire().then(() => order.push(2));
    const p3 = s.acquire().then(() => order.push(3));
    s.release();
    await p1;
    expect(order).toEqual([1]);
    s.release();
    await p2;
    expect(order).toEqual([1, 2]);
    s.release();
    await p3;
    expect(order).toEqual([1, 2, 3]);
  });

  test("available count cannot exceed max after many releases", async () => {
    const s = new Semaphore(2);
    await s.acquire();
    expect(s.available).toBe(1);
    s.release();
    s.release();
    s.release();
    s.release();
    expect(s.available).toBe(2);
  });

  test("throws on NaN constructor", () => {
    expect(() => new Semaphore(NaN)).toThrow("positive integer");
  });

  test("throws on Infinity constructor", () => {
    expect(() => new Semaphore(Infinity)).toThrow("positive integer");
  });

  test("throws on float constructor", () => {
    expect(() => new Semaphore(1.5)).toThrow("positive integer");
  });

  test("throws on negative constructor", () => {
    expect(() => new Semaphore(-1)).toThrow("positive integer");
  });

  test("throws on acquire with negative timeout", () => {
    const s = new Semaphore(1);
    expect(() => s.acquire(-1)).toThrow("non-negative finite");
  });

  test("throws on acquire with NaN timeout", () => {
    const s = new Semaphore(1);
    expect(() => s.acquire(NaN)).toThrow("non-negative finite");
  });

  test("throws on acquire with Infinity timeout", () => {
    const s = new Semaphore(1);
    expect(() => s.acquire(Infinity)).toThrow("non-negative finite");
  });
});
