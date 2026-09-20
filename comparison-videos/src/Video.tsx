import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill } from "remotion";
import "./fonts";
import { Kind } from "./data";
import { Intro } from "./scenes/Intro";
import { Compare } from "./scenes/Compare";
import { Evidence } from "./scenes/Evidence";
import { Outro } from "./scenes/Outro";
import { SemanticCompare } from "./scenes/SemanticCompare";
import { SemanticEvidence } from "./scenes/SemanticEvidence";

export const ComparisonVideo: React.FC<{ kind: Kind }> = ({ kind }) => {
  return <AbsoluteFill style={{ backgroundColor: "#07131d" }}>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={120} name="Search intent"><Intro kind={kind} /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
      <TransitionSeries.Sequence durationInFrames={270} name="Compare expression">{kind === "grep" ? <SemanticCompare /> : <Compare kind={kind} />}</TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
      <TransitionSeries.Sequence durationInFrames={270} name="Inspect source evidence">{kind === "grep" ? <SemanticEvidence /> : <Evidence kind={kind} />}</TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
      <TransitionSeries.Sequence durationInFrames={150} name="Takeaway"><Outro kind={kind} /></TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>;
};
