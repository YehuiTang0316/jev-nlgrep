import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { examples, Kind } from "../data";
import { Frame } from "../components/Frame";

export const Compare: React.FC<{ kind: Kind }> = ({ kind }) => {
  const frame = useCurrentFrame();
  const item = examples[kind];
  const queryLines = item.query.replace(" network", "\nnetwork");
  return <Frame kind={kind}>
    <div style={{ position: "absolute", left: 88, top: 122, fontSize: 58, fontWeight: 700 }}>Same intent. Different expressions.</div>
    <Interactive.Div name="Pattern panel" style={{ position: "absolute", left: 88, top: 232, width: 588, height: 382, padding: 28, borderRadius: 16, background: "#10202c", border: "1px solid #334552", opacity: interpolate(frame, [5, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), translate: interpolate(frame, [5, 22], ["0px 15px", "0px 0px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
      <div style={{ color: "#edc382", fontSize: 24, fontWeight: 700 }}>{item.opponent}<span style={{ fontSize: 20, fontWeight: 400, color: "#9fafbd", marginLeft: 22 }}>{item.leftTitle}</span></div>
      <pre style={{ marginTop: kind === "grep" ? 52 : 25, marginBottom: 0, fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: kind === "grep" ? 28 : 25, lineHeight: 1.48, color: "#e9d7bc", whiteSpace: "pre-wrap" }}>{item.pattern}</pre>
      <div style={{ position: "absolute", bottom: 24, fontSize: 18, color: "#94a7b5" }}>{item.patternLabel}</div>
    </Interactive.Div>
    <Interactive.Div name="Natural language panel" style={{ position: "absolute", left: 700, top: 232, width: 652, height: 382, padding: 30, borderRadius: 16, background: "#0e2928", border: "1px solid #39785f", boxShadow: "0 20px 80px #35c58d0c", opacity: interpolate(frame, [24, 44], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), translate: interpolate(frame, [24, 44], ["0px 15px", "0px 0px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
      <div style={{ color: "#68edc2", fontSize: 24, fontWeight: 700 }}>nlgrep<span style={{ fontSize: 20, color: "#a9c8bf", marginLeft: 22, fontWeight: 400 }}>{item.rightTitle}</span></div>
      <div style={{ fontFamily: "monospace", color: "#b5f2dc", fontSize: 26, marginTop: 31 }}>$ nlgrep</div>
      <div style={{ fontSize: 31, fontWeight: 700, lineHeight: 1.5, color: "#f0fff9", marginTop: 14, whiteSpace: "pre-line" }}>“{queryLines}”</div>
      <div style={{ fontFamily: "monospace", fontSize: 23, marginTop: 12, color: "#9fc7bc" }}>"$DIR"</div>
      <div style={{ position: "absolute", bottom: 24, color: "#7bd8b8", fontSize: 18 }}>Your intent → Jev evaluates the source</div>
    </Interactive.Div>
    <Interactive.Div name="Comparison takeaway" style={{ position: "absolute", left: 90, top: 653, fontSize: 31, color: "#c0d2d9", opacity: interpolate(frame, [62, 82], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>{item.comparisonNote}</Interactive.Div>
  </Frame>;
};
