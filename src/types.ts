export interface SearchOptions {
  query: string;
  paths: string[];
  cwd: string;
  globs: string[];
  hidden: boolean;
  noIgnore: boolean;
  threshold: number;
  top: number;
  filesOnly: boolean;
  nullSeparator: boolean;
  json: boolean;
  dryRun: boolean;
  concurrency: number;
  maxBytes: number;
  maxRequests: number;
  model: string;
  cache: boolean;
}

export interface Issue { code: string; message: string; path?: string }
export class SearchError extends Error {
  constructor(public readonly issue: Issue) { super(issue.message); }
}
export interface Source {
  path: string;
  absolutePath?: string;
  bytes: Buffer;
  hash: string;
  lineCount: number;
}
export interface Window {
  startLine: number;
  endLine: number;
  startByte: number;
  endByte: number;
  fragment: boolean;
  text: string;
}
export interface Match extends Window { matchProbability: number }
export interface FileResult { path: string; sourceHash: string; rank: number; matches: Match[] }
export interface NoulQuestion {
  type: 'noul';
  instructions: string;
  criteria: { true: string; false: string };
}
export interface EvaluationRequest {
  model: string;
  state: {
    query: string;
    file: { path: string; lineCount: number };
    windows: Array<Window & { wholeFile: boolean }>;
  };
  questions: Record<string, NoulQuestion>;
}
export interface Evaluation { model: string; probabilities: number[]; usage: { inputTokens: number; outputTokens: number } }
export interface Batch { source: Source; windows: Window[]; request: EvaluationRequest; requestBytes: number; cached?: Evaluation }
export interface Plan {
  sources: Source[];
  batches: Batch[];
  exclusions: Array<{ path: string; reason: string }>;
  stats: SearchStats;
  errors: Issue[];
}
export interface SearchStats {
  discoveredFiles: number;
  includedFiles: number;
  excludedByReason: Record<string, number>;
  sourceBytes: number;
  plannedWindows: number;
  evaluatedWindows: number;
  matchedFiles: number;
  returnedFiles: number;
  plannedRequests: number;
  attemptedRequests: number;
  successfulRequests: number;
  cacheHits: number;
  cachedWindows: number;
  uncachedRequests: number;
  inputTokens: number;
  outputTokens: number;
  usageComplete: boolean;
  elapsedMs: number;
}
export interface SearchOutput {
  schemaVersion: 1;
  query: string;
  modelRequested: string;
  modelsUsed: string[];
  promptVersion: string;
  threshold: number;
  evidenceScope: 'window';
  complete: boolean;
  outputLimited: boolean;
  files: FileResult[];
  stats: SearchStats;
  errors: Issue[];
  warnings: Issue[];
}
export interface PlanOutput {
  schemaVersion: 1;
  kind: 'plan';
  query: string;
  model: string;
  promptVersion: string;
  complete: boolean;
  files: Array<{ path: string; bytes: number; windows: number }>;
  exclusions: Plan['exclusions'];
  sourceBytes: number;
  plannedWindows: number;
  plannedRequests: number;
  plannedRequestBytes: number;
  uncachedRequests: number;
  uncachedRequestBytes: number;
  cacheHits: number;
  errors: Issue[];
}
export function emptyStats(): SearchStats {
  return { discoveredFiles: 0, includedFiles: 0, excludedByReason: {}, sourceBytes: 0,
    plannedWindows: 0, evaluatedWindows: 0, matchedFiles: 0, returnedFiles: 0,
    plannedRequests: 0, attemptedRequests: 0, successfulRequests: 0, cacheHits: 0, cachedWindows: 0, uncachedRequests: 0,
    inputTokens: 0, outputTokens: 0, usageComplete: true, elapsedMs: 0 };
}

export function issueFrom(error: unknown, path?: string): Issue {
  if (error instanceof SearchError) return error.issue;
  if (error instanceof Error && error.name === 'AbortError') return { code: 'cancelled', message: 'Search cancelled.' };
  return { code: 'io_error', message: 'Could not read the input.', ...(path ? { path } : {}) };
}
