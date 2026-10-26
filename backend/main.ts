import {app,BrowserWindow,dialog,ipcMain,safeStorage,shell,session} from 'electron';
import {mkdir,readFile,writeFile,realpath,copyFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Store} from './store.js';
import {TaskService} from './service.js';
import {requestSchema} from './validation.js';
import {outputDir,readable,within,writeOutput} from './files.js';
import type {Preview,SettingsView,Task,Workspace} from '../shared/types.js';
const here=path.dirname(fileURLToPath(import.meta.url));const smoke=process.argv.includes('--smoke');
if(smoke)app.setPath('userData',path.join('/tmp',`relaydesk-smoke-${process.pid}`));
let win:BrowserWindow;let service:TaskService;let store:Store;
let settings={dshExecutable:'',encryptedToken:''};let token='';
async function secureAvailable(){return safeStorage.isEncryptionAvailable()&&(process.platform!=='linux'||safeStorage.getSelectedStorageBackend()!=='basic_text');}
async function settingsView():Promise<SettingsView>{return {dshExecutable:settings.dshExecutable,hasWorkbuddyToken:!!token,secureStorage:await secureAvailable()};}
async function initialize(){
 const data=app.getPath('userData');await mkdir(data,{recursive:true});try{settings=JSON.parse(await readFile(path.join(data,'settings.json'),'utf8'));if(settings.encryptedToken&&await secureAvailable())token=safeStorage.decryptString(Buffer.from(settings.encryptedToken,'base64'));}catch{/* first launch or unavailable keychain; do not log credentials */}
 store=new Store(path.join(data,'relaydesk.sqlite'));service=new TaskService(store,{dsh:()=>settings.dshExecutable,token:()=>token},e=>{if(win&&!win.isDestroyed())win.webContents.send('relaydesk:event',e);});
 ipcMain.handle('relaydesk:request',async(event,input)=>{try{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('无效调用来源');const r=requestSchema.parse(input);let value:unknown;
 switch(r.op){
 case 'snapshot':value=service.snapshot();break;
 case 'workspace.create':{const result=await dialog.showOpenDialog(win,{title:'选择并授权工作区目录',properties:['openDirectory','createDirectory']});if(result.canceled)return {ok:true,value:null};const directory=await realpath(result.filePaths[0]);const existing=store.list<Workspace>('workspaces').find(w=>w.directory===directory);const w=existing||{id:randomUUID(),name:path.basename(directory)||directory,directory,createdAt:new Date().toISOString()};if(!existing)store.putWorkspace(w);value=w;break;}
 case 'task.create':value=service.create(r.workspaceId,r.engine,r.goal);break;
 case 'task.detail':value=service.detail(r.taskId);break;
 case 'task.start':value=await service.start(r.taskId);break;
 case 'task.cancel':value=await service.cancel(r.taskId);break;
 case 'task.artifacts':value=await service.syncArtifacts(r.taskId);break;
 case 'task.recover':value=await service.recover(r.taskId);break;
 case 'task.approve':value=await service.approve(r.taskId,r.requestId,r.optionId);break;
 case 'task.inputs':{const t=store.task(r.taskId);if(t.status!=='draft')throw new Error('只能给草稿添加文件');if(!service.adapter(t.engine).info().capabilities.files)throw new Error('引擎没有已验证的上传能力');const selected=await dialog.showOpenDialog(win,{title:'选择要提供给引擎的资料（将复制到工作区）',properties:['openFile','multiSelections']});if(selected.canceled)break;const w=store.workspace(t.workspaceId);const dir=await outputDir(w.directory,t.id);for(const f of selected.filePaths.slice(0,20)){const s=await stat(f);if(!s.isFile()||s.size>20*1024*1024)throw new Error('输入文件须小于 20MB');const id=randomUUID();const target=path.join(dir,`${id}-${path.basename(f)}`);await copyFile(await realpath(f),target,1);t.inputs.push({id,name:path.basename(f),path:await within(w.directory,target),size:s.size});}store.putTask(t);value=t;break;}
 case 'handoff.draft':value=service.draft(r.taskId);break;
 case 'handoff.create':value=await service.relay(r.taskId,r.engine,r.handoff);break;
 case 'engine.check':value=await service.adapter(r.engine).check();break;
 case 'settings.get':value=await settingsView();break;
 case 'settings.save':{if(r.settings.dshExecutable!==undefined){const p=r.settings.dshExecutable.trim();if(p&&!path.isAbsolute(p))throw new Error('DSH 路径必须是绝对路径');settings.dshExecutable=p;}if(r.settings.clearToken){token='';settings.encryptedToken='';}if(r.settings.workbuddyToken){if(!await secureAvailable())throw new Error('系统凭据加密不可用，拒绝保存凭据');token=r.settings.workbuddyToken.trim();settings.encryptedToken=safeStorage.encryptString(token).toString('base64');}await writeFile(path.join(data,'settings.json'),JSON.stringify(settings),{mode:0o600});value=await settingsView();break;}
 case 'artifact.preview':case 'artifact.export':case 'artifact.open':case 'artifact.reveal':{let a=store.artifact(r.artifactId);const task=store.task(a.taskId);const w=store.workspace(task.workspaceId);if(a.location.kind==='remote'){const adapter=service.adapter(a.engine);if(!adapter.downloadArtifact)throw new Error('该成果没有已验证的下载能力');const sourceRemoteFileId=a.location.fileId;const bytes=await adapter.downloadArtifact(task,a);const f=await writeOutput(w.directory,task.id,`${randomUUID()}-${path.basename(a.name)}`,bytes);a={...a,sourceRemoteFileId,location:{kind:'local',path:f}};store.append({type:'artifact.created',artifact:a,taskId:task.id,eventId:randomUUID(),timestamp:new Date().toISOString(),sequence:0});}if(a.location.kind!=='local')throw new Error('成果尚未下载');const f=await readable(w.directory,a.location.path);
 if(r.op==='artifact.export'){const target=await dialog.showSaveDialog(win,{defaultPath:a.name,title:'导出成果'});if(!target.canceled&&target.filePath){const content=await readFile(f);await writeFile(target.filePath,content);value=true;}}
 if(r.op==='artifact.reveal')shell.showItemInFolder(f);
 if(r.op==='artifact.open'){const error=await shell.openPath(f);if(error)throw new Error(error);}
 if(r.op==='artifact.preview'){const content=await readFile(f);let kind:Preview['kind']='unsupported';let text='';const ext=path.extname(a.name).toLowerCase();if(['.md','.markdown'].includes(ext))kind='markdown';else if(['.txt','.json','.ts','.js','.py','.log'].includes(ext))kind='text';else if(ext==='.csv')kind='csv';else if(['.png','.jpg','.jpeg','.gif','.webp'].includes(ext)){kind='image';text=`data:${ext==='.jpg'?'image/jpeg':a.mime};base64,${content.toString('base64')}`;}else if(ext==='.pdf'){kind='pdf';text=`data:application/pdf;base64,${content.toString('base64')}`;}else if(['.html','.htm'].includes(ext))kind='html';if(['markdown','text','csv','html'].includes(kind))text=content.toString('utf8');value={kind,content:text,name:a.name} satisfies Preview;}
 break;}
 }
 return {ok:true,value};}catch(e){return {ok:false,error:e instanceof Error?e.message:'操作失败'};}});
 session.defaultSession.setPermissionRequestHandler((_wc,_p,callback)=>callback(false));
 win=new BrowserWindow({width:1440,height:940,minWidth:1080,minHeight:720,title:'RelayDesk · 接力工作台',backgroundColor:'#f7f8fa',titleBarStyle:'hiddenInset',webPreferences:{preload:path.join(here,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.on('will-attach-webview',e=>e.preventDefault());
 const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:5173 ws://127.0.0.1:5173; worker-src 'self' blob:; frame-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'";
 session.defaultSession.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':[csp]}}));
 if(process.env.RELAYDESK_DEV==='1')await win.loadURL('http://127.0.0.1:5173');else await win.loadFile(path.join(here,'../../dist/index.html'));
 if(smoke){try{await new Promise(r=>setTimeout(r,800));const renderer=await win.webContents.executeJavaScript(`({title:document.title,text:document.body.innerText,bridge:!!window.relaydesk})`);if(!renderer.bridge||!renderer.text.includes('RelayDesk'))throw new Error('Renderer failed');const dir=path.join(data,'workspace');await mkdir(dir,{recursive:true});const w={id:randomUUID(),name:'Smoke',directory:dir,createdAt:new Date().toISOString()};store.putWorkspace(w);const task=service.create(w.id,'demo','验证桌面演示与接力');await service.start(task.id);for(let i=0;i<200&&!['completed','interrupted','failed'].includes(store.task(task.id).status);i++)await new Promise(r=>setTimeout(r,100));if(store.task(task.id).status!=='completed')throw new Error('Demo did not complete');const h=service.draft(task.id);const child=await service.relay(task.id,'demo-review',h);await service.start(child.id);for(let i=0;i<200&&store.task(child.id).status!=='completed';i++)await new Promise(r=>setTimeout(r,100));if(store.task(child.id).status!=='completed')throw new Error('Relay failed');await new Promise(r=>setTimeout(r,300));
 await win.webContents.executeJavaScript(`document.querySelector('.task-row')?.click()`);await new Promise(r=>setTimeout(r,300));
 const completed=await win.webContents.executeJavaScript(`document.body.innerText.includes('本阶段已完成')`);if(!completed)throw new Error('Task UI not populated');
 await writeFile(path.join(data,'task.png'),(await win.webContents.capturePage()).toPNG());
 const previewKinds=[];for(const artifact of service.detail(child.id).artifacts){const response:any=await win.webContents.executeJavaScript(`window.relaydesk.request({op:'artifact.preview',artifactId:${JSON.stringify(artifact.id)}})`);previewKinds.push(response.kind);if(!response.content)throw new Error('Empty preview');}
 await win.webContents.executeJavaScript(`document.querySelector('.artifact-main')?.click()`);await new Promise(r=>setTimeout(r,300));if(!await win.webContents.executeJavaScript(`!!document.querySelector('.preview-modal')`))throw new Error('Preview UI missing');for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript(`!!document.querySelector('canvas[data-rendered="true"]')`))break;await new Promise(r=>setTimeout(r,100));}if(!await win.webContents.executeJavaScript(`!!document.querySelector('canvas[data-rendered="true"]')`))throw new Error('PDF canvas was not rendered');await writeFile(path.join(data,'preview.png'),(await win.webContents.capturePage()).toPNG());
 await win.webContents.executeJavaScript(`document.querySelector('.preview-modal .modal-header button')?.click();document.querySelector('.complete-card button')?.click()`);await new Promise(r=>setTimeout(r,300));if(!await win.webContents.executeJavaScript(`document.querySelectorAll('.handoff-fields textarea').length===5`))throw new Error('Handoff editor missing');await writeFile(path.join(data,'handoff.png'),(await win.webContents.capturePage()).toPNG());
 await win.webContents.executeJavaScript(`document.querySelector('.relay-modal .modal-header button')?.click()`);
 const shot=await win.webContents.capturePage();await writeFile(path.join(data,'smoke.png'),shot.toPNG());console.log(JSON.stringify({smoke:'passed',electron:process.versions.electron,previewKinds,renderer:renderer.title,tasks:store.list<Task>('tasks').length,artifacts:store.list('artifacts').length,data}));app.exit(0);}catch(e){console.error('Smoke failed',e);app.exit(1);}}
}
app.whenReady().then(initialize).catch(e=>{console.error('RelayDesk 启动失败',e.message);app.exit(1);});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>{service?.dispose();});
