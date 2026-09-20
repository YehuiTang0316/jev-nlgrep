import type { Issue, PlanOutput, SearchOptions, SearchOutput } from './types.js';

export function terminalSafe(value: string): string {
  return value.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
export function pathSafe(path: string): string { return terminalSafe(path).replace(/\n/g, '\\n').replace(/\t/g, '\\t'); }
export function renderResults(output: SearchOutput, options: Pick<SearchOptions, 'json' | 'filesOnly' | 'nullSeparator'>): string {
  if (options.json) return JSON.stringify(output, null, 2) + '\n';
  if (options.filesOnly) return output.files.map(f => f.path + (options.nullSeparator ? '\0' : '\n')).join('');
  return output.files.map(file => {
    const best = [...file.matches].sort((a, b) => b.matchProbability - a.matchProbability || a.startByte - b.startByte)[0]!;
    const header = `${pathSafe(file.path)}:${best.startLine}-${best.endLine}  p=${best.matchProbability.toFixed(2)}${best.fragment ? '  fragment' : ''}`;
    const lines = best.text.split('\n');
    if (lines.at(-1) === '') lines.pop();
    const body = lines.map((line, i) => `${best.startLine + i} | ${terminalSafe(line.replace(/\r$/, ''))}`).join('\n');
    const context = best.context.length ? `   Supplied context: ${best.context.map(w => `${pathSafe(w.path)}:${w.startLine}-${w.endLine}`).join(", ")}\n` : "";
    return `${header}\n${body}\n${context}${file.matches.length > 1 ? `   + ${file.matches.length - 1} other matching windows\n` : ''}`;
  }).join('\n');
}
export function renderPlan(plan: PlanOutput, json: boolean): string {
  if (json) return JSON.stringify(plan, null, 2) + '\n';
  const lines = plan.files.map(f => `${pathSafe(f.path)}  ${f.bytes} bytes  ${f.windows} windows${f.contextFiles.length ? `  context: ${f.contextFiles.map(pathSafe).join(", ")}` : ""}`);
  for (const item of plan.exclusions) lines.push(`skip ${pathSafe(item.path)}  (${item.reason})`);
  lines.push(`${plan.files.length} files; ${plan.sourceBytes} source bytes; ${plan.plannedWindows} windows; ${plan.plannedRequests} batches`);
  lines.push(`${plan.cacheHits} cached; ${plan.uncachedRequests} API requests planned; ${plan.uncachedRequestBytes} uncached request bytes (not tokens)`);
  return lines.join('\n') + '\n';
}
export function formatIssue(issue: Issue): string {
  return `${issue.code}${issue.path ? ` (${pathSafe(issue.path)})` : ''}: ${terminalSafe(issue.message).replace(/\n/g, ' ')}`;
}
export function summary(output: SearchOutput): string {
  const s = output.stats;
  const exclusions = Object.entries(s.excludedByReason).map(([reason, n]) => `${reason}=${n}`).join(', ');
  const state = output.complete ? 'complete' : 'INCOMPLETE';
  return `${state}: ${s.evaluatedWindows}/${s.plannedWindows} windows, ${s.matchedFiles} matching files (${s.returnedFiles} shown), ` +
    `${s.attemptedRequests} API attempts, ${s.cacheHits} cached batches, ${s.inputTokens} input / ${s.outputTokens} output tokens${s.usageComplete ? '' : ' (received usage only)'}, ${s.elapsedMs} ms\n` +
    `Evidence scope: supplied file/window batch${output.outputLimited ? '; output limited by --top' : ''}.${exclusions ? ` Excluded entries: ${exclusions}.` : ''}\n` +
    (output.complete && !s.matchedFiles ? 'No evaluated content reached the matching threshold.\n' : '');
}
