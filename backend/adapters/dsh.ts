import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {access,constants} from 'node:fs/promises';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {BaseAdapter,type RunContext} from './base.js';
import {AcpEvents,RpcPeer,type RpcMessage} from './rpc.js';
import type {EngineInfo,Task} from '../../shared/types.js';
export class DshAdapter extends BaseAdapter {
 private state:EngineInfo['state']='unconfigured';private detail='配置 DSH 可执行文件的绝对路径，并在 DSH 自身配置模型与凭据。';
 private runs=new Map<string,{process:ChildProcessWithoutNullStreams;peer:RpcPeer;permissions:Map<string,{rpcId:number|string;options:Set<string>}>}>();
 constructor(private executable:()=>string){super();}
 info():EngineInfo{return {id:'dsh',name:'DeepSeek Harness',mode:'real',state:this.executable()?this.state==='unconfigured'?'unverified':this.state:'unconfigured',detail:this.detail,capabilities:{stream:true,tools:true,files:true,artifacts:false,cancel:true,resume:false,approval:true}};}
 private connect(){const executable=this.executable();if(!path.isAbsolute(executable))throw new Error('请配置 DSH 可执行文件的绝对路径');const child=spawn(executable,['--profile','acp'],{stdio:'pipe',shell:false});const peer=new RpcPeer(m=>{child.stdin.write(JSON.stringify(m)+'\n');});const lines=createInterface({input:child.stdout});lines.on('line',line=>{if(line.length>8*1024*1024){child.kill();return;}try{peer.receive(JSON.parse(line));}catch{/* only JSON-RPC stdout is accepted */}});child.stderr.resume();child.on('error',()=>peer.close());child.on('exit',()=>peer.close());return {process:child,peer};}
 async check(){if(!this.executable())return this.info();let run:ReturnType<DshAdapter['connect']>|undefined;try{await access(this.executable(),constants.X_OK);run=this.connect();const init=await run.peer.request('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false}},clientInfo:{name:'RelayDesk',version:'0.1.0'}},15000);if(init.protocolVersion!==1)throw new Error('不兼容的 ACP 协议');this.state='ready';this.detail='ACP v1 握手成功；模型调用与账号权限仍需真实任务验证。DSH 不开放成果列表。';}catch(e){this.state='error';this.detail=e instanceof Error?e.message:'检测失败';}finally{run?.process.kill();run?.peer.close();}return this.info();}
 async createTask(c:RunContext){const run=this.connect();const permissions=new Map<string,{rpcId:number|string;options:Set<string>}>();this.runs.set(c.task.id,{...run,permissions});const events=new AcpEvents(this.eventsContext(c));
 run.peer.onNotification=m=>events.update(m);
 run.peer.onRequest=(m:RpcMessage)=>{if(m.method==='session/request_permission'&&m.id!==undefined&&m.params?.sessionId===c.task.remoteId){const requestId=String(m.id);const options=(m.params.options||[]).map((o:any)=>({id:String(o.optionId),label:String(o.name)}));permissions.set(requestId,{rpcId:m.id,options:new Set(options.map((o:{id:string})=>o.id))});events.emit({type:'approval.required',requestId,description:m.params.toolCall?.title||'引擎请求工具授权',options});}else if(m.id!==undefined)void run.peer.respond(m.id,{outcome:{outcome:'cancelled'}});};
 try{await run.peer.request('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false}},clientInfo:{name:'RelayDesk',version:'0.1.0'}});
 const session=await run.peer.request('session/new',{cwd:c.workspace.directory,mcpServers:[]});if(typeof session.sessionId!=='string')throw new Error('DSH 未返回有效 sessionId');c.task.remoteId=session.sessionId;c.bindRemote(session.sessionId);events.emit({type:'task.started',remoteId:session.sessionId});
 await this.sendMessage(c,c.task.goal);
 }finally{run.process.kill();run.peer.close();this.runs.delete(c.task.id);}
 }
 async sendMessage(c:RunContext,text:string){const run=this.runs.get(c.task.id);if(!run||!c.task.remoteId)throw new Error('会话未连接；请使用关联任务继续处理');const prompt:any[]=[{type:'text',text}];for(const f of c.task.inputs)prompt.push({type:'resource_link',uri:pathToFileURL(f.path).href,name:f.name});const result=await run.peer.request('session/prompt',{sessionId:c.task.remoteId,prompt},60*60*1000);new AcpEvents(this.eventsContext(c)).finish(result);}
 async cancel(task:Task){const r=this.runs.get(task.id);if(!r)throw new Error('本地进程已结束，无法取消');await r.peer.notify('session/cancel',{sessionId:task.remoteId});}
 async approve(task:Task,requestId:string,optionId:string){const r=this.runs.get(task.id);const p=r?.permissions.get(requestId);if(!r||!p||!p.options.has(optionId))throw new Error('审批请求已失效');await r.peer.respond(p.rpcId,{outcome:{outcome:'selected',optionId}});r.permissions.delete(requestId);}
 dispose(){this.runs.forEach(r=>{r.process.kill();r.peer.close();});this.runs.clear();}
}
