import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const code = await readFile(new URL('../src/data.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {examples} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const repo = new URL('../../', import.meta.url);
const baseline=JSON.parse(await readFile(new URL('eval/baseline-2026-09-20.json',repo),'utf8'));
const cases=JSON.parse(await readFile(new URL('eval/cases.json',repo),'utf8'));
for(const item of Object.values(examples)) {
 const evaluatedQuery = item.evaluatedQuery ?? item.query;
 assert.equal(cases.find(c=>c.id===item.caseId).query,evaluatedQuery);
 const row=baseline.rows.find(r=>r.id===item.caseId);
 for(const [name,p] of [[item.positiveFile,item.positiveProbability], ...item.negatives.map(n=>[n.file,n.probability])]) {
  const file=row.files.find(f=>f.path===`${item.directory}/${name}`);
  assert.equal(file.rank,p);
  const raw=await readFile(new URL(file.path,repo));
  assert.equal(createHash('sha256').update(raw).digest('hex'),file.sourceHash);
  if(name===item.positiveFile) assert.equal(raw.toString().trimEnd(),item.positiveText);
 }
}
const grepPaths=cases.find(c=>c.id===examples.grep.caseId).paths.map(p=>fileURLToPath(new URL(p,repo)));
const absent=spawnSync('grep',['-ni','postpone',...grepPaths],{encoding:'utf8'});
assert.equal(absent.status,1); assert.equal(absent.stdout,'');
const broad=spawnSync('grep',['-ni','meeting',...grepPaths],{encoding:'utf8'});
assert.equal(broad.status,0); assert.equal(broad.stdout.trim().split('\n').length,3);
console.log('Local grep check: postpone matches 0 lines; meeting matches all 3.');
console.log('Both original evaluation queries, all 6 probabilities, positive evidence and source hashes match the saved baseline. The Semgrep query is translated for display. No API calls.');
