// In-process only: with K instances a key still loads at most K times concurrently.
export class SingleFlight {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise: Promise<T> = fn().finally(() => {
      // A clear() may have let a newer flight take this key; don't evict it.
      if (this.inFlight.get(key) === promise) {
        this.inFlight.delete(key);
      }
    });

    this.inFlight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.inFlight.clear();
  }
}
