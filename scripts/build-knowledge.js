"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const docOut=path.join(root,"docs","GENERATED_SOURCE_INDEX.md");
const runtimeOut=path.join(root,"app","src","main","assets","ai","game-source-index.js");
const include=/\.(html|js|mjs|cjs|java|json|md|yml|yaml|gradle)$/i;
const skip=new Set(["node_modules",".git","build","dist",".gradle"]);
const excluded=new Set(["docs/GENERATED_SOURCE_INDEX.md","app/src/main/assets/ai/game-source-index.js"]);
const maxBytes=1024*1024,chunkLines=55;
function walk(dir,files=[]){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(skip.has(entry.name))continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full,files);
    else if(entry.isFile()&&include.test(entry.name)&&fs.statSync(full).size<=maxBytes){
      const rel=path.relative(root,full).replace(/\\/g,"/");
      if(!excluded.has(rel))files.push({full,rel});
    }
  }
  return files;
}
function symbols(source){
  const patterns=[/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm,/^\s*(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm,/^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function/gm];
  const found=new Set();
  for(const re of patterns){let m;while((m=re.exec(source)))found.add(m[1]);}
  return [...found].sort().slice(0,250);
}
const files=walk(root).sort((a,b)=>a.rel.localeCompare(b.rel)),chunks=[],lines=["# Generated source inventory","","Generated automatically. This file is a navigation aid; semantic status and public API claims must be reviewed in docs/GAME_KNOWLEDGE.md.","","Files: "+files.length,""];
for(const file of files){
  const source=fs.readFileSync(file.full,"utf8"),sourceLines=source.split(/\r?\n/),names=symbols(source);
  lines.push("## "+file.rel,"","- Bytes: "+Buffer.byteLength(source,"utf8"));
  if(names.length)lines.push("- Detected symbols: "+names.join(", "));
  lines.push("");
  for(let start=0;start<sourceLines.length;start+=chunkLines){
    const chunkText=sourceLines.slice(start,start+chunkLines).join("\n");
    if(chunkText.trim())chunks.push({path:file.rel,startLine:start+1,endLine:Math.min(start+chunkLines,sourceLines.length),text:chunkText});
  }
}
fs.mkdirSync(path.dirname(docOut),{recursive:true});
fs.writeFileSync(docOut,lines.join("\n"),"utf8");
const payload={version:1,files:files.map(f=>f.rel),chunks};
const runtime=[
"(function(root){",
"'use strict';",
"const data="+JSON.stringify(payload)+";",
"const stop=new Set(['the','and','for','with','from','this','that','are','was','were','have','has','you','your','into','only','not','use','using','make','build','mod','game','item','when','then','what','how','can','all','any','its','their','they','them','will','should','would','could','about','there','here','also','more','less','than','such','like','need','want','based']);",
"function terms(s){return String(s||'').toLowerCase().match(/[a-z0-9_$.-]{2,}/g)||[]}",
"function search(query,limit){const q=[...new Set(terms(query).filter(t=>!stop.has(t)))];const ranked=data.chunks.map(c=>{const hay=(c.path+' '+c.text).toLowerCase();let score=0;for(const t of q){let at=0,n=0;while((at=hay.indexOf(t,at))!==-1&&n<12){n++;at+=t.length}score+=n*(c.path.toLowerCase().includes(t)?4:1)}return {c,score}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);return ranked.slice(0,Math.max(1,Math.min(12,Number(limit)||8))).map(x=>'SOURCE '+x.c.path+':'+x.c.startLine+'-'+x.c.endLine+'\\n'+x.c.text)}",
"root.SandboxGameSourceIndex=Object.freeze({version:data.version,files:data.files,chunkCount:data.chunks.length,search});",
"})(typeof window!=='undefined'?window:globalThis);"
].join("\n");
fs.writeFileSync(runtimeOut,runtime,"utf8");
process.stdout.write("Indexed "+files.length+" source files into "+chunks.length+" retrievable chunks.\n");
