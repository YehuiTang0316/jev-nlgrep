import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { examples } from "../data";
import { Frame } from "../components/Frame";

export const SemanticCompare: React.FC = () => {
  const frame = useCurrentFrame();
  const item = examples.grep;
  return <Frame kind="grep">
    <div style={{ position: "absolute", left: 88, top: 122, fontSize: 58, fontWeight: 700 }}>Forgot the words? Search by meaning.</div>
    <Interactive.Div name="Keyword searches" style={{ position: "absolute", left: 88, top: 232, width: 588, height: 382, padding: 28, borderRadius: 16, background: "#10202c", border: "1px solid #334552", opacity: interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" }) }}>
      <div style={{ color: "#edc382", fontSize: 24, fontWeight: 700 }}>grep<span style={{ fontSize: 20, fontWeight: 400, color: "#9fafbd", marginLeft: 22 }}>{item.leftTitle}</span></div>
      <pre style={{ fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 26, lineHeight: 1.5, color: "#e9d7bc", marginTop: 28, marginBottom: 0 }}>{item.pattern}</pre>
      <Interactive.Div name="No keyword matches" style={{ marginTop: 12, color: "#ecc08d", fontSize: 25, opacity: interpolate(frame, [24, 36], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>0 matches · no “postpone” in the text</Interactive.Div>
      <Interactive.Div name="Broad keyword matches" style={{ borderTop: "1px solid #344751", marginTop: 22, paddingTop: 17, opacity: interpolate(frame, [55, 73], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        <div style={{ fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 23, color: "#c6d4df" }}>grep -ni 'meeting' "$DIR"/*.txt</div>
        <div style={{ marginTop: 11, fontSize: 23, color: "#9fb2bf" }}>3 matches · includes unrelated passages</div>
      </Interactive.Div>
    </Interactive.Div>
    <Interactive.Div name="Search by meaning" style={{ position: "absolute", left: 700, top: 232, width: 652, height: 382, padding: 30, borderRadius: 16, background: "#0e2928", border: "1px solid #39785f", opacity: interpolate(frame, [86, 106], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), translate: interpolate(frame, [86, 106], ["0px 15px", "0px 0px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
      <div style={{ color: "#68edc2", fontSize: 24, fontWeight: 700 }}>nlgrep<span style={{ fontSize: 20, color: "#a9c8bf", marginLeft: 22, fontWeight: 400 }}>{item.rightTitle}</span></div>
      <div style={{ fontFamily: "monospace", color: "#b5f2dc", fontSize: 26, marginTop: 26 }}>$ nlgrep</div>
      <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.55, color: "#f0fff9", marginTop: 12, whiteSpace: "pre-line" }}>“{item.query.replace("postpone ", "postpone\n")}”</div>
      <div style={{ fontFamily: "monospace", fontSize: 23, marginTop: 12, color: "#9fc7bc" }}>"$DIR"</div>
      <div style={{ position: "absolute", bottom: 24, color: "#7bd8b8", fontSize: 20 }}>Intent: postpone the meeting until next week</div>
    </Interactive.Div>
    <Interactive.Div name="Semantic expansion takeaway" style={{ position: "absolute", left: 90, top: 653, fontSize: 31, color: "#c0d2d9", opacity: interpolate(frame, [126, 146], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>{item.comparisonNote}</Interactive.Div>
  </Frame>;
};
