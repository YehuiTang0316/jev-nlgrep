import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { examples } from "../data";
import { Frame } from "../components/Frame";

export const SemanticEvidence: React.FC = () => {
  const frame = useCurrentFrame();
  const item = examples.grep;
  const expression = "move our meeting to next week";
  const [before, after] = item.positiveText.split(expression);
  return <Frame kind="grep">
    <div style={{ position: "absolute", left: 88, top: 122, fontSize: 58, fontWeight: 700 }}>Different words. The meaning matches.</div>
    <Interactive.Div name="Matched paraphrase" style={{ position: "absolute", left: 88, right: 88, top: 222, height: 265, background: "#0d2b27", border: "1px solid #32735c", borderRadius: 16, opacity: interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" }), translate: interpolate(frame, [0, 20], ["0px 14px", "0px 0px"], { extrapolateRight: "clamp" }) }}>
      <div style={{ position: "absolute", left: 28, top: 22, fontSize: 23, color: "#9fd5bf", fontFamily: "monospace" }}>{item.directory}/{item.positiveFile}:1</div>
      <div style={{ position: "absolute", left: 30, top: 83, width: 925, fontSize: 33, lineHeight: 1.6, color: "#ebfff4" }}>{before}<span style={{ color: "#83f4c7", background: "#255740", borderRadius: 3 }}>{expression}</span>{after}</div>
      <div style={{ position: "absolute", left: 30, bottom: 23, fontSize: 22, color: "#96c7b4" }}>postpone → move … to next week</div>
      <div style={{ position: "absolute", right: 35, top: 87, textAlign: "right" }}><div style={{ fontSize: 20, color: "#7de9c0" }}>Saved score</div><div style={{ fontSize: 75, fontWeight: 700, color: "#6eedbe", lineHeight: 1.2 }}>{item.positiveProbability.toFixed(2)}</div></div>
    </Interactive.Div>
    {item.negatives.map((negative, index) => <Interactive.Div key={negative.file} name={index === 0 ? "Original time excluded" : "Meeting notes excluded"} style={{ position: "absolute", left: index === 0 ? 88 : 732, top: 510, width: 620, height: 173, border: "1px solid #30434e", background: "#11202b", borderRadius: 12, padding: "19px 25px", opacity: interpolate(frame, [34 + index * 24, 54 + index * 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 18, color: "#97aebb" }}><span>{negative.file}</span><span>Below threshold · p={negative.probability.toFixed(2)}</span></div>
      <div style={{ fontSize: 25, color: "#cbd7df", marginTop: 17 }}>{negative.text}</div>
      <div style={{ fontSize: 22, color: "#d7b28b", marginTop: 14 }}>{negative.reason}</div>
    </Interactive.Div>)}
  </Frame>;
};
