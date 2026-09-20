import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { examples, Kind } from "../data";
import { Frame, Pill } from "../components/Frame";

export const Outro: React.FC<{ kind: Kind }> = ({ kind }) => {
  const frame = useCurrentFrame();
  const item = examples[kind];
  return <Frame kind={kind}>
    <Interactive.Div name="Final takeaway" style={{ position: "absolute", left: 88, right: 88, top: 164, fontWeight: 700, fontSize: 94, lineHeight: 1.23, letterSpacing: -3, opacity: interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" }), translate: interpolate(frame, [0, 24], ["0px 20px", "0px 0px"], { extrapolateRight: "clamp" }) }}>{item.endHeadline[0]}<br /><span style={{ color: "#67eabd" }}>{item.endHeadline[1]}</span></Interactive.Div>
    <div style={{ position: "absolute", left: 92, top: 465, color: "#b8cbd3", fontSize: 31 }}>{item.endSubtitle}</div>
    <Interactive.Div name="Benefits" style={{ position: "absolute", top: 545, left: 92, display: "flex", gap: 16, opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}><Pill bright>One natural-language query</Pill><Pill>Source + line numbers</Pill><Pill>Cached by default</Pill></Interactive.Div>
    <div style={{ position: "absolute", left: 93, top: 646, color: "#78a997", fontFamily: "monospace", fontSize: 23 }}>nlgrep "what to find and its conditions" [paths...]</div>
  </Frame>;
};
