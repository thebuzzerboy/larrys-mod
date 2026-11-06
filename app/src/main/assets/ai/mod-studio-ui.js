(function(){
"use strict";
function start(){
 if(!window.SandboxModStudio||!document.getElementById("top"))return;
 const $=id=>document.getElementById(id),button=document.createElement("button");button.id="bModStudio";button.textContent="AI Mod Studio";
 const menu=$("bMenu");$("top").insertBefore(button,menu||null);
 const modal=document.createElement("div");modal.className="modal";modal.id="modStudioModal";modal.hidden=true;
 modal.innerHTML='<div style="max-width:760px"><b style="color:var(--or)">EXPERIMENTAL AI MOD STUDIO · DEVELOPER BUILD</b><small>Uses a separately running local StarCoder2-compatible endpoint. This does not download or install a model. Structured props are the default; optional scripts use the restricted experimental API.</small><label>Local endpoint<input id="msUrl" type="text" value="http://127.0.0.1:8080/v1"></label><label>Model name served by your local endpoint<input id="msModel" type="text" placeholder="Enter the exact model name configured in your inference server"></label><label>Mod request<textarea id="msPrompt" rows="4" placeholder="Describe the mod, its appearance, physics and behavior..."></textarea></label><label>Import reference resources<input id="msFiles" type="file" multiple accept=".glb,.gltf,.obj,.png,.jpg,.jpeg,.webp,.wav,.ogg,.mp3,.json,.md,.txt,.js,.ts"></label><label>Notes about imported resources<textarea id="msNotes" rows="2" placeholder="Describe what the models, textures, sounds or source files represent. Binary assets are not interpreted by StarCoder2 yet."></textarea></label><div class="pr"><button id="msGenerate" class="on">Generate mod</button><button id="msValidate">Validate JSON</button><button id="msExport">Export .json</button><button id="msClose">Close</button></div><small id="msStatus">Not connected. Configure a local endpoint and exact model name.</small><label>Generated mod package<textarea id="msOutput" rows="12" spellcheck="false" placeholder="Generated mod JSON appears here..."></textarea></label><small>Resource handling in this build is experimental: files are catalogued and referenced by metadata; binary models, textures and audio are not yet stored or rendered in-game. Never import scripts from sources you do not trust.</small></div>';
 document.body.appendChild(modal);
 const status=msg=>{$("msStatus").textContent=msg},knowledgePromise=Promise.resolve(window.SandboxModStudioKnowledge||"");
 function parseObject(text){
  let t=String(text||"").replace(/^\x60{3}(?:json)?\s*/i,"").replace(/\s*\x60{3}$/,"").trim(),a=t.indexOf("{");
  if(a<0)throw new Error("The model did not return JSON");
  let depth=0,str=false,esc=false;
  for(let i=a;i<t.length;i++){const c=t[i];if(str){if(esc)esc=false;else if(c==="\\")esc=true;else if(c==='"')str=false;continue}if(c==='"'){str=true;continue}if(c==="{")depth++;if(c==="}"&&--depth===0)return JSON.parse(t.slice(a,i+1))}
  throw new Error("Incomplete JSON from model");
 }
 async function resources(){
  const files=Array.from($("msFiles").files),items=window.SandboxModStudio.inspectResources(files),notes=$("msNotes").value.trim();
  const textual=/\\.(json|md|txt|js|ts)$/i;
  return Promise.all(items.map(async(item,i)=>{
    let excerpt="";
    if(textual.test(files[i].name)){
      excerpt=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||"").slice(0,12000));reader.onerror=()=>resolve("[Could not read text resource]");reader.readAsText(files[i])});
    }
    return Object.assign(item,{description:[notes,excerpt].filter(Boolean).join("\\n\\n").slice(0,14000)});
  }));
}
 function validate(){const raw=JSON.parse($("msOutput").value),mod=window.SandboxModStudio.validateMod(raw);$("msOutput").value=JSON.stringify(mod,null,2);status("Package valid · "+mod.items.length+" item(s) · "+mod.items.filter(x=>x.script).length+" scripted item(s)");return mod}
 button.addEventListener("click",()=>{modal.hidden=false});$("msClose").onclick=()=>{modal.hidden=true};
 $("msValidate").onclick=()=>{try{validate()}catch(e){status("Validation failed: "+e.message)}};
 $("msExport").onclick=()=>{try{const mod=validate(),blob=new Blob([JSON.stringify(mod,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=mod.id+".spmod.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status("Exported "+mod.id+".spmod.json")}catch(e){status("Export failed: "+e.message)}};
 $("msGenerate").onclick=async()=>{
  const prompt=$("msPrompt").value.trim(),baseUrl=$("msUrl").value.trim(),model=$("msModel").value.trim();
  if(!prompt){status("Describe the mod first.");return}if(!baseUrl||!model){status("Enter the local endpoint and exact model name.");return}
  const btn=$("msGenerate");btn.disabled=true;status("Preparing game knowledge and resource manifest...");
  try{const [knowledge,manifest]=await Promise.all([knowledgePromise,resources()]),userPrompt=window.SandboxModStudio.buildModPrompt({prompt,knowledge,resources:manifest}),adapter=window.SandboxModStudio.createStarCoder2Adapter({baseUrl,model,maxTokens:4096});
   status("Sending request to local StarCoder2 endpoint...");
   const result=await adapter.complete({messages:[{role:"user",content:userPrompt}]}),mod=window.SandboxModStudio.validateMod(parseObject(result.text));
   $("msOutput").value=JSON.stringify(mod,null,2);status("Generated and validated "+mod.name+" · "+mod.items.length+" item(s). Export the package, then import it through Mods.");
  }catch(error){status("Generation failed: "+String(error&&error.message||error))}finally{btn.disabled=false}
 };
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
