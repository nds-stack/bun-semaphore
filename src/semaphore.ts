class DoublyLinkedNode<T> {
  value: T;
  prev?: DoublyLinkedNode<T>;
  next?: DoublyLinkedNode<T>;
  removed = false;

  constructor(value: T) {
    this.value = value;
  }
}

class LinkedList<T> {
  #head?: DoublyLinkedNode<T>;
  #tail?: DoublyLinkedNode<T>;
  #size = 0;

  get length(): number {
    return this.#size;
  }

  enqueue(value: T): DoublyLinkedNode<T> {
    const node = new DoublyLinkedNode(value);
    if (this.#tail) {
      this.#tail.next = node;
      node.prev = this.#tail;
    } else {
      this.#head = node;
    }
    this.#tail = node;
    this.#size++;
    return node;
  }

  dequeue(): T | undefined {
    const node = this.#head;
    if (!node) return undefined;
    this.remove(node);
    return node.value;
  }

  remove(node: DoublyLinkedNode<T>): void {
    if (node.removed) return;
    node.removed = true;
    if (node.prev) node.prev.next = node.next;
    else this.#head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.#tail = node.prev;
    this.#size--;
  }
}

interface Waiter {
  resolve: () => void;
  timer?: ReturnType<typeof setTimeout>;
}

function isNonNullFinite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
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
  #queue = new LinkedList<Waiter>();

  constructor(maxConcurrency: number) {
    if (!isNonNullFinite(maxConcurrency) || !Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new SemaphoreError("maxConcurrency must be a positive integer >= 1");
    }
    this.#max = maxConcurrency;
    this.#available = maxConcurrency;
  }

  get available(): number {
    return this.#available;
  }

  get pending(): number {
    return this.#queue.length;
  }

  get size(): number {
    return this.#max;
  }

  acquire(timeoutMs?: number): Promise<void> {
    if (timeoutMs !== undefined && (!isNonNullFinite(timeoutMs) || timeoutMs < 0)) {
      throw new SemaphoreError("timeoutMs must be a non-negative finite number");
    }

    if (this.#available > 0) {
      this.#available--;
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = { resolve };
      const node = this.#queue.enqueue(waiter);

      if (timeoutMs !== undefined && timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          this.#queue.remove(node);
          reject(new SemaphoreError("Semaphore acquire timed out"));
        }, timeoutMs);
      }
    });
  }

  release(): void {
    if (this.#queue.length > 0) {
      const waiter = this.#queue.dequeue();
      if (waiter) {
        if (waiter.timer) clearTimeout(waiter.timer);
        waiter.resolve();
      }
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
