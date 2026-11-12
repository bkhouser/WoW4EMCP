// Tracked-source hygiene complements, but does not replace, Gitleaks.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
if(resolve(git('rev-parse','--show-toplevel')).toLowerCase()!==root.toLowerCase()) throw new Error('Run from a separate initialized public repository');
const files=git('ls-files','-z').split('\0').filter(Boolean);
if(files.length<40) throw new Error('Expected complete staged or committed public source');
// Validate the bytes that will be committed, and refuse unstaged tracked edits.
execFileSync('git',['diff','--exit-code','--quiet'],{cwd:root});
const forbiddenPath=/(^|\/)(data|artifacts|tools|node_modules|dist|\.npm-cache)\/|(^|\/)\.env|\.(dpapi|sqlite(?:-wal|-shm)?|log|zip)$|(^|\/)config\.local\.json$/i;
const rules=[
 ['local user path',/C:[\\/]Users[\\/][^\s<"']+/i],
 ['private ChatGPT link',/https:\/\/chatgpt\.com\/(?:c\/|space\/page_|plugins\/plugin_asdk_app_)/i],
 ['deployment identifier',/\b(?:tunnel_|plugin_asdk_app_|proj_|key_)[A-Za-z0-9]{12,}\b|\borg-[A-Za-z0-9]{12,}\b/],
 ['API credential',/\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
 ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/]
];
const failures=[];
for(const file of files){
 if(forbiddenPath.test(file))failures.push(`${file}: forbidden tracked path`);
 const content=execFileSync('git',['show',`:${file}`],{cwd:root,encoding:'utf8'});
 for(const [label,pattern] of rules)if(pattern.test(content))failures.push(`${file}: ${label}`);
}
const p=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
const lock=JSON.parse(readFileSync(resolve(root,'package-lock.json'),'utf8'));
const plugin=JSON.parse(readFileSync(resolve(root,'plugin.json'),'utf8'));
if(p.version!==lock.version||p.version!==lock.packages[''].version||p.version!==plugin.version)failures.push('Release version mismatch');
if(!/WoWCIIdentities\s*=\s*\{\s*\}/.test(readFileSync(resolve(root,'addon/WoWCharacterIntelligence/Identity.lua'),'utf8')))failures.push('Addon contains configured identity');
if(failures.length)throw new Error(failures.join('\n'));
console.log(`Publication checks passed for ${files.length} tracked files; no private values printed.`);
