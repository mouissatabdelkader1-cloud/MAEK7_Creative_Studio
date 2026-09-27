import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||3000), HOST=process.env.HOST||'127.0.0.1';
const ROOT=path.join(__dirname,'../client');
const envFile=path.join(__dirname,'../.env');
if(fs.existsSync(envFile)){for(const line of fs.readFileSync(envFile,'utf8').split(/\\r?\\n/)){const m=line.match(/^\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(.*)\\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['\"]|['\"]$/g,'')}}

const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(data));};
const fail=(res,status,msg,details='')=>json(res,status,{ok:false,error:msg,details});
const need=(name,v)=>{if(!v)throw new Error(`${name} API key is not configured on the server.`)};
const body=async(req)=>{const chunks=[];let n=0;for await(const c of req){n+=c.length;if(n>45*1024*1024)throw new Error('Request too large.');chunks.push(c)};const raw=Buffer.concat(chunks).toString();return raw?JSON.parse(raw):{}};
const dataUrl=(s)=>{const m=String(s||'').match(/^data:([^;]+);base64,(.+)$/s);if(!m)throw new Error('Invalid data URL.');return {mime:m[1],buf:Buffer.from(m[2],'base64')}};
async function fetchJson(url,opt={}){const r=await fetch(url,opt);const t=await r.text();let d;try{d=JSON.parse(t)}catch{d={raw:t}}if(!r.ok)throw new Error(d?.error?.message||d?.detail||`HTTP ${r.status}`);return d}
async function gemini(pathname,opt={}){need('GEMINI',process.env.GEMINI_API_KEY);return fetchJson('https://generativelanguage.googleapis.com/v1beta'+pathname,{...opt,headers:{'x-goog-api-key':process.env.GEMINI_API_KEY,...(opt.headers||{})}})}
function sendFile(res,file){const ext=path.extname(file);const type=ext==='.html'?'text/html; charset=utf-8':'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});fs.createReadStream(file).pipe(res)}


async function falRequest(model,input){
 need('FAL',process.env.FAL_KEY);
 const r=await fetch(`https://queue.fal.run/${model}`,{method:'POST',headers:{Authorization:`Key ${process.env.FAL_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({input})});
 const d=await r.json(); if(!r.ok)throw Error(d?.detail||d?.error||`fal HTTP ${r.status}`); return d.request_id||d.requestId;
}
async function falStatus(model,id){
 const r=await fetch(`https://queue.fal.run/${model}/requests/${encodeURIComponent(id)}/status`,{headers:{Authorization:`Key ${process.env.FAL_KEY}`}});
 const d=await r.json(); if(!r.ok)throw Error(d?.detail||d?.error||`fal status HTTP ${r.status}`); return d;
}
async function falResult(model,id){
 const r=await fetch(`https://queue.fal.run/${model}/requests/${encodeURIComponent(id)}`,{headers:{Authorization:`Key ${process.env.FAL_KEY}`}});
 const d=await r.json(); if(!r.ok)throw Error(d?.detail||d?.error||`fal result HTTP ${r.status}`); return d;
}
async function falWait(model,id,limit=60){
 for(let i=0;i<limit;i++){const st=await falStatus(model,id);if(st.status==='COMPLETED')return falResult(model,id);if(st.status==='FAILED')throw Error(st.error||'fal generation failed');await new Promise(r=>setTimeout(r,2000));}
 throw Error('fal generation timed out');
}

async function imageGenerate(x){
 const {provider='openai',model,prompt,size='1024x1024',quality='auto',background='auto'}=x;if(!prompt?.trim())throw Object.assign(new Error('Prompt is required.'),{status:400});
 if(provider==='openai'){need('OPENAI',process.env.OPENAI_API_KEY);const d=await fetchJson('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:model||'gpt-image-1',prompt,size,quality,background,output_format:'png'})});const b=d.data?.[0]?.b64_json;if(!b)throw Error('OpenAI returned no image.');return {ok:true,type:'image',provider,model:model||'gpt-image-1',dataUrl:`data:image/png;base64,${b}`}}
 if(provider==='gemini'){const d=await gemini('/interactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:model||'gemini-3.1-flash-image',input:prompt,response_format:{type:'image',mime_type:'image/png',aspect_ratio:size==='1024x1024'?'1:1':size==='1024x1536'?'2:3':'16:9',image_size:'1K'}})});const i=d.output_image;if(!i?.data)throw Error('Gemini returned no image.');return {ok:true,type:'image',provider,model:model||'gemini-3.1-flash-image',dataUrl:`data:${i.mime_type||'image/png'};base64,${i.data}`}}
 if(provider==='custom'){need('CUSTOM',process.env.CUSTOM_API_KEY);need('CUSTOM_BASE_URL',process.env.CUSTOM_BASE_URL);const d=await fetchJson(process.env.CUSTOM_BASE_URL.replace(/\/$/,'')+'/images/generations',{method:'POST',headers:{Authorization:`Bearer ${process.env.CUSTOM_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:model||process.env.CUSTOM_IMAGE_MODEL,prompt,size})});const i=d.data?.[0];if(i?.b64_json)return {ok:true,type:'image',provider,model,dataUrl:`data:image/png;base64,${i.b64_json}`};if(i?.url)return {ok:true,type:'image',provider,model,url:i.url};throw Error('Custom provider returned no image.')}
 if(provider==='fal'){const id=await falRequest('fal-ai/flux/schnell',{prompt});const d=await falWait('fal-ai/flux/schnell',id);const u=d?.images?.[0]?.url;if(!u)throw Error('fal returned no image URL.');return {ok:true,type:'image',provider,model:'fal-ai/flux/schnell',url:u,requestId:id}}
 throw Error('Unknown or unsupported image provider.');
}
async function imageEdit(x){
 const {provider='openai',model,prompt,imageData}=x;if(!prompt?.trim()||!imageData)throw Object.assign(new Error('Prompt and image are required.'),{status:400});
 const {mime,buf}=dataUrl(imageData);
 if(provider==='openai'){need('OPENAI',process.env.OPENAI_API_KEY);const f=new FormData();f.append('model',model||'gpt-image-1');f.append('prompt',prompt);f.append('image',new Blob([buf],{type:mime}),'input.png');const d=await fetchJson('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:f});const b=d.data?.[0]?.b64_json;if(!b)throw Error('OpenAI returned no edited image.');return {ok:true,type:'image',provider,model:model||'gpt-image-1',dataUrl:`data:image/png;base64,${b}`}}
 if(provider==='gemini'){const d=await gemini('/interactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:model||'gemini-3.1-flash-image',input:[{type:'text',text:prompt},{type:'image',mime_type:mime,data:buf.toString('base64')}],response_format:{type:'image',mime_type:'image/png',aspect_ratio:'1:1',image_size:'1K'}})});const i=d.output_image;if(!i?.data)throw Error('Gemini returned no edited image.');return {ok:true,type:'image',provider,model:model||'gemini-3.1-flash-image',dataUrl:`data:${i.mime_type||'image/png'};base64,${i.data}`}}
 throw Error('This provider does not support image editing in MAEK7 yet.');
}
async function videoGenerate(x){
 const {provider='openai',model,prompt,seconds='8',size='1280x720',imageData}=x;if(!prompt?.trim())throw Object.assign(new Error('Prompt is required.'),{status:400});
 if(provider==='openai'){need('OPENAI',process.env.OPENAI_API_KEY);const f=new FormData();f.append('model',model||'sora-2');f.append('prompt',prompt);f.append('seconds',String(seconds));f.append('size',size);if(imageData){const {mime,buf}=dataUrl(imageData);f.append('input_reference',new Blob([buf],{type:mime}),'reference.png')}const d=await fetchJson('https://api.openai.com/v1/videos',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:f});return {ok:true,type:'video-job',provider,model:model||'sora-2',jobId:d.id,status:d.status,progress:d.progress||0}}
 if(provider==='gemini'){const inst={prompt};if(imageData){const {mime,buf}=dataUrl(imageData);inst.image={inlineData:{mimeType:mime,data:buf.toString('base64')}}}const d=await gemini(`/models/${model||'veo-3.1-generate-preview'}:predictLongRunning`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instances:[inst],parameters:{aspectRatio:size==='720x1280'?'9:16':'16:9',resolution:'720p',numberOfVideos:1}})});return {ok:true,type:'video-job',provider,model:model||'veo-3.1-generate-preview',jobId:d.name,status:'processing',progress:0}}
 if(provider==='fal'){const mdl=model||'fal-ai/wan/v2.2-a14b/image-to-video';if(!imageData)throw Error('fal image-to-video requires a reference image.');const id=await falRequest(mdl,{prompt,image_url:imageData});return {ok:true,type:'video-job',provider,model:mdl,jobId:id,status:'processing',progress:0}}
 throw Error('Unsupported video provider in this build.');
}
async function videoStatus(u){
 const provider=u.searchParams.get('provider'),id=u.searchParams.get('id');if(!provider||!id)throw Object.assign(new Error('provider and id are required'),{status:400});
 if(provider==='openai'){need('OPENAI',process.env.OPENAI_API_KEY);const d=await fetchJson('https://api.openai.com/v1/videos/'+encodeURIComponent(id),{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}});return {ok:true,provider,status:d.status,progress:d.progress||0,job:d}}
 if(provider==='gemini'){const d=await gemini('/'+id);const done=!!d.done;const v=d?.response?.generateVideoResponse?.generatedSamples?.[0]?.video;return {ok:true,provider,status:done?(d.error?'failed':'completed'):'processing',progress:done?100:10,job:d,videoUri:v?.uri||null}}
 if(provider==='fal'){const mdl=u.searchParams.get('model')||'fal-ai/wan/v2.2-a14b/image-to-video';const d=await falStatus(mdl,id);return {ok:true,provider,status:d.status==='COMPLETED'?'completed':d.status==='FAILED'?'failed':'processing',progress:d.status==='COMPLETED'?100:15,job:d}}
 throw Error('Unknown provider.');
}

const server=http.createServer(async(req,res)=>{
 try{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'});return res.end()}
  const u=new URL(req.url,`http://${req.headers.host}`);
  if(req.method==='GET'&&u.pathname==='/api/health')return json(res,200,{ok:true,service:'MAEK7 Creative Studio',time:new Date().toISOString(),providers:{openai:!!process.env.OPENAI_API_KEY,gemini:!!process.env.GEMINI_API_KEY,fal:!!process.env.FAL_KEY,custom:!!process.env.CUSTOM_API_KEY}});
  if(req.method==='GET'&&u.pathname==='/api/providers')return json(res,200,{ok:true,providers:[
   {id:'openai',name:'OpenAI',enabled:!!process.env.OPENAI_API_KEY,images:['gpt-image-1','gpt-image-1-mini'],videos:['sora-2','sora-2-pro']},
   {id:'gemini',name:'Google Gemini',enabled:!!process.env.GEMINI_API_KEY,images:['gemini-3.1-flash-image','gemini-3-pro-image'],videos:['veo-3.1-generate-preview','veo-3.1-lite-generate-preview']},
   {id:'fal',name:'fal.ai',enabled:!!process.env.FAL_KEY,images:['fal-ai/flux/schnell'],videos:['fal-ai/wan/v2.2-a14b/image-to-video']},
   {id:'custom',name:'Custom OpenAI-compatible',enabled:!!process.env.CUSTOM_API_KEY&&!!process.env.CUSTOM_BASE_URL,images:[process.env.CUSTOM_IMAGE_MODEL||'configured-model'],videos:[]}
  ]});
  if(req.method==='POST'&&u.pathname==='/api/image/generate')return json(res,200,await imageGenerate(await body(req)));
  if(req.method==='POST'&&u.pathname==='/api/image/edit')return json(res,200,await imageEdit(await body(req)));
  if(req.method==='POST'&&u.pathname==='/api/video/generate')return json(res,200,await videoGenerate(await body(req)));
  if(req.method==='GET'&&u.pathname==='/api/video/status')return json(res,200,await videoStatus(u));
  if(req.method==='GET'&&u.pathname==='/api/video/content'){const provider=u.searchParams.get('provider'),id=u.searchParams.get('id');let r;if(provider==='openai'){need('OPENAI',process.env.OPENAI_API_KEY);r=await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(id)}/content`,{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}})}else{need('GEMINI',process.env.GEMINI_API_KEY);r=await fetch(u.searchParams.get('uri'),{headers:{'x-goog-api-key':process.env.GEMINI_API_KEY}})}if(!r.ok)throw Error(`Video download HTTP ${r.status}`);res.writeHead(200,{'Content-Type':'video/mp4','Content-Disposition':'attachment; filename="maek7-video.mp4"','Access-Control-Allow-Origin':'*'});return res.end(Buffer.from(await r.arrayBuffer()))}
  if(req.method==='GET'){const p=u.pathname==='/'?'/index.html':u.pathname;const f=path.normalize(path.join(ROOT,p));if(f.startsWith(ROOT)&&fs.existsSync(f)&&fs.statSync(f).isFile())return sendFile(res,f)}
  return fail(res,404,'Not found');
 }catch(e){console.error(e);return fail(res,e.status||500,e.message||'Server error')}
});
server.listen(PORT,HOST,()=>console.log(`MAEK7 Creative Studio running at http://${HOST}:${PORT}`));
