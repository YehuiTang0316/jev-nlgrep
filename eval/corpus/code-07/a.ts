for (let attempt = 0; attempt < 4; attempt++) {
  try { return await fetch(url); }
  catch { await delay(100 * 2 ** attempt); }
}
