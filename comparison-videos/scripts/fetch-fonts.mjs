import {readdir, readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
const root = new URL('../', import.meta.url).pathname;
async function sources(dir) {
  const entries = await readdir(dir, {withFileTypes: true});
  return (await Promise.all(entries.map(e => e.isDirectory() ? sources(path.join(dir,e.name)) : readFile(path.join(dir,e.name),'utf8')))).join('');
}
const text = [...new Set((await sources(path.join(root,'src'))).replace(/[\x00-\x1f]/g,'') + Array.from({length:95},(_,i)=>String.fromCharCode(i+32)).join(''))].sort().join('');
const destination = path.join(root, 'public/fonts');
await mkdir(destination,{recursive:true});
for (const weight of [400,700]) {
  const url = new URL('https://fonts.googleapis.com/css2');
  url.searchParams.set('family',`Noto Sans SC:wght@${weight}`); url.searchParams.set('text',text);
  const response = await fetch(url, {headers:{'user-agent':'Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36'}});
  if (!response.ok) throw new Error(`Font stylesheet failed: ${response.status}`);
  const css = await response.text();
  const fontURL = /src:\s*url\(([^)]+)\)/.exec(css)?.[1];
  if (!fontURL) throw new Error('No font URL');
  const font = await fetch(fontURL);
  if (!font.ok) throw new Error(`Font download failed: ${font.status}`);
  const bytes = Buffer.from(await font.arrayBuffer());
  await writeFile(path.join(destination, `noto-sc-${weight}.woff2`),bytes);
  console.log(`Noto Sans SC ${weight}: ${bytes.length} bytes`);
}
const license = await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt');
if (!license.ok) throw new Error('Font license download failed');
await writeFile(path.join(destination,'OFL.txt'),await license.text());
