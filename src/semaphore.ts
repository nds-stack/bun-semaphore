interface Waiter {
  resolve: () => void;
  timer?: Timer;
}

export class SemaphoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SemaphoreError";
  }
}

export class Semaphore {
  #max: number;
  #available: number;
  #waiters: Waiter[] = [];

  constructor(maxConcurrency: number) {
    if (maxConcurrency < 1) throw new SemaphoreError("maxConcurrency must be >= 1");
    this.#max = maxConcurrency;
    this.#available = maxConcurrency;
  }

  get available(): number { return this.#available; }
  get pending(): number { return this.#waiters.length; }
  get size(): number { return this.#max; }

  acquire(timeoutMs?: number): Promise<void> {
    if (this.#available > 0) {
      this.#available--;
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = { resolve };

      if (timeoutMs !== undefined && timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          const idx = this.#waiters.indexOf(waiter);
          if (idx >= 0) this.#waiters.splice(idx, 1);
          reject(new SemaphoreError("Semaphore acquire timed out"));
        }, timeoutMs);
      }

      this.#waiters.push(waiter);
    });
  }

  release(): void {
    if (this.#waiters.length > 0) {
      const waiter = this.#waiters.shift()!;
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.resolve();
    } else {
      this.#available = Math.min(this.#max, this.#available + 1);
    }
  }

  async withLock<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
    await this.acquire(timeoutMs);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
