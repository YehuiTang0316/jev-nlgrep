import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { examples, Kind } from "../data";
import { Frame } from "../components/Frame";

export const Evidence: React.FC<{ kind: Kind }> = ({ kind }) => {
  const frame = useCurrentFrame();
  const item = examples[kind];
  return <Frame kind={kind}>
    <div style={{ position: "absolute", left: 88, top: 122, fontSize: 58, fontWeight: 700 }}>Find the behavior. Inspect the source.</div>
    <Interactive.Div name="Matching source" style={{ position: "absolute", left: 88, right: 88, top: 222, height: 265, background: "#0d2b27", border: "1px solid #32735c", borderRadius: 16, opacity: interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" }), translate: interpolate(frame, [0, 20], ["0px 14px", "0px 0px"], { extrapolateRight: "clamp" }) }}>
      <div style={{ position: "absolute", left: 28, top: 22, fontSize: 23, color: "#9fd5bf", fontFamily: "monospace" }}>{item.directory}/{item.positiveFile}:{item.positiveLines}</div>
      <pre style={{ position: "absolute", left: 30, top: kind === "grep" ? 106 : 62, margin: 0, color: "#ebfff4", fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: kind === "grep" ? 53 : 35, lineHeight: 1.45 }}>{item.positiveText}</pre>
      <div style={{ position: "absolute", right: 35, top: 87, textAlign: "right" }}><div style={{ fontSize: 20, color: "#7de9c0" }}>Saved score</div><div style={{ fontSize: 75, fontWeight: 700, color: "#6eedbe", lineHeight: 1.2 }}>{item.positiveProbability.toFixed(2)}</div></div>
    </Interactive.Div>
    {item.negatives.map((negative, index) => <Interactive.Div key={negative.file} name={index === 0 ? "First excluded example" : "Second excluded example"} style={{ position: "absolute", left: index === 0 ? 88 : 732, top: 510, width: 620, height: 173, border: "1px solid #30434e", background: "#11202b", borderRadius: 12, padding: "19px 25px", opacity: interpolate(frame, [34 + index * 24, 54 + index * 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 18, color: "#97aebb" }}><span>{negative.file}</span><span>Below threshold · p={negative.probability.toFixed(2)}</span></div>
      <div style={{ fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 24, color: "#cbd7df", marginTop: 17 }}>{negative.text}</div>
      <div style={{ fontSize: 22, color: "#d7b28b", marginTop: 14 }}>{negative.reason}</div>
    </Interactive.Div>)}
  </Frame>;
};
