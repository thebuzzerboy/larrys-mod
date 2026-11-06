"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
require("../app/src/main/assets/ai/provider-adapters.js");
const api=global.SandboxAIProviders;
function stub(response){global.fetch=async(url,options)=>({ok:true,status:200,json:async()=>response,url,options});}
test("LiteRouter/OpenAI-compatible request uses exact model and Bearer key",async()=>{
 let seen;global.fetch=async(url,options)=>{seen={url,options};return{ok:true,status:200,json:async()=>({model:"router/model",choices:[{message:{content:"{\\\"say\\\":\\\"hello\\\"}"}}]})}};
 const r=await api.request({protocol:"openai",url:"https://api.literouter.com/v1",model:"router/model",key:"test-key"},"system","user");
 assert.equal(seen.url,"https://api.literouter.com/v1/chat/completions");
 assert.equal(seen.options.headers.Authorization,"Bearer test-key");
 assert.equal(JSON.parse(seen.options.body).model,"router/model");
 assert.match(r.text,/hello/);
});
test("LoreLLM-compatible base URL uses OpenAI chat route",async()=>{
 let seen;global.fetch=async(url,options)=>{seen={url,options};return{ok:true,status:200,json:async()=>({choices:[{message:{content:"LoreLLM reply"}}]})}};
 const r=await api.request({protocol:"openai",url:"https://api.lorebary.com/lorellm",model:"LoreLLM",key:"lore-key"},"system","user");
 assert.equal(seen.url,"https://api.lorebary.com/lorellm/chat/completions");
 assert.equal(seen.options.headers.Authorization,"Bearer lore-key");
 assert.equal(r.text,"LoreLLM reply");
});
test("Anthropic Messages format maps system and text blocks",async()=>{
 let seen;global.fetch=async(url,options)=>{seen={url,options};return{ok:true,status:200,json:async()=>({model:"claude-test",content:[{type:"text",text:"Anthropic reply"}]})}};
 const r=await api.request({protocol:"anthropic",url:"https://api.anthropic.com",model:"claude-test",key:"anthropic-key"},"system text","user text");
 assert.equal(seen.url,"https://api.anthropic.com/v1/messages");
 assert.equal(seen.options.headers["x-api-key"],"anthropic-key");
 const body=JSON.parse(seen.options.body);assert.equal(body.system,"system text");assert.equal(body.messages[0].content,"user text");
 assert.equal(r.text,"Anthropic reply");
});
test("Gemini generateContent format maps system and candidate text",async()=>{
 let seen;global.fetch=async(url,options)=>{seen={url,options};return{ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:"Gemini reply"}]}}]})}};
 const r=await api.request({protocol:"gemini",url:"https://generativelanguage.googleapis.com/v1beta",model:"gemini-test",key:"gemini-key"},"system text","user text");
 assert.equal(seen.url,"https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
 assert.equal(seen.options.headers["x-goog-api-key"],"gemini-key");
 assert.equal(JSON.parse(seen.options.body).contents[0].parts[0].text,"user text");
 assert.equal(r.text,"Gemini reply");
});
test("custom proxy supports arbitrary JSON body and response path",async()=>{
 let seen;global.fetch=async(url,options)=>{seen={url,options};return{ok:true,status:200,json:async()=>({result:{reply:"custom reply"}})}};
 const r=await api.request({protocol:"custom",url:"https://proxy.example/api",path:"/generate",model:"m-1",key:"secret",bodyTemplate:'{"engine":{{model}},"system":{{system}},"prompt":{{user}},"history":{{messages}}}',responsePath:"result.reply"},"system text","user text");
 assert.equal(seen.url,"https://proxy.example/api/generate");
 assert.equal(seen.options.headers.Authorization,"Bearer secret");
 const body=JSON.parse(seen.options.body);assert.equal(body.engine,"m-1");assert.equal(body.system,"system text");assert.equal(body.prompt,"user text");assert.equal(body.history.length,2);
 assert.equal(r.text,"custom reply");
});
test("custom proxy reports invalid request templates",async()=>{
 await assert.rejects(()=>api.request({protocol:"custom",url:"https://proxy.example",model:"m",bodyTemplate:"not-json"},"s","u"),/template is invalid JSON/);
});
