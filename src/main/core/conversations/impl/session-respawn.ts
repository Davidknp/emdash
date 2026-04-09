import { log } from '@main/lib/logger';

export interface RespawnState {
  count: number;
  maxRespawns: number;
}

export interface RespawnDecision {
  shouldRespawn: boolean;
  resumeNext: boolean;
  resetCount: boolean;
}

export function evaluateRespawn(state: RespawnState, isResuming: boolean): RespawnDecision {
  const nextCount = state.count + 1;

  if (nextCount > state.maxRespawns && !isResuming) {
    return { shouldRespawn: false, resumeNext: false, resetCount: true };
  }

  const resumeNext = isResuming && nextCount <= state.maxRespawns;
  const resetCount = nextCount > state.maxRespawns;

  return { shouldRespawn: true, resumeNext, resetCount };
}

export class SessionRespawnTracker {
  private counts = new Map<string, number>();
  private readonly maxRespawns: number;
  private readonly providerName: string;

  constructor(options: { maxRespawns: number; providerName: string }) {
    this.maxRespawns = options.maxRespawns;
    this.providerName = options.providerName;
  }

  increment(sessionId: string): RespawnState {
    const count = (this.counts.get(sessionId) ?? 0) + 1;
    this.counts.set(sessionId, count);
    return { count, maxRespawns: this.maxRespawns };
  }

  evaluate(sessionId: string, isResuming: boolean): RespawnDecision {
    const state = this.increment(sessionId);
    const decision = evaluateRespawn(state, isResuming);

    if (!decision.shouldRespawn) {
      log.error(`${this.providerName}: respawn limit reached, giving up`, {
        sessionId,
      });
      this.counts.delete(sessionId);
    } else if (decision.resetCount) {
      this.counts.set(sessionId, 0);
    }

    return decision;
  }

  delete(sessionId: string): void {
    this.counts.delete(sessionId);
  }

  clear(): void {
    this.counts.clear();
  }
}
