import { requireLogin } from "./guard.js";
export function httpHandler(req, res) {
  requireLogin(req);
  const user = loadUserProfile(req.params.id);
  res.json(user);
}
