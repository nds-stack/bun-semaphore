# @nds-stack/bun-semaphore

> Async semaphore for Bun — acquire/release, timeout, FIFO, zero deps.

```typescript
import { Semaphore } from "@nds-stack/bun-semaphore";

const db = new Semaphore(5); // max 5 concurrent DB ops

await db.withLock(async () => {
  // only 5 at a time
});
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

## License

MIT
