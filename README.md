# @nds-stack/bun-semaphore

> Async semaphore for Bun — acquire/release, timeout, FIFO, zero deps.

```typescript
import { Semaphore } from "@nds-stack/bun-semaphore";

const db = new Semaphore(5); // max 5 concurrent DB ops

await db.withLock(async () => {
  // only 5 at a time
});
```

## How It Works

`Semaphore` maintains a **FIFO waiter queue** and a counter of available permits.

1. **Construction** — `new Semaphore(n)` sets `maxConcurrency = n` and available permits to `n`.
2. **Acquire** — If a permit is available, the counter is immediately decremented and the promise resolves synchronously. If no permits remain, the caller is enqueued and the promise is suspended.
3. **Release** — The head waiter from the FIFO queue is dequeued and resolved, transferring the permit directly (no counter bounce). If no waiters exist, the permit counter is incremented (up to max).
4. **Timeout** — If `acquire(timeoutMs)` is called and no permit becomes available within the window, a `setTimeout` fires, removes the waiter from the queue, and rejects the promise with a `SemaphoreError`.

```
                   ┌─────────────┐
  acquire() ──────►│ Available?  │──Yes──► decrement count ──► resolve
                   └──────┬──────┘
                          │ No
                          ▼
                   ┌──────────────┐
                   │ FIFO Queue   │
                   │ [w1, w2, w3] │
                   └──────────────┘
                          │
                   release() ──► shift() head waiter ──► resolve
```

## API

`new Semaphore(maxConcurrency)`

| Method | Returns | Description |
|--------|---------|-------------|
| `acquire(timeoutMs?)` | `Promise<void>` | Wait for a slot (optional timeout) |
| `release()` | `void` | Release a slot |
| `withLock(fn, timeoutMs?)` | `Promise<T>` | Auto acquire+release wrapper |
| `available` | `number` | Current available slots |
| `pending` | `number` | Waiters in queue |
| `size` | `number` | Max concurrency |

## Error Handling

Two error paths raise `SemaphoreError` (extends `Error`, `.name = "SemaphoreError"`):

| Scenario | Condition | Error Message |
|----------|-----------|---------------|
| Invalid maxConcurrency | `maxConcurrency < 1` or non-integer in constructor | `"maxConcurrency must be a positive integer >= 1"` |
| Acquire timeout | No permit acquired within `timeoutMs` | `"Semaphore acquire timed out"` |

- Timeout errors are **rejected promises** from `acquire()` — they do **not** throw synchronously.
- If a timeout fires, the waiter is removed from the internal FIFO queue so it won't be resolved later.
- `withLock` forwards the timeout rejection — wrap in try/catch to handle.
- `release()` is **silent** (no error on double-release or excess release; the counter is clamped to `maxConcurrency`).

```typescript
import { Semaphore, SemaphoreError } from "@nds-stack/bun-semaphore";

try {
  const s = new Semaphore(-1);
} catch (e) {
  if (e instanceof SemaphoreError) {
    console.error(e.message); // "maxConcurrency must be >= 1"
  }
}

const s = new Semaphore(1);
try {
  await s.acquire(100); // if no release within 100ms
} catch (e) {
  if (e instanceof SemaphoreError) {
    console.error(e.message); // "Semaphore acquire timed out"
  }
}
```

## Limitations

| Limitation | Detail |
|------------|--------|
| **Single-process only** | Permits and queues live in-process memory. Not shareable across workers or processes. |
| **No shared memory between workers** | Each `Semaphore` instance is isolated. `bun:worker` threads cannot share a semaphore directly. |
| **No priority queue** | All waiters are served FIFO. High-priority tasks cannot jump the queue. |
| **Timeout uses setTimeout** | Timer precision is limited by the event loop. Under extreme load, timeouts may fire later than specified. Not suitable for hard real-time guarantees. |
| **No cancellation** | Once `acquire()` is called, the waiter cannot be externally cancelled — only a timeout can remove it. |
| **No recursive locking** | Calling `acquire()` twice from the same async context without an intermediate `release()` will deadlock if permits are exhausted. |

## Multi-Instance / Cross-Boundary

Each `Semaphore` instance is **completely independent**. There is no shared state between instances:

```typescript
const a = new Semaphore(1);
const b = new Semaphore(1);

// These do NOT coordinate — both can acquire simultaneously
await Promise.all([a.acquire(), b.acquire()]);
```

For multi-worker or multi-process coordination, use an external system:

| Scenario | Recommended Approach |
|----------|---------------------|
| Multiple `bun:worker` threads | Message-based lock via `parentPort.postMessage` / `workerData` |
| Multiple processes (cluster) | Redis lock, PostgreSQL advisory lock, or file-based lock |
| Distributed systems | ZooKeeper, etcd, or a distributed semaphore service |

## Customization Guide

### Wrap in a class with logging

```typescript
import { Semaphore } from "@nds-stack/bun-semaphore";

class LoggedSemaphore {
  private sem: Semaphore;

  constructor(max: number, private label: string) {
    this.sem = new Semaphore(max);
  }

  async withLock<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
    console.log(`[${this.label}] waiting (pending: ${this.sem.pending})`);
    const result = await this.sem.withLock(fn, timeoutMs);
    console.log(`[${this.label}] done (available: ${this.sem.available})`);
    return result;
  }
}
```

### Create a mutex (binary semaphore)

```typescript
import { Semaphore } from "@nds-stack/bun-semaphore";

// A mutex is just a semaphore with max concurrency = 1
const mutex = new Semaphore(1);

async function criticalSection() {
  await mutex.withLock(async () => {
    // exclusive access
  });
}
```

### Batch acquire pattern

```typescript
import { Semaphore } from "@nds-stack/bun-semaphore";

class BatchSemaphore {
  private sem: Semaphore;

  constructor(max: number) {
    this.sem = new Semaphore(max);
  }

  async acquireBatch(count: number, timeoutMs?: number): Promise<void> {
    const acqs = Array.from({ length: count }, () => this.sem.acquire(timeoutMs));
    await Promise.all(acqs);
  }

  releaseBatch(count: number): void {
    for (let i = 0; i < count; i++) {
      this.sem.release();
    }
  }
}
```

## Comparison Table

| Aspect | `@nds-stack/bun-semaphore` | Raw Promise coordination | `async-mutex` library | Manual locking (flag + spin) |
|--------|---------------------------|--------------------------|-----------------------|------------------------------|
| **Dependencies** | 0 | 0 | 1 | 0 |
| **FIFO fairness** | ✅ Built-in | ❌ Random resolution order | ✅ Built-in | ❌ |
| **Timeout support** | ✅ Native | ❌ Must implement | ✅ | ❌ |
| **API surface** | 3 methods | Manual | Larger (Mutex, Semaphore, withLock) | Ad-hoc |
| **Zero-deps** | ✅ | ✅ | ❌ | ✅ |
| **TypeScript** | ✅ Strict | Any | ✅ | Any |
| **Bun native** | ✅ (`Timer`, no polyfill) | ✅ | ❌ (Node.js first) | ✅ |
| **Bundle size** | ~0.5 KB | 0 | ~3 KB | Varies |

## Benchmarks

```
Benchmark: @nds-stack/bun-semaphore (1000 iterations each)

==================================================================================
  Operation                                            Throughput      vs baseline
==================================================================================
  baseline (no semaphore)                               4.737.091 ops/s  baseline
  acquire/release (no contention)                         458.926 ops/s  56.0%
  withLock (no contention)                                484.778 ops/s  59.1%
  baseline contention (10 tasks)                          217.231 ops/s  baseline
  withLock contention sem(1) × 10 tasks                     6.512 ops/s  0.8%
==================================================================================
```

| Operation | Throughput | vs Baseline |
|-----------|-----------|-------------|
| Baseline (no semaphore) | 4,737,091 ops/s | — |
| acquire/release (no contention) | 458,926 ops/s | 9.7% |
| withLock (no contention) | 484,778 ops/s | 10.2% |
| Baseline contention (10 tasks) | 217,231 ops/s | — |
| withLock contention sem(1) × 10 tasks | 6,512 ops/s | 3.0% |

Run locally: `bun run bench`

## Real-World Example

**Rate-limited API client** — max 5 concurrent requests to avoid overwhelming the upstream:

```typescript
import { Semaphore } from "@nds-stack/bun-semaphore";

class RateLimitedApiClient {
  private sem: Semaphore;
  private baseUrl: string;

  constructor(baseUrl: string, maxConcurrent = 5) {
    this.sem = new Semaphore(maxConcurrent);
    this.baseUrl = baseUrl;
  }

  async fetch<T>(path: string, timeoutMs = 10_000): Promise<T> {
    return this.sem.withLock(async () => {
      const response = await fetch(`${this.baseUrl}${path}`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      return response.json() as T;
    }, timeoutMs);
  }
}

const api = new RateLimitedApiClient("https://api.example.com");

// Fire 100 requests — at most 5 run concurrently
const results = await Promise.all(
  Array.from({ length: 100 }, (_, i) =>
    api.fetch(`/items/${i}`).catch((err) => ({ error: err.message }))
  )
);
```

## License

MIT
