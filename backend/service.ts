import {randomUUID} from 'node:crypto';
import {stat} from 'node:fs/promises';
import {Store} from './store.js';
import {within} from './files.js';
import {DemoAdapter} from './adapters/demo.js';
import {DshAdapter} from './adapters/dsh.js';
import {WorkBuddyAdapter} from './adapters/workbuddy.js';
import type {EngineAdapter,RunContext} from './adapters/base.js';
import {draftHandoff,handoffText,terminal} from '../shared/domain.js';
import type {Artifact,EngineId,Handoff,Snapshot,Task,TaskEvent,Workspace} from '../shared/types.js';
export class TaskService {
 readonly adapters:Map<EngineId,EngineAdapter>;private active=new Set<string>();
 constructor(readonly store:Store,config:{dsh:()=>string;token:()=>string},private notify:(e:TaskEvent)=>void=()=>{},demoSpeed=55){
 this.adapters=new Map<EngineId,EngineAdapter>([['demo',new DemoAdapter('demo',demoSpeed)],['demo-review',new DemoAdapter('demo-review',demoSpeed)],['dsh',new DshAdapter(config.dsh)],['workbuddy',new WorkBuddyAdapter(config.token)]]);
 for(const t of store.list<Task>('tasks'))if(!terminal(t.status)&&t.status!=='draft'){t.status='interrupted';t.error='上次执行已中断。本地事件是历史记录，不代表远端已恢复。请查询远端状态；演示任务可新建重试。';store.putTask(t);}
 }
 adapter(id:EngineId){const a=this.adapters.get(id);if(!a)throw new Error('未知引擎');return a;}
 snapshot():Snapshot{return {workspaces:this.store.list('workspaces'),tasks:this.store.list('tasks'),artifacts:this.store.list('artifacts'),engines:[...this.adapters.values()].map(a=>a.info())};}
 detail(id:string){return {task:this.store.task(id),events:this.store.events(id),artifacts:this.store.list<Artifact>('artifacts').filter(a=>a.taskId===id)};}
 create(workspaceId:string,engine:EngineId,goal:string,parentId?:string,handoff?:string):Task{this.store.workspace(workspaceId);this.adapter(engine);const t:Task={id:randomUUID(),workspaceId,engine,title:goal.replace(/^#.*\n/,'').trim().slice(0,32)||'接力任务',goal,status:'draft',inputs:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),dispatched:false,parentId,handoff};this.store.putTask(t);return t;}
 private context(t:Task):RunContext{return {task:t,workspace:this.store.workspace(t.workspaceId),bindRemote:id=>{const current=this.store.task(t.id);current.remoteId=id;this.store.putTask(current);t.remoteId=id;},emit:e=>{if(this.store.append(e))this.notify(e);}};}
 async start(id:string){const t=this.store.task(id);if(t.dispatched||t.status!=='draft'||this.active.has(id))throw new Error('任务已派发，禁止重复创建；请查询已有任务。');const adapter=this.adapter(t.engine);const info=adapter.info();if(info.state==='unconfigured')throw new Error(info.detail);if(t.inputs.length&&!info.capabilities.files)throw new Error('该引擎不支持本地文件上传，请移除文件或选择本地引擎');
 const workspace=this.store.workspace(t.workspaceId);for(const f of t.inputs){await within(workspace.directory,f.path);if(!(await stat(f.path)).isFile())throw new Error('输入文件不可用');}
 // Claim synchronously after async validation, before any external side effect.
 if(this.active.has(id)||this.store.task(id).dispatched)throw new Error('任务已派发');t.dispatched=true;t.status='starting';t.error=undefined;this.store.putTask(t);this.active.add(id);
 const c=this.context(t);void adapter.createTask(c).catch(e=>{
 const current=this.store.task(id);if(terminal(current.status))return;
 // Transport errors cannot prove remote failure; retain ID and require explicit query.
 current.status='interrupted';current.error=e instanceof Error?e.message:'执行中断';this.store.putTask(current);
 // A transport interruption is local state, never a fabricated vendor task.failed event.
 }).finally(()=>this.active.delete(id));return this.store.task(id);}
 async cancel(id:string){const t=this.store.task(id);const a=this.adapter(t.engine);if(!a.info().capabilities.cancel||!a.cancel)throw new Error('该引擎未开放取消能力');if(!this.active.has(id)||terminal(t.status))throw new Error('当前任务不能取消');t.status='cancelling';this.store.putTask(t);try{await a.cancel(t);}catch(e){t.status='interrupted';t.error='取消未确认；请检查远端状态';this.store.putTask(t);throw e;}}
 async recover(id:string){if(this.active.has(id))throw new Error('任务仍在当前连接执行');const t=this.store.task(id);const a=this.adapter(t.engine);if(!a.recover)throw new Error('此适配器不支持恢复；请检查引擎本身的任务记录。不会重发旧请求。');const c=this.context(t);await a.recover(c);if(!terminal(this.store.task(id).status))this.store.putTask(c.task);return this.detail(id);}
 draft(id:string){const t=this.store.task(id);if(t.status!=='completed')throw new Error('任务完成后才能接力');return draftHandoff(t,this.detail(id).artifacts);}
 async relay(id:string,engine:EngineId,h:Handoff){const source=this.store.task(id);if(source.status!=='completed')throw new Error('任务尚未完成');if(source.engine===engine)throw new Error('请选择另一个引擎');const all=this.detail(id).artifacts;const selected=h.artifactIds.map(aid=>{const a=all.find(a=>a.id===aid);if(!a)throw new Error('选定成果不属于原任务');return a;});const target=this.adapter(engine);if(selected.length&&!target.info().capabilities.files)throw new Error('目标引擎无已验证的本地上传能力；请取消文件选择并将必要结论写入交接包');
 const w=this.store.workspace(source.workspaceId);for(const a of selected){if(a.location.kind!=='local')throw new Error('云端成果尚未下载到授权目录，不能作为本地文件接力');await within(w.directory,a.location.path);}
 const text=handoffText(h,selected);const t=this.create(source.workspaceId,engine,text,id,text);t.originalGoal=h.goal;t.title=`接力 · ${source.title.slice(0,25)}`;t.inputs=selected.map(a=>({id:randomUUID(),name:a.name,path:a.location.kind==='local'?a.location.path:'',size:0}));this.store.putTask(t);return t;
 }
 async syncArtifacts(id:string){const t=this.store.task(id);const items=await this.adapter(t.engine).getArtifacts(t);for(const artifact of items){const e:TaskEvent={type:'artifact.created',artifact,taskId:id,eventId:randomUUID(),timestamp:new Date().toISOString(),sequence:0};if(this.store.append(e))this.notify(e);}return this.detail(id);}
 async approve(id:string,requestId:string,optionId:string){const t=this.store.task(id);const a=this.adapter(t.engine);if(t.status!=='waiting_input'||!a.approve)throw new Error('审批不可用');await a.approve(t,requestId,optionId);t.pendingApprovals=t.pendingApprovals?.filter(p=>p.requestId!==requestId);t.status=t.pendingApprovals?.length?'waiting_input':'running';this.store.putTask(t);}
 dispose(){this.adapters.forEach(a=>a.dispose());}
}
