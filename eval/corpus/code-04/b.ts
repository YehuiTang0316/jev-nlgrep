app.get("/run", (req, res) => {
  exec("echo hello");
});
