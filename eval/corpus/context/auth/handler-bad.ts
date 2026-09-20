export function httpHandler(req, res) {
  const user = loadUserProfile(req.params.id);
  res.json(user);
}
