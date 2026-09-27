import assert from 'node:assert/strict';
const base='http://127.0.0.1:3311';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const p=await import('node:child_process').then(({spawn})=>spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'3311',HOST:'127.0.0.1'},stdio:'ignore'}));
try{
 await sleep(500);
 let r=await fetch(base+'/api/health'); assert.equal(r.status,200); let d=await r.json(); assert.equal(d.ok,true);
 r=await fetch(base+'/api/providers'); assert.equal(r.status,200); d=await r.json(); assert.ok(d.providers.length>=4);
 r=await fetch(base+'/api/image/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:'openai',prompt:''})}); assert.equal(r.status,400);
 r=await fetch(base+'/api/video/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:'openai',prompt:''})}); assert.equal(r.status,400);
 r=await fetch(base+'/'); assert.equal(r.status,200); const html=await r.text(); assert.ok(html.includes('MAEK7 Creative Studio')); assert.ok(html.includes('/api/video/generate'));
 console.log('SMOKE TESTS: PASS');
} finally {p.kill();}
