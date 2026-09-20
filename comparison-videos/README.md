# nlgrep comparison videos (Remotion)

Two silent English demos, each 1440 × 810 at 30 fps and 25.8 seconds long. They show how to express search intent and inspect source evidence. They do not compare execution speed.

| Composition | Story | Outputs |
| --- | --- | --- |
| `NlgrepVsGrep` | Forgotten wording → a missed keyword or overly broad matches → finding a paraphrase by meaning | [MP4](../docs/videos/nlgrep-vs-grep.mp4) / [GIF](../docs/videos/nlgrep-vs-grep.gif) |
| `NlgrepVsSemgrep` | A code pattern → a natural-language description → sequential requests inside a loop | [MP4](../docs/videos/nlgrep-vs-semgrep.mp4) / [GIF](../docs/videos/nlgrep-vs-semgrep.gif) |

Outputs live in `../docs/videos/`. GIFs provide previews in the main README; PNGs are still covers. MP4s use H.264 and have no audio track. All visible text is English. The videos have no footer notes, step labels, or progress bars; evidence and limitations are documented here.

## Edit and preview

```sh
cd comparison-videos
npm ci
npm run dev -- --no-open
```

Open the Studio URL printed in the terminal and select `NlgrepVsGrep` or `NlgrepVsSemgrep`. Each video has separate Intro, Compare, Evidence, and Outro scenes connected with Remotion `TransitionSeries`. Text and animation are driven by frames, and key layers are selectable in Studio.

## Render

```sh
npm run lint
npm run verify
npm run render
# Re-export only the grep comparison
npm run render -- --only=grep
```

The render script exports both MP4s, covers, and GIFs in sequence. It uses Remotion's bundled Chromium and FFmpeg; the first run may download a browser. No system FFmpeg is required. `npm run render -- --reuse-videos` reuses existing MP4s and regenerates covers and GIFs; use it only when the video content has not changed.

Rendering, verification, and previewing **never call the Jev API** and do not read `.env` or API keys. Remotion dependencies are isolated in this subproject; the nlgrep CLI does not require them.

## Content and evidence

- Copy and sample data: `src/data.ts`.
- Scenes: `src/scenes/`; shared frame: `src/components/Frame.tsx`.
- Scores come from `text-04` and `code-03` in `../eval/baseline-2026-09-20.json`, using `jev-1.13.0` at a threshold of 0.80.
- `scripts/verify-data.mjs` checks both original evaluation queries, all six probabilities, matching source text, and all source-file hashes without rerunning the model.
- The grep demo uses the exact evaluated English query. The remembered word is `postpone`, while the target says `move our meeting to next week`. The verification script runs grep locally to confirm zero matches for `postpone` and three matches for `meeting`. Only `a.txt` requests postponement until next week: its saved score is 0.97, versus 0.02 and 0.03 for the counterexamples. Both the query and source are English, so the comparison demonstrates semantic search across different wording.
- The Semgrep demo displays **an English translation of the originally evaluated Chinese query**. `evaluatedQuery` preserves that original input for verification. Its displayed scores (0.97, 0.03, and 0.08) come from the original evaluation; the English translation has not been evaluated separately. The pattern is an illustrative syntax fragment, not a complete rule configuration, and Semgrep was not executed. Counterexample snippets are abbreviated.
- Commands are wrapped for the screen; this is an animation, not a terminal recording. The comparison does not measure execution time.

nlgrep returns probabilistic candidates that need review. grep matches the supplied pattern and can find the target with suitable wording or pattern changes. nlgrep's window-level judgments are not equivalent to whole-function or cross-file data-flow analysis.

Scene timing: 0–4 seconds for intent; 3.6–12.6 for the comparison; 12.2–21.2 for evidence; 20.8–25.8 for the takeaway. Adjacent scenes overlap by 0.4 seconds.

## Fonts

The videos use locally bundled Noto Sans SC subsets (400/700), including Latin characters, distributed under the SIL Open Font License in `public/fonts/OFL.txt`. The source is [Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans+SC). Rendering does not fetch fonts from the network.

Run `npm run fonts` after adding characters not present in the bundled subsets. This downloads fresh subsets from Google Fonts using only the character set in this video's source files. It does not read other repository files or configuration. Code snippets use system monospace fonts, so their appearance can vary slightly across platforms.

Semgrep pattern reference: [Pattern syntax](https://docs.semgrep.dev/writing-rules/pattern-syntax). Remotion terms: [official licensing information](https://www.remotion.dev/license).
