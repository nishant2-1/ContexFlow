export class IdempotencyStore {
  private store = new Map<string, number>();

  constructor(private readonly ttlMs = 1000 * 60 * 30) {}

  isDuplicate(key: string): boolean {
    const now = Date.now();
    this.cleanupExpired(now);

    const expiresAt = this.store.get(key);
    if (expiresAt && expiresAt > now) {
      return true;
    }

    this.store.set(key, now + this.ttlMs);
    return false;
  }

  private cleanupExpired(now: number): void {
    for (const [key, expiresAt] of this.store.entries()) {
      if (expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }
}
