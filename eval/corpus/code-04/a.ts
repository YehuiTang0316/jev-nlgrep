app.get("/run", (req, res) => {
  const command = req.query.command;
  exec(command);
});
