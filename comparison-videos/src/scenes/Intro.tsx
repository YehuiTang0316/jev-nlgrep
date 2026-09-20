import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { examples, Kind } from "../data";
import { Frame, Pill } from "../components/Frame";

export const Intro: React.FC<{ kind: Kind }> = ({ kind }) => {
  const frame = useCurrentFrame();
  const item = examples[kind];
  return <Frame kind={kind}>
    <Interactive.Div name="Comparison label" style={{ position: "absolute", left: 90, top: 155, opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" }) }}><Pill bright>nlgrep × {item.opponent}</Pill></Interactive.Div>
    <Interactive.Div name="Opening title" style={{ position: "absolute", left: 86, right: 86, top: 239, fontSize: 94, lineHeight: 1.24, fontWeight: 700, letterSpacing: -3, opacity: interpolate(frame, [4, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), translate: interpolate(frame, [4, 26], ["0px 22px", "0px 0px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
      {item.headline[0]}<br /><span style={{ color: "#65e8bd" }}>{item.headline[1]}</span>
    </Interactive.Div>
    <Interactive.Div name="Query constraints" style={{ position: "absolute", left: 92, right: 155, top: 566, fontSize: 29, color: "#b2c3cf", opacity: interpolate(frame, [23, 43], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>{item.premise}</Interactive.Div>
    <div style={{ position: "absolute", right: 94, bottom: 184, fontFamily: "monospace", fontSize: 100, color: "#193c3c" }}>⌕</div>
  </Frame>;
};
