import {execFileSync} from 'node:child_process';
import {mkdirSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const destination=path.resolve(root,'../docs/videos');
mkdirSync(destination,{recursive:true});
const run=(args)=>execFileSync('npx',['remotion',...args],{cwd:root,stdio:'inherit'});
const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice('--only='.length);
if (only && !['grep','semgrep'].includes(only)) throw new Error('Use --only=grep or --only=semgrep.');
for(const [id,name] of [['NlgrepVsGrep','nlgrep-vs-grep'],['NlgrepVsSemgrep','nlgrep-vs-semgrep']]) {
 if (only && name !== `nlgrep-vs-${only}`) continue;
 const video=path.join(destination,`${name}.mp4`);
 if (!process.argv.includes('--reuse-videos') || !existsSync(video)) run(['render',id,video,'--codec=h264','--crf=20','--pixel-format=yuv420p','--concurrency=2','--log=error']);
 run(['still',id,path.join(destination,`${name}.png`),id === 'NlgrepVsGrep' ? '--frame=285' : '--frame=240','--log=error']);
 run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',video,'-vf','scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3','-r','8','-fps_mode','cfr','-loop','0',path.join(destination,`${name}.gif`)]);
}
