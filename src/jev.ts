import { APIConnectionError, APIError, APIUserAbortError, TypeSafeClient, type Fetch } from '@typesafe-ai/sdk';
import { SearchError, type Evaluation, type EvaluationRequest } from './types.js';

export interface Evaluator { evaluate(request: EvaluationRequest, signal: AbortSignal): Promise<Evaluation> }
export class EvaluationError extends Error {
  constructor(public readonly code: string, public readonly safeMessage: string,
    public readonly retryable = false, public readonly retryAfterMs?: number, public readonly contextTooLong = false) {
    super(safeMessage);
  }
}
export function parseEvaluation(raw: unknown, request: EvaluationRequest): Evaluation {
  const fail = () => new SearchError({ code: 'protocol_error', message: 'Jev returned an invalid or incomplete response.' });
  if (!raw || typeof raw !== 'object') throw fail();
  const result = raw as Record<string, unknown>;
  if (typeof result.model !== 'string' || !result.model || !result.answers || typeof result.answers !== 'object') throw fail();
  const answers = result.answers as Record<string, unknown>;
  const probabilities = Object.keys(request.questions).map(id => {
    const answer = answers[id] as Record<string, unknown> | undefined;
    if (!answer || answer.type !== 'noul' || typeof answer.noul !== 'number' || !Number.isFinite(answer.noul) || answer.noul < 0 || answer.noul > 1) throw fail();
    return answer.noul;
  });
  const usage = result.usage as Record<string, unknown> | undefined;
  if (!usage || !Number.isSafeInteger(usage.input_tokens) || (usage.input_tokens as number) < 0 ||
      !Number.isSafeInteger(usage.output_tokens) || (usage.output_tokens as number) < 0) throw fail();
  return { model: result.model, probabilities, usage: { inputTokens: usage.input_tokens as number, outputTokens: usage.output_tokens as number } };
}
function retryAfter(headers: Headers): number | undefined {
  const ms = headers.get('retry-after-ms');
  if (ms !== null && Number.isFinite(Number(ms)) && Number(ms) >= 0) return Number(ms);
  const value = headers.get('retry-after');
  if (value === null) return;
  if (value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}
export function createJevEvaluator(apiKey: string, fetch?: Fetch): Evaluator {
  const client = new TypeSafeClient({ apiKey, baseURL: 'https://api.typesafe.ai', logLevel: 'off',
    retry: { maxRetries: 0 }, timeout: 30_000, ...(fetch ? { fetch } : {}) });
  return { async evaluate(request, signal) {
    try {
      const result = await client.systemOne({ model: request.model,
        state: { query: request.state.query, file: { ...request.state.file }, windows: request.state.windows.map(w => ({ ...w })) },
        questions: request.questions }, { signal });
      return parseEvaluation(result, request);
    } catch (error) {
      if (signal.aborted || error instanceof APIUserAbortError) throw new DOMException('Cancelled', 'AbortError');
      if (error instanceof APIError) {
        const status = error.status;
        const contextTooLong = [400, 413, 422].includes(status) && /(?:context.{0,40}(?:length|limit|long)|(?:token|input|state).{0,40}(?:exceed|too (?:long|large)|limit))/i.test(JSON.stringify(error.body));
        throw new EvaluationError(`api_${status}`, `Jev request failed (HTTP ${status}).`,
          status === 408 || status === 429 || status >= 500, retryAfter(error.headers), contextTooLong);
      }
      if (error instanceof APIConnectionError) throw new EvaluationError('api_connection', 'Jev could not be reached or the request timed out.', true);
      if (error instanceof SearchError) throw error;
      throw new EvaluationError('api_response', 'Jev returned an unreadable response.');
    }
  } };
}
