(function(root){
"use strict";
function urlJoin(base,path){base=String(base||"").replace(/\/+$/,"");path=String(path||"").trim();if(!path)return base;if(/^https?:\/\//i.test(path))return path;return base+(path.charAt(0)==="/"?"":"/")+path;}
function getPath(obj,path){return String(path||"").split(".").filter(Boolean).reduce((v,k)=>v==null?undefined:v[k],obj);}
function parseText(value){if(typeof value==="string")return value;if(Array.isArray(value))return value.map(x=>typeof x==="string"?x:x&&x.text||"").join("");return value==null?"":String(value);}
async function request(cfg,sys,user,signal){
 cfg=cfg||{};const protocol=cfg.protocol||"openai",base=String(cfg.url||"").trim(),model=String(cfg.model||"").trim(),key=String(cfg.key||"");
 if(!base)throw new Error("Set a provider or proxy URL first");
 if(!model)throw new Error("Enter the exact model ID/name required by this provider");
 const messages=[{role:"system",content:String(sys||"")},{role:"user",content:String(user||"")}];
 let endpoint,headers={"Content-Type":"application/json"},body;
 if(protocol==="anthropic"){
  endpoint=urlJoin(base,cfg.path||"/v1/messages");if(key)headers["x-api-key"]=key;headers["anthropic-version"]=cfg.apiVersion||"2023-06-01";
  body={model,max_tokens:Number(cfg.maxTokens)||2048,system:String(sys||""),messages:[{role:"user",content:String(user||"")}]};
 }else if(protocol==="gemini"){
  endpoint=urlJoin(base,(cfg.path||("/models/"+encodeURIComponent(model)+":generateContent")));
  if(key)headers["x-goog-api-key"]=key;
  body={systemInstruction:{parts:[{text:String(sys||"")}]},contents:[{role:"user",parts:[{text:String(user||"")}]}],generationConfig:{temperature:1,maxOutputTokens:Number(cfg.maxTokens)||2048}};
 }else if(protocol==="custom"){
  endpoint=urlJoin(base,cfg.path||"");if(key)headers[cfg.authHeader||"Authorization"]=(cfg.authPrefix===undefined?"Bearer ":cfg.authPrefix)+key;
  const template=String(cfg.bodyTemplate||'{"model":"{{model}}","messages":{{messages}}}');
  const replacements={"model":JSON.stringify(model),"system":JSON.stringify(String(sys||"")),"user":JSON.stringify(String(user||"")),"messages":JSON.stringify(messages)};
  const raw=template.replace(/\{\{(model|system|user|messages)\}\}/g,(_,name)=>replacements[name]);
  try{body=JSON.parse(raw)}catch(e){throw new Error("Custom request body template is invalid JSON: "+e.message)}
 }else{
  endpoint=urlJoin(base,cfg.path||"/chat/completions");if(key)headers.Authorization="Bearer "+key;
  body={model,messages,temperature:1};
 }
 const response=await fetch(endpoint,{method:"POST",headers,signal,body:JSON.stringify(body)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){const detail=data&&data.error&&(data.error.message||data.error);throw new Error((typeof detail==="string"?detail:"Provider HTTP "+response.status));}
 let content,returnedModel=model;
 if(protocol==="anthropic"){content=(data.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("");returnedModel=data.model||model;}
 else if(protocol==="gemini"){content=(data.candidates&&data.candidates[0]&&data.candidates[0].content&&data.candidates[0].content.parts||[]).map(x=>x.text||"").join("");}
 else if(protocol==="custom"){content=getPath(data,cfg.responsePath||"choices.0.message.content");returnedModel=data.model||model;}
 else{content=data&&data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content;returnedModel=data.model||model;}
 content=parseText(content).replace(/<think>[\s\S]*?<\/think>/g,"").trim();
 if(!content)throw new Error("Provider response did not contain text. Check its response format/path.");
 return {text:content,model:returnedModel};
}
root.SandboxAIProviders=Object.freeze({request,urlJoin,getPath});
})(typeof window!=="undefined"?window:globalThis);
