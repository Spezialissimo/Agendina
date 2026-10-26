/** Counts failed attempts per key within a time window (in memory, per server process). */
export class FailureLimiter {
  private readonly failures = new Map<string, number[]>()

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    private readonly now: () => Date,
  ) {}

  isBlocked(key: string): boolean {
    return this.recent(key).length >= this.maxFailures
  }

  recordFailure(key: string): void {
    this.failures.set(key, [...this.recent(key), this.now().getTime()])
  }

  reset(key: string): void {
    this.failures.delete(key)
  }

  private recent(key: string): number[] {
    const cutoff = this.now().getTime() - this.windowMs
    const recent = (this.failures.get(key) ?? []).filter((t) => t > cutoff)
    if (recent.length === 0) this.failures.delete(key)
    else this.failures.set(key, recent)
    return recent
  }
}
