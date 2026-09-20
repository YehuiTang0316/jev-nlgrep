export function requireLogin(req) {
  if (!req.session?.user) throw new Error("Not logged in");
}
