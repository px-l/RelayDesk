import type {Artifact,EngineInfo,Task,TaskEvent,TaskStatus,Workspace} from '../../shared/types.js';
export type Emit = (event:TaskEvent)=>void;
export interface RunContext {task:Task;workspace:Workspace;emit:Emit;bindRemote:(id:string)=>void;}
export interface EngineAdapter {
 info():EngineInfo;check():Promise<EngineInfo>;
 createTask(context:RunContext):Promise<void>;
 sendMessage(context:RunContext,text:string):Promise<void>;
 subscribe(taskId:string,listener:Emit):()=>void;
 getStatus(task:Task):Promise<TaskStatus>;
 getArtifacts(task:Task):Promise<Artifact[]>;
 downloadArtifact?(task:Task,artifact:Artifact):Promise<Uint8Array>;
 cancel?(task:Task):Promise<void>;
 recover?(context:RunContext):Promise<void>;
 approve?(task:Task,requestId:string,optionId:string):Promise<void>;
 dispose():void;
}
export abstract class BaseAdapter implements EngineAdapter {
 private listeners=new Map<string,Set<Emit>>();
 abstract info():EngineInfo;abstract createTask(c:RunContext):Promise<void>;
 async check(){return this.info();}
 async sendMessage(_c:RunContext,_text:string):Promise<void>{throw new Error('此适配器不支持追问；请创建关联任务');}
 subscribe(taskId:string,listener:Emit){const set=this.listeners.get(taskId)||new Set<Emit>();set.add(listener);this.listeners.set(taskId,set);return ()=>{set.delete(listener);if(!set.size)this.listeners.delete(taskId);};}
 protected eventsContext(c:RunContext):RunContext{return {...c,emit:e=>this.publish(c,e)};}
 protected publish(c:RunContext,e:TaskEvent){c.emit(e);this.listeners.get(c.task.id)?.forEach(fn=>fn(e));}
 async getStatus(task:Task){return task.status;}
 async getArtifacts(_task:Task):Promise<Artifact[]>{return [];}
 dispose(){}
}
