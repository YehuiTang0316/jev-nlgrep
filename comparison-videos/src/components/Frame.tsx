import React from "react";
import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from "remotion";
import { examples, Kind } from "../data";

export const Frame: React.FC<{ kind: Kind; children: React.ReactNode }> = ({ kind, children }) => {
  const frame = useCurrentFrame();
  const item = examples[kind];
  return <AbsoluteFill style={{ background: "#07131d", color: "#edf4f5", fontFamily: '"Noto Video", sans-serif' }}>
    <AbsoluteFill style={{ backgroundImage: "linear-gradient(#ffffff03 1px, transparent 1px), linear-gradient(90deg, #ffffff03 1px, transparent 1px)", backgroundSize: "64px 64px" }} />
    <Interactive.Div name="Ambient color" style={{ position: "absolute", width: 700, height: 700, right: -220, top: -360, borderRadius: "50%", background: "radial-gradient(circle, #56e1b81d, transparent 68%)", translate: interpolate(frame, [0, 270], ["0px 0px", "-30px 35px"], { extrapolateRight: "clamp" }) }} />
    <div style={{ position: "absolute", left: 86, right: 86, top: 37, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ color: "#60e6bf", fontFamily: "monospace", fontSize: 28 }}>❯</span>
        <span style={{ fontSize: 29, fontWeight: 700, letterSpacing: -1 }}>nlgrep</span>
        <span style={{ marginLeft: 18, color: "#8598a8", fontSize: 17 }}>Search with natural language</span>
      </div>
      <span style={{ fontFamily: "monospace", fontSize: 16, letterSpacing: 2, color: "#96aab8" }}>{item.number} / {item.category}</span>
    </div>
    {children}
  </AbsoluteFill>;
};

export const Pill: React.FC<{ children: React.ReactNode; bright?: boolean }> = ({ children, bright = false }) =>
  <div style={{ display: "inline-flex", padding: "11px 20px", borderRadius: 6, fontSize: 22, color: bright ? "#70edc7" : "#b3c2cd", background: bright ? "#12342f" : "#172633", border: `1px solid ${bright ? "#2d6655" : "#304350"}` }}>{children}</div>;
