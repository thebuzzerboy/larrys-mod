"use strict";
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const output=path.join(root,"docs","GENERATED_SOURCE_INDEX.md");
const include=/\.(html|js|mjs|cjs|java|json|md|yml|yaml|gradle)$/i;
const skip=new Set(["node_modules",".git","build","dist",".gradle"]);
const maxBytes=1024*1024;
function walk(dir,files=[]){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(skip.has(entry.name))continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full,files);
    else if(entry.isFile()&&include.test(entry.name)&&fs.statSync(full).size<=maxBytes)files.push(full);
  }
  return files;
}
function symbols(source){
  const patterns=[
    /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
    /^\s*(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm,
    /^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function/gm
  ];
  const found=new Set();
  for(const re of patterns){let match;while((match=re.exec(source)))found.add(match[1]);}
  return [...found].sort().slice(0,250);
}
const files=walk(root).sort();
const lines=["# Generated source inventory","","> Generated automatically. This is a navigation aid, not a semantic API specification. Verify every symbol in its source and consult docs/GAME_KNOWLEDGE.md for implementation status.","","Files: "+files.length,""];
for(const file of files){
  const rel=path.relative(root,file).replace(/\\/g,"/");
  const source=fs.readFileSync(file,"utf8");
  const names=symbols(source);
  lines.push("## "+rel,"","- Bytes: "+Buffer.byteLength(source,"utf8"));
  if(names.length)lines.push("- Detected symbols: "+names.join(", "));
  lines.push("");
}
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,lines.join("\n"),"utf8");
process.stdout.write("Indexed "+files.length+" source files into docs/GENERATED_SOURCE_INDEX.md\n");
