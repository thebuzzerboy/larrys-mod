"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
require("../app/src/main/assets/ai/mod-studio-core.js");
const M=global.SandboxModStudio;
test("validates structured and scripted mod packages",()=>{const m=M.validateMod({id:"test_mod",name:"Test",items:[{name:"Cube",parts:[{shape:"box",size:[1,2,3]}],script:"api.log('hello')"}]});assert.equal(m.format,"sandbox-protocol-mod");assert.equal(m.items[0].script,"api.log('hello')");assert.deepEqual(m.items[0].parts[0].size,[1,2,3])});
test("rejects malformed identifiers, excessive scripts and empty packages",()=>{assert.throws(()=>M.validateMod({id:"x",name:"Bad",items:[{}]}),/id/);assert.throws(()=>M.validateMod({id:"ok_mod",name:"Bad",items:[{script:"x".repeat(65537)}]}),/64 KiB/);assert.throws(()=>M.validateMod({id:"ok_mod",name:"Bad",items:[]}),/1–30/)});
test("builds source-aware prompts with imported resource references",()=>{const p=M.buildModPrompt({prompt:"make a hover crate",knowledge:"mkProp is implemented",resources:[{id:"res_0_mesh",name:"crate.glb",type:"model/gltf-binary"}]});assert.match(p,/mkProp is implemented/);assert.match(p,/res_0_mesh/);assert.match(p,/restricted iframe/)});
test("recognizes safe resource formats and enforces size limits",()=>{assert.equal(M.inspectResources([{name:"mesh.glb",size:100}])[0].type,"model/gltf-binary");assert.throws(()=>M.inspectResources([{name:"bad.exe",size:1}]),/Unsupported/);assert.throws(()=>M.inspectResources([{name:"large.png",size:33554433}]),/32 MiB/)});

test("retrieves relevant source chunks from the generated game index",()=>{
  require("../app/src/main/assets/ai/game-source-index.js");
  const hits=global.SandboxGameSourceIndex.search("mkProp spawnPos turret physics",8);
  assert.ok(hits.length>0);
  assert.match(hits.join("\n"),/mkProp|spawnPos|turret/i);
});
