import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Evaluator } from '../src/jev.js';
import { SearchError } from '../src/types.js';

// Live-test accounting is separate from the product's per-command request budget.
// Each outgoing attempt reserves $0.01: >3x the documented cost of a 64k-token
// Jev 1.13 request ($0.042 / 1M input tokens; output free). Failures keep the reserve.
export const MAX_TEST_USD = 5;
export const RESERVE_PER_ATTEMPT_USD = 0.01;
export const PRICE_PER_MILLION_INPUT = 0.042;
export interface Ledger {
  version: 1;
  attempts: number;
  successful: number;
  reservedUSD: number;
  observedUSD: number;
  inputTokens: number;
  outputTokens: number;
  model: 'jev-1.13.0';
}
export class TestBudget {
  readonly ledger: Ledger;
  constructor(private readonly path: string, private readonly maxAttempts = 200) {
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_TEST_USD / RESERVE_PER_ATTEMPT_USD) throw new Error('Invalid test request cap.');
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf8')) as Ledger;
      if (data.version !== 1 || data.model !== 'jev-1.13.0' || !Number.isSafeInteger(data.attempts) ||
          data.attempts < 0 || !Number.isFinite(data.reservedUSD) || data.reservedUSD < 0 ||
          data.reservedUSD !== data.attempts * RESERVE_PER_ATTEMPT_USD ||
          !Number.isSafeInteger(data.successful) || data.successful < 0 || data.successful > data.attempts ||
          !Number.isSafeInteger(data.inputTokens) || data.inputTokens < 0 ||
          !Number.isSafeInteger(data.outputTokens) || data.outputTokens < 0 ||
          !Number.isFinite(data.observedUSD) || data.observedUSD < 0) throw new Error('Invalid test budget ledger; refusing live requests.');
      this.ledger = data;
    } else this.ledger = { version: 1, attempts: 0, successful: 0, reservedUSD: 0, observedUSD: 0, inputTokens: 0, outputTokens: 0, model: 'jev-1.13.0' };
  }
  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const temp = `${this.path}.tmp`;
    writeFileSync(temp, JSON.stringify(this.ledger, null, 2) + '\n', { mode: 0o600 });
    renameSync(temp, this.path);
  }
  wrap(evaluator: Evaluator): Evaluator {
    return { evaluate: async (request, signal) => {
      signal.throwIfAborted();
      if (request.model !== this.ledger.model) throw new SearchError({ code: 'test_budget', message: 'Live tests require the budgeted fixed model.' });
      const nextReserve = (this.ledger.attempts + 1) * RESERVE_PER_ATTEMPT_USD;
      if (this.ledger.attempts >= this.maxAttempts || nextReserve > MAX_TEST_USD || this.ledger.observedUSD + RESERVE_PER_ATTEMPT_USD > MAX_TEST_USD) {
        throw new SearchError({ code: 'test_budget', message: 'Cumulative live-test budget reached; no request was sent.' });
      }
      this.ledger.attempts++;
      this.ledger.reservedUSD = nextReserve;
      this.save(); // Reserve durably before touching the network, including every retry.
      const result = await evaluator.evaluate(request, signal);
      this.ledger.successful++;
      this.ledger.inputTokens += result.usage.inputTokens;
      this.ledger.outputTokens += result.usage.outputTokens;
      this.ledger.observedUSD += result.usage.inputTokens * PRICE_PER_MILLION_INPUT / 1_000_000;
      this.save();
      return result;
    } };
  }
}
