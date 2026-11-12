import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {dirname,resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'})
  .split('\0').filter(file=>file.endsWith('.md'));
const withoutFences=text=>text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm,'');
const anchors=new Map();
function headings(path){
  if(anchors.has(path))return anchors.get(path);
  const used=new Map(),ids=new Set();
  for(const match of withoutFences(readFileSync(path,'utf8')).matchAll(/^#{1,6} +(.+?) *#*$/gm)){
    const base=match[1].toLowerCase().replace(/[`*_~]/g,'').replace(/[^\p{L}\p{N}\p{M}_ -]/gu,'').replace(/ /g,'-');
    const count=used.get(base)??0;used.set(base,count+1);ids.add(base+(count?'-'+count:''));
  }
  anchors.set(path,ids);return ids;
}
const failures=[];let links=0;
for(const file of files){
  const path=resolve(root,file),content=withoutFences(readFileSync(path,'utf8'));
  for(const match of content.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)){
    const href=match[1];if(/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href))continue;
    const [target,fragment]=href.split('#'),resolved=target?resolve(dirname(path),decodeURIComponent(target)):path;
    links++;
    if(resolved!==root&&!resolved.startsWith(root+sep)){failures.push(`${file}: link escapes repository: ${href}`);continue;}
    if(!existsSync(resolved)){failures.push(`${file}: missing target ${href}`);continue;}
    if(fragment&&resolved.endsWith('.md')&&statSync(resolved).isFile()&&!headings(resolved).has(decodeURIComponent(fragment)))
      failures.push(`${file}: missing heading ${href}`);
  }
}
for(const file of ['README.md','CHANGELOG.md','SECURITY.md','CONTRIBUTING.md',
  ...['README','SETUP','SYNC-MODES','CONFIGURATION','OPERATIONS','TOOL-REFERENCE','OPTICAL-PROTOCOL','REVIEW','DEVELOPMENT','VALIDATION'].map(name=>`docs/${name}.md`)])
  if(!existsSync(resolve(root,file)))failures.push(`Missing required documentation: ${file}`);
if(failures.length)throw new Error(failures.join('\n'));
console.log(`Documentation checks passed: ${files.length} Markdown files, ${links} local links/anchors.`);
