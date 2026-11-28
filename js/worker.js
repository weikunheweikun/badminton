/* Career worker. No blob URLs or embedded source code. */
importScripts("../engine/spatial.js?v=15.1", "../engine/spatial-bridge.js?v=15.1");
const CDN='https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
const rootURL=new URL('../',self.location.href);
let py,initializing;
async function fetchText(path){
 const url=new URL(path,rootURL);url.searchParams.set('v','15.1');const res=await fetch(url);
 if(!res.ok)throw Error(`无法读取 ${path} (HTTP ${res.status})`);
 return res.text();
}
async function loadSources(){
 const manifest=JSON.parse(await fetchText('data/runtime-manifest.json'));
 if(!Array.isArray(manifest.files))throw Error('运行文件清单无效');
 const entries=await Promise.all(manifest.files.map(async ({path,url})=>{
  if(typeof path!=='string'||typeof url!=='string'||!/^[-\w./]+$/.test(path)||path.startsWith('/')||path.split('/').includes('..')||!/^[-\w./]+$/.test(url)||url.startsWith('/')||url.split('/').includes('..'))throw Error('运行文件路径无效');
  return [path,await fetchText(url)];
 }));
 return entries;
}
async function start(){
 const sources=loadSources();
 // Attach a rejection handler immediately while the external runtime loads.
 sources.catch(()=>{});
 importScripts(CDN+'pyodide.js');
 const [runtime,entries]=await Promise.all([loadPyodide({indexURL:CDN}),sources]);
 runtime.FS.mkdir('/smash');runtime.FS.mkdir('/smash/engine');
 for(const [name,content] of entries)runtime.FS.writeFile('/smash/'+name,content,{encoding:'utf8'});
 await runtime.runPythonAsync("import sys; sys.path.insert(0, '/smash'); import web_adapter");
 py=runtime;
}
let queue=Promise.resolve();
self.onmessage=({data:m})=>{queue=queue.then(()=>handleMessage(m));};
async function handleMessage(m){
 try{
  if(m.action==='init'){initializing ||= start();await initializing;}
  if(!py)throw Error('比赛引擎尚未初始化');
  py.globals.set('web_action',m.action==='init'?'preview':m.action);
  py.globals.set('web_data',JSON.stringify(m.data||{}));
  const result=JSON.parse(await py.runPythonAsync('web_adapter.rpc(web_action,web_data)'));
  if(m.action==='init'&&result.error)throw Error(result.error);
  self.postMessage({id:m.id,result});
 }catch(e){self.postMessage({id:m.id,error:String(e.message||e)});}
};
