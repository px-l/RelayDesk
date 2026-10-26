import {createHash} from 'node:crypto';
import {BaseAdapter,type RunContext} from './base.js';
import {AcpEvents,parseSseBlock,RpcPeer,type RpcMessage} from './rpc.js';
import type {Artifact,EngineInfo,Task,TaskStatus} from '../../shared/types.js';
const base='https://www.workbuddy.cn/openapi/v2';
export class WorkBuddyAdapter extends BaseAdapter {
 private state:EngineInfo['state']='unverified';private detail='需要服务端 OAuth 换取的 access_token 与 user.task.readable / user.task.invokable 权限；不支持上传本地文件。';
 private runs=new Map<string,{peer:RpcPeer;abort:AbortController;permissions:Map<string,{rpcId:string|number;options:Set<string>}>}>();
 constructor(private token:()=>string){super();}
 info():EngineInfo{return {id:'workbuddy',name:'WorkBuddy',mode:'real',state:this.token()?this.state:'unconfigured',detail:this.detail,capabilities:{stream:true,tools:true,files:false,artifacts:true,cancel:false,resume:true,approval:true}};}
 private async api(route:string,body?:unknown){const res=await fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${this.token()}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000),redirect:'error'});if(!res.ok)throw new Error(`WorkBuddy HTTP ${res.status}；请检查凭据、有效期和授权范围`);return res.json() as Promise<any>;}
 async check(){if(!this.token())return this.info();try{const data=await this.api('/tasks?page=1&size=1');if(!Array.isArray(data.tasks))throw new Error('任务列表响应格式不匹配');this.state='ready';this.detail='云端任务列表连通；创建权限、ACP 与成果下载待真实任务验证。本地文件上传未开放。';}catch(e){this.state='error';this.detail=e instanceof Error?e.message:'检测失败';}return this.info();}
 async getStatus(task:Task):Promise<TaskStatus>{if(!task.remoteId)throw new Error('没有远端 ID；创建结果可能不确定，禁止自动重建');const r=await this.api(`/tasks/${encodeURIComponent(task.remoteId)}`);return this.mapStatus(r.status);}
 private mapStatus(status:string):TaskStatus{switch(status){case 'completed':return 'completed';case 'failed':return 'failed';case 'pending':return 'waiting_input';case 'working':case 'planning':case 'CREATING':return 'running';case 'idle':return 'waiting_input';default:return 'interrupted';}}
 async createTask(c:RunContext){if(c.task.inputs.length)throw new Error('WorkBuddy 当前适配不支持上传本地文件，不能把本地路径发往云端');
 const remote=await this.api('/tasks',{prompt:c.task.goal,name:c.task.title});if(typeof remote.task_id!=='string')throw new Error('云端任务创建响应缺少 ID，请在 WorkBuddy 核对，禁止盲目重建');c.task.remoteId=remote.task_id;c.bindRemote(remote.task_id);
 const events=new AcpEvents(this.eventsContext(c));events.emit({type:'task.started',remoteId:remote.task_id});let connection=remote;
 for(let i=0;i<5&&(!connection.link||!connection.token);i++){await new Promise(r=>setTimeout(r,1000));connection=await this.api(`/tasks/${encodeURIComponent(remote.task_id)}`);}
 if(!connection.link||!connection.token)throw new Error('任务已创建，ACP 通道尚未就绪；请查询已有任务');
 await this.stream(c,connection,events);}
 private async stream(c:RunContext,connection:any,events:AcpEvents){
 const url=new URL(connection.link);if(!trustedEngineUrl(url))throw new Error('拒绝向非官方 ACP 主机发送 token');
 const abort=new AbortController();const res=await fetch(url,{headers:{Authorization:`Bearer ${connection.token}`,Accept:'text/event-stream'},signal:AbortSignal.any([abort.signal,AbortSignal.timeout(60*60*1000)]),redirect:'error'});
 const connectionId=res.headers.get('Acp-Connection-Id');if(!res.ok||!res.body||!connectionId){abort.abort();throw new Error('ACP SSE 建连失败或缺少连接标识');}
 const peer=new RpcPeer(async m=>{const post=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${connection.token}`,'Content-Type':'application/json','Acp-Connection-Id':connectionId},body:JSON.stringify(m),signal:AbortSignal.timeout(30000),redirect:'error'});if(!post.ok)throw new Error(`ACP POST HTTP ${post.status}`);});
 const permissions=new Map<string,{rpcId:number|string;options:Set<string>}>();this.runs.set(c.task.id,{peer,abort,permissions});
 peer.onNotification=(m,cursor)=>{events.update(m,cursor);if(m.method==='_codebuddy.ai/artifact'&&m.params?.sessionId===c.task.remoteId&&['created','updated','deleted'].includes(m.params.event)){const a=m.params.artifact;if(typeof a?.uri!=='string')return;const id=createHash('sha256').update(`${c.task.id}:${a.uri}`).digest('hex');if(m.params.event==='deleted'){events.emit({type:'artifact.deleted',artifactId:id},cursor);return;}const artifact:Artifact={id,taskId:c.task.id,engine:'workbuddy',name:a.name||a.uri.split('/').pop()||'云端成果',mime:a.mimeType||'application/octet-stream',version:Number.isInteger(a.version)?a.version:1,createdAt:Number.isFinite(a.createdAt)?new Date(a.createdAt).toISOString():new Date().toISOString(),inlineText:typeof a.text==='string'?a.text:undefined,location:{kind:'remote',fileId:a.uri}};events.emit({type:'artifact.created',artifact},cursor);}};
 peer.onRequest=(m:RpcMessage)=>{if(m.method==='session/request_permission'&&m.id!==undefined){const requestId=String(m.id);const options=(m.params?.options||[]).map((o:any)=>({id:String(o.optionId),label:String(o.name)}));permissions.set(requestId,{rpcId:m.id,options:new Set(options.map((o:{id:string})=>o.id))});events.emit({type:'approval.required',requestId,description:m.params?.toolCall?.title||'云端工具授权',options});}else if(m.id!==undefined)void peer.respond(m.id,{outcome:{outcome:'cancelled'}});};
 const consume=(async()=>{const reader=res.body!.getReader();const decoder=new TextDecoder();let buffer='';try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');if(buffer.length>8*1024*1024)throw new Error('SSE 消息超过限制');let end;while((end=buffer.indexOf('\n\n'))>=0){const item=parseSseBlock(buffer.slice(0,end));buffer=buffer.slice(end+2);if(item?.data&&item.data!=='[DONE]'){try{peer.receive(JSON.parse(item.data),item.id);}catch{/* ignore non-JSON keepalive */}}}}}finally{peer.close();reader.releaseLock();}})();
 void consume.catch(()=>{});
 try{await peer.request('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false}}});await peer.request('session/load',{sessionId:c.task.remoteId,cwd:'/workspace',mcpServers:[]});await this.sendMessage(c,c.task.goal);
 }finally{abort.abort();peer.close();await consume.catch(()=>{});this.runs.delete(c.task.id);}
 }
 async sendMessage(c:RunContext,text:string){const run=this.runs.get(c.task.id);if(!run||!c.task.remoteId)throw new Error('会话未连接；请使用关联任务继续处理');const result=await run.peer.request('session/prompt',{sessionId:c.task.remoteId,prompt:[{type:'text',text}]},60*60*1000);new AcpEvents(this.eventsContext(c)).finish(result);}
 async recover(c:RunContext){const status=await this.getStatus(c.task);const e=new AcpEvents(this.eventsContext(c));if(status==='completed')e.emit({type:'task.completed'});else if(status==='failed')e.emit({type:'task.failed',error:'远端任务执行失败'});else {c.task.status=status;c.task.error='已查询远端任务。协议未承诺事件游标重放，本次仅刷新状态，不重发 prompt。';}}
 private async artifactConnection(task:Task){if(!task.remoteId)throw new Error('任务没有远端 ID');const remote=await this.api(`/tasks/${encodeURIComponent(task.remoteId)}`);const link=new URL(remote.link);if(!trustedEngineUrl(link)||!link.pathname.endsWith('/acp'))throw new Error('官方文档仅定义 /acp 形式 link 的成果地址推导；当前返回格式不支持，未猜测接口');link.pathname=link.pathname.slice(0,-4)+'/';link.search='';return {base:link,token:remote.token};}
 async getArtifacts(task:Task):Promise<Artifact[]>{
 const connection=await this.artifactConnection(task);const url=new URL('api/session/artifacts',connection.base);url.searchParams.set('sessionId',task.remoteId!);const res=await fetch(url,{headers:{Authorization:`Bearer ${connection.token}`},redirect:'error',signal:AbortSignal.timeout(30000)});if(!res.ok)throw new Error(`成果列表 HTTP ${res.status}；请重新检测账号权限`);const body:any=await res.json();if(body.code!==0||!Array.isArray(body.data?.artifacts))throw new Error('成果列表响应不匹配');
 return body.data.artifacts.filter((entry:any)=>entry.event!=='deleted'&&typeof entry.artifact?.uri==='string'&&(!entry.sessionId||entry.sessionId===task.remoteId)).map((entry:any)=>{const a=entry.artifact;const isText=typeof a.text==='string';return {id:createHash('sha256').update(`${task.id}:${a.uri}`).digest('hex'),taskId:task.id,engine:'workbuddy',name:a.name||a.uri.split('/').pop()||'云端成果',mime:a.mimeType||(isText?'text/markdown':'application/octet-stream'),version:Number.isInteger(a.version)?a.version:1,createdAt:Number.isFinite(a.createdAt)?new Date(a.createdAt).toISOString():new Date().toISOString(),inlineText:isText?a.text:undefined,location:{kind:'remote',fileId:a.uri,downloadUrl:entry.url}} as Artifact;});
 }
 async downloadArtifact(task:Task,artifact:Artifact):Promise<Uint8Array>{
 if(artifact.inlineText!==undefined)return Buffer.from(artifact.inlineText);
 if(artifact.location.kind!=='remote')throw new Error('成果已在本地');
 const c=await this.artifactConnection(task);let url:URL;let headers:Record<string,string>={};
 if(artifact.location.downloadUrl){url=new URL(artifact.location.downloadUrl);if(url.protocol!=='https:'||!trustedDownloadHost(url.hostname))throw new Error('下载域名未在受信列表中，请在 WorkBuddy 导出该成果');}
 else {if(!artifact.location.fileId.startsWith('agent:///'))throw new Error('没有官方支持的下载位置');const relative=artifact.location.fileId.slice('agent:///'.length);url=new URL(relative,c.base);if(url.origin!==c.base.origin||!url.pathname.startsWith(c.base.pathname))throw new Error('非法远端文件位置');headers={Authorization:`Bearer ${c.token}`};}
 const res=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});if(!res.ok||!res.body)throw new Error(`成果下载 HTTP ${res.status}`);const chunks:Uint8Array[]=[];let size=0;for await(const chunk of res.body as any){size+=chunk.length;if(size>20*1024*1024)throw new Error('成果下载超过 20MB 限制');chunks.push(chunk);}return Buffer.concat(chunks);
 }
 async approve(task:Task,requestId:string,optionId:string){const r=this.runs.get(task.id);const p=r?.permissions.get(requestId);if(!r||!p||!p.options.has(optionId))throw new Error('审批请求已失效');await r.peer.respond(p.rpcId,{outcome:{outcome:'selected',optionId}});r.permissions.delete(requestId);}
 dispose(){this.runs.forEach(r=>{r.abort.abort();r.peer.close();});this.runs.clear();}
}

export function trustedEngineUrl(url:URL){return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&(['acp.workbuddy.cn','www.workbuddy.cn'].includes(url.hostname)||url.hostname.endsWith('.agentos-run.net'));}
function trustedDownloadHost(host:string){return ['workbuddy.cn','www.workbuddy.cn','acp.workbuddy.cn'].includes(host)||['.agentos-run.net','.myqcloud.com','.tencentcos.cn'].some(s=>host.endsWith(s));}
