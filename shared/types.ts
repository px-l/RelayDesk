export type EngineId = 'demo' | 'demo-review' | 'dsh' | 'workbuddy';
export type TaskStatus = 'draft'|'starting'|'running'|'waiting_input'|'cancelling'|'interrupted'|'completed'|'failed'|'cancelled';
export interface Capabilities {stream:boolean;tools:boolean;files:boolean;artifacts:boolean;cancel:boolean;resume:boolean;approval:boolean;}
export interface EngineInfo {id:EngineId;name:string;mode:'demo'|'real';state:'ready'|'unconfigured'|'unverified'|'error';detail:string;capabilities:Capabilities;}
export interface Workspace {id:string;name:string;directory:string;createdAt:string;}
export interface InputFile {id:string;name:string;path:string;size:number;}
export interface Task {id:string;workspaceId:string;engine:EngineId;title:string;goal:string;originalGoal?:string;status:TaskStatus;createdAt:string;updatedAt:string;remoteId?:string;parentId?:string;handoff?:string;inputs:InputFile[];summary?:string;error?:string;dispatched:boolean;pendingApprovals?:{requestId:string;description:string;options:{id:string;label:string}[]}[];}
export interface Artifact {id:string;taskId:string;engine:EngineId;name:string;mime:string;version:number;createdAt:string;sourceRemoteFileId?:string;inlineText?:string;location:{kind:'local';path:string}|{kind:'remote';fileId:string;downloadUrl?:string};}
export type EventPayload =
 | {type:'task.started';remoteId?:string}
 | {type:'message.delta';text:string}
 | {type:'tool.started'|'tool.completed';toolId:string;name:string;detail?:string}
 | {type:'artifact.created';artifact:Artifact}
 | {type:'artifact.deleted';artifactId:string}
 | {type:'approval.required';requestId:string;description:string;options:{id:string;label:string}[]}
 | {type:'task.completed';summary?:string}
 | {type:'task.failed';error:string}
 | {type:'task.cancelled'};
export type TaskEvent = EventPayload & {taskId:string;eventId:string;timestamp:string;sequence:number;sourceCursor?:string};
export interface Snapshot {workspaces:Workspace[];tasks:Task[];artifacts:Artifact[];engines:EngineInfo[];}
export interface TaskDetail {task:Task;events:TaskEvent[];artifacts:Artifact[];}
export interface Handoff {goal:string;completed:string;findings:string;unresolved:string;next:string;artifactIds:string[];}
export interface SettingsInput {dshExecutable?:string;workbuddyToken?:string;clearToken?:boolean;}
export interface SettingsView {dshExecutable:string;hasWorkbuddyToken:boolean;secureStorage:boolean;}
export type Request =
 | {op:'snapshot'} | {op:'workspace.create'} | {op:'task.create';workspaceId:string;engine:EngineId;goal:string}
 | {op:'task.detail'|'task.start'|'task.cancel'|'task.recover'|'task.inputs'|'task.artifacts';taskId:string}
 | {op:'task.approve';taskId:string;requestId:string;optionId:string}
 | {op:'handoff.draft';taskId:string} | {op:'handoff.create';taskId:string;engine:EngineId;handoff:Handoff}
 | {op:'artifact.preview'|'artifact.export'|'artifact.open'|'artifact.reveal';artifactId:string}
 | {op:'settings.get'} | {op:'settings.save';settings:SettingsInput} | {op:'engine.check';engine:EngineId};
export interface Preview {kind:'markdown'|'text'|'csv'|'image'|'pdf'|'html'|'unsupported';content:string;name:string;}
export interface Bridge {request<T=unknown>(request:Request):Promise<T>;subscribe(callback:(event:TaskEvent)=>void):()=>void;}
