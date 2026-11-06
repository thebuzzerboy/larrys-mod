(function (root) {
  "use strict";
  const MAX_SCRIPT=64*1024,MAX_RESOURCES=32,MAX_RESOURCE_BYTES=32*1024*1024;
  const SHAPES=["box","sphere","cylinder","cone","torus"];
  const BEHAVIORS=["none","explode","rocket","float","magnet","spin","turret","heal"];
  const EXTENSIONS={".glb":"model/gltf-binary",".gltf":"model/gltf+json",".obj":"model/obj",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".wav":"audio/wav",".ogg":"audio/ogg",".mp3":"audio/mpeg",".json":"application/json",".md":"text/markdown",".txt":"text/plain",".js":"text/javascript",".ts":"text/typescript"};
  const plain=v=>!!v&&typeof v==="object"&&!Array.isArray(v);
  const clamp=(n,lo,hi)=>{n=Number(n);return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):lo};
  function cleanPart(part){
    part=plain(part)?part:{};
    const shape=SHAPES.includes(part.shape)?part.shape:"box";
    const vec=(v,n,lo,hi)=>Array.from({length:n},(_,i)=>clamp(Array.isArray(v)?v[i]:0,lo,hi));
    return {shape,size:vec(part.size,shape==="sphere"?1:shape==="torus"?2:shape==="box"?3:2,.05,8),pos:vec(part.pos,3,-8,8),rot:vec(part.rot,3,-360,360),color:/^#[0-9a-f]{6}$/i.test(part.color||"")?part.color:"#888888",glow:/^#[0-9a-f]{6}$/i.test(part.glow||"")?part.glow:"#000000"};
  }
  function validateMod(input){
    if(!plain(input))throw new Error("Mod must be a JSON object");
    const id=String(input.id||"").toLowerCase();
    if(!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(id))throw new Error("Invalid mod id");
    const name=String(input.name||"").trim().slice(0,48);if(!name)throw new Error("Mod name is required");
    if(!Array.isArray(input.items)||!input.items.length||input.items.length>30)throw new Error("A mod needs 1–30 items");
    const items=input.items.map((item,index)=>{
      if(!plain(item))throw new Error("Invalid item "+(index+1));
      const parts=(Array.isArray(item.parts)?item.parts:[]).slice(0,12).map(cleanPart);
      const script=typeof item.script==="string"?item.script:"";if(script.length>MAX_SCRIPT)throw new Error("Item script exceeds 64 KiB");
      return {name:String(item.name||("Item "+(index+1))).trim().slice(0,32)||("Item "+(index+1)),mass:clamp(item.mass||1,.1,200),bounce:clamp(item.bounce,0,1),behavior:BEHAVIORS.includes(item.behavior)?item.behavior:"none",power:clamp(item.power||1,.3,3),static:item.static===true,parts:parts.length?parts:[cleanPart({shape:"box"})],script};
    });
    const resources=Array.isArray(input.resources)?input.resources.slice(0,MAX_RESOURCES).map(r=>{
      if(!plain(r)||!/^res_[a-z0-9_-]{1,48}$/i.test(String(r.id||"")))throw new Error("Invalid resource reference");
      return {id:String(r.id),name:String(r.name||"").slice(0,120),type:String(r.type||"").slice(0,80)};
    }):[];
    return {format:"sandbox-protocol-mod",formatVersion:1,id,name,version:String(input.version||"1.0.0").slice(0,24),author:String(input.author||"Unknown").slice(0,48),description:String(input.description||"").slice(0,300),resources,items};
  }
  function createStarCoder2Adapter(options){
    options=options||{};const baseUrl=String(options.baseUrl||"http://127.0.0.1:8080/v1").replace(/\/+$/,""),model=String(options.model||"bigcode/starcoder2-3b");
    return {kind:"local",name:"StarCoder2 (experimental)",model,async complete(request){
      const response=await fetch(baseUrl+"/chat/completions",{method:"POST",headers:Object.assign({"Content-Type":"application/json"},options.apiKey?{Authorization:"Bearer "+options.apiKey}:{}),signal:request.signal,body:JSON.stringify({model,messages:request.messages,temperature:.2,max_tokens:options.maxTokens||4096})});
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error((data.error&&data.error.message)||("Local model HTTP "+response.status));
      const content=data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content;if(typeof content!=="string")throw new Error("Local model returned no text");
      return {text:content,model:data.model||model};
    }};
  }
  function buildModPrompt(request){
    const knowledge=String(request.knowledge||"").slice(0,48000),resources=(request.resources||[]).slice(0,32).map(r=>({id:r.id,name:r.name,type:r.type,size:r.size,description:r.description||""}));
    return ["You are the experimental Sandbox Protocol mod author. Use only APIs explicitly documented below.","Return exactly one JSON object, no Markdown fences, matching format sandbox-protocol-mod, formatVersion 1.","Use structured item fields for physics props. For advanced behavior, put JavaScript in item.script.","Scripts run in a restricted iframe. The only supported bridge calls are api.log(text) and api.spawn(spec).","api.spawn accepts one primitive item spec using documented shape, size, position, rotation, color, mass, static and behavior fields.","No DOM, network, filesystem, Node.js, imports, eval, dynamic code loading, or access to parent/game objects.","Resource references must use IDs supplied below; do not invent resource IDs.","If a requested feature is not implemented or documented, say so in the mod description rather than inventing an API.","Game knowledge base (source of truth; implementation state labels matter):",knowledge,"Imported user resources:",JSON.stringify(resources),"User request:",String(request.prompt||"").slice(0,6000),"Output schema: {format:'sandbox-protocol-mod',formatVersion:1,id,name,version,author,description,resources:[{id,name,type}],items:[{name,mass,bounce,behavior,power,static,parts:[{shape,size,pos,rot,color,glow}],script}]}","Keep scripts short and deterministic. Do not generate infinite loops."].join("\n\n");
  }
  function inspectResources(files){
    if(!files||files.length>MAX_RESOURCES)throw new Error("Import up to 32 resources at once");
    let total=0;return Array.from(files).map((file,i)=>{
      const name=String(file.name||"").toLowerCase(),dot=name.lastIndexOf("."),ext=dot>=0?name.slice(dot):"",type=EXTENSIONS[ext];
      if(!type)throw new Error("Unsupported resource type: "+(ext||"no extension"));
      if(file.size>MAX_RESOURCE_BYTES)throw new Error("Each resource must be 32 MiB or smaller");
      total+=file.size;if(total>MAX_RESOURCE_BYTES)throw new Error("Combined resource size exceeds 32 MiB");
      return {id:"res_"+i+"_"+String(file.name).replace(/[^a-z0-9_-]/gi,"_").slice(0,32),name:file.name,type,size:file.size};
    });
  }
  function createScriptSandbox(options){
    options=options||{};const doc=options.document||root.document;if(!doc)throw new Error("Sandbox requires a document");
    const frame=doc.createElement("iframe");frame.setAttribute("sandbox","allow-scripts");frame.setAttribute("title","Mod script sandbox");frame.style.cssText="position:absolute;width:1px;height:1px;left:-10000px;border:0";
    const nonce="sp_"+Math.random().toString(36).slice(2)+Date.now().toString(36),csp="default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; img-src data: blob:; style-src 'unsafe-inline'";
    const bootstrap=function(n){ "use strict";const nonce=n,send=(type,payload)=>parent.postMessage({channel:"sp-mod",nonce,type,payload},"*");const api=Object.freeze({log:text=>send("log",String(text).slice(0,500)),spawn:spec=>send("spawn",spec)});addEventListener("message",event=>{if(event.source!==parent||!event.data||event.data.channel!=="sp-mod-run"||event.data.nonce!==nonce)return;try{const script=document.createElement("script");script.textContent="(function(api){\n"+String(event.data.code||"")+"\n})(api);";document.body.appendChild(script);script.remove();send("done",null)}catch(error){send("error",String(error&&error.message||error).slice(0,500))}})};
    frame.srcdoc='<!doctype html><meta http-equiv="Content-Security-Policy" content="'+csp+'"><script>('+bootstrap.toString()+')('+JSON.stringify(nonce)+');<\/script>';
    const listener=event=>{if(event.source!==frame.contentWindow||!event.data||event.data.channel!=="sp-mod"||event.data.nonce!==nonce)return;const d=event.data;
      if(d.type==="log"&&options.onLog)options.onLog(String(d.payload||"").slice(0,500));
      else if(d.type==="spawn"&&options.onSpawn){try{options.onSpawn(validateMod({id:"runtime-check",name:"Runtime",items:[d.payload]}).items[0])}catch(error){if(options.onError)options.onError(error.message)}}
      else if(d.type==="error"&&options.onError)options.onError(d.payload);else if(d.type==="done"&&options.onDone)options.onDone();
    };
    root.addEventListener("message",listener);(doc.body||doc.documentElement).appendChild(frame);let destroyed=false;
    return {run(code){if(destroyed)throw new Error("Sandbox is closed");if(typeof code!=="string"||code.length>MAX_SCRIPT)throw new Error("Script must be 64 KiB or smaller");frame.contentWindow.postMessage({channel:"sp-mod-run",nonce,code},"*")},destroy(){if(destroyed)return;destroyed=true;root.removeEventListener("message",listener);frame.remove()}};
  }
  root.SandboxModStudio=Object.freeze({validateMod,createStarCoder2Adapter,buildModPrompt,inspectResources,createScriptSandbox,limits:{maxScript:MAX_SCRIPT,maxResources:MAX_RESOURCES,maxResourceBytes:MAX_RESOURCE_BYTES}});
})(typeof window!=="undefined"?window:globalThis);
