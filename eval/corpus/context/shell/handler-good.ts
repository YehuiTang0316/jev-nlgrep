import { run } from "./shell.js";
export function httpHandler(req, res) {
  run("date");
  res.end(req.query.command);
}
