import "./index.css";
import { Composition } from "remotion";
import { ComparisonVideo } from "./Video";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="NlgrepVsGrep" component={ComparisonVideo} durationInFrames={774} fps={30} width={1440} height={810} defaultProps={{ kind: "grep" }} />
      <Composition id="NlgrepVsSemgrep" component={ComparisonVideo} durationInFrames={774} fps={30} width={1440} height={810} defaultProps={{ kind: "semgrep" }} />
    </>
  );
};
