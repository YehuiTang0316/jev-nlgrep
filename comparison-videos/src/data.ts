export type Kind = "grep" | "semgrep";

// Saved baseline scores, not generated for the animation. verify-data.mjs checks provenance.
export const examples = {
  grep: {
    number: "01", opponent: "grep", category: "SEMANTIC SEARCH", caseId: "text-04", directory: "eval/corpus/text-04",
    query: "An explicit request to postpone a meeting until next week",
    headline: ["Remember the meaning.", "Forgot the words?"], premise: "You remember a request to postpone a meeting until next week.",
    leftTitle: "Guess the exact word", rightTitle: "Describe what you remember",
    pattern: "grep -ni 'postpone'\n  \"$DIR\"/*.txt",
    patternLabel: "The keyword appears in none of these three files",
    comparisonNote: "Same meaning. Different words. Still discoverable.",
    positiveFile: "a.txt", positiveLines: "1", positiveText: "Could we move our meeting to next week? I am unavailable this week.", positiveProbability: 0.97,
    negatives: [
      { file: "b.txt", text: "keep the meeting at the original time", reason: "Keeps the original time this week", probability: 0.02 },
      { file: "c.txt", text: "next week's meeting notes", reason: "Only promises to send meeting notes", probability: 0.03 },
    ],
    endHeadline: ["Search by meaning.", "Find the original."], endSubtitle: "Turn a half-remembered phrase into a useful search.",
  },
  semgrep: {
    number: "02", opponent: "Semgrep", category: "CODE SEARCH", caseId: "code-03", directory: "eval/corpus/code-03",
    query: "Code that awaits each network request inside a loop",
    evaluatedQuery: "在循环里面逐个 await 网络请求的代码",
    headline: ["Know the behavior?", "Describe it."], premise: "Inside a loop. One request at a time. Awaited.",
    leftTitle: "Write a code pattern", rightTitle: "Describe the behavior",
    pattern: "pattern: |\n  for (const $URL of $URLS) {\n    ...\n    await fetch(...);\n    ...\n  }",
    patternLabel: "Illustrative pattern snippet; not executed",
    comparisonNote: "Start with what you want to find. No rule to write first.",
    positiveFile: "a.ts", positiveLines: "1–3", positiveText: "for (const url of urls) {\n  await fetch(url);\n}", positiveProbability: 0.97,
    negatives: [
      { file: "b.ts", text: "await Promise.all(…)", reason: "Concurrent requests, not sequential", probability: 0.03 },
      { file: "c.ts", text: "await delay(10)", reason: "Awaits a delay, not a network request", probability: 0.08 },
    ],
    endHeadline: ["Describe the intent.", "Inspect the source."], endSubtitle: "One interface for code, docs, logs, and plain text.",
  },
} as const;
