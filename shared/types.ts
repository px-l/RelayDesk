export type EngineId = 'demo' | 'demo-review' | 'dsh' | 'workbuddy';
export type TaskStatus = 'draft'|'starting'|'running'|'waiting_input'|'cancelling'|'interrupted'|'completed'|'failed'|'cancelled';
export interface Capabilities {stream:boolean;tools:boolean;files:boolean;artifacts:boolean;cancel:boolean;resume:boolean;approval:boolean;}
export interface EngineInfo {id:EngineId;name:string;mode:'demo'|'real';state:'ready'|'unconfigured'|'unverified'|'error';detail:string;capabilities:Capabilities;}
export interface Workspace {id:string;name:string;directory:string;createdAt:string;}
export interface InputFile {id:string;name:string;path:string;size:number;}
export interface Task {id:string;workspaceId:string;engine:EngineId;title:string;goal:string;originalGoal?:string;status:TaskStatus;createdAt:string;updatedAt:string;remoteId?:string;parentId?:string;handoff?:string;inputs:InputFile[];summary?:string;error?:string;dispatched:boolean;flow?:FlowOptions;generationBaselineId?:string;reviewError?:string;pendingApprovals?:{requestId:string;description:string;options:{id:string;label:string}[]}[];}
export interface Artifact {id:string;taskId:string;engine:EngineId;name:string;mime:string;version:number;createdAt:string;sourceRemoteFileId?:string;inlineText?:string;location:{kind:'local';path:string}|{kind:'remote';fileId:string;downloadUrl?:string};}
export type EventPayload =
 | {type:'task.started';remoteId?:string}
 | {type:'flow.updated'}
 | {type:'message.delta';text:string}
 | {type:'tool.started'|'tool.completed';toolId:string;name:string;detail?:string}
 | {type:'artifact.created';artifact:Artifact}
 | {type:'artifact.deleted';artifactId:string}
 | {type:'approval.required';requestId:string;description:string;options:{id:string;label:string}[]}
 | {type:'task.completed';summary?:string}
 | {type:'task.failed';error:string}
 | {type:'task.cancelled'};
export type TaskEvent = EventPayload & {taskId:string;eventId:string;timestamp:string;sequence:number;sourceCursor?:string};
export interface Snapshot {workspaces:Workspace[];tasks:Task[];artifacts:Artifact[];engines:EngineInfo[];flowBusyTaskIds?:string[];}
export interface TaskDetail {task:Task;events:TaskEvent[];artifacts:Artifact[];flow?:FlowDetail;}
export interface Handoff {goal:string;completed:string;findings:string;unresolved:string;next:string;artifactIds:string[];}
export interface SettingsInput {dshExecutable?:string;workbuddyToken?:string;clearToken?:boolean;reviewApiKey?:string;clearReviewKey?:boolean;reviewModel?:string;pythonExecutable?:string;}
export interface SettingsView {dshExecutable:string;hasWorkbuddyToken:boolean;secureStorage:boolean;hasReviewKey:boolean;reviewModel:string;pythonExecutable:string;}
export type Request =
 | {op:'snapshot'} | {op:'workspace.create'} | {op:'task.create';workspaceId:string;engine:EngineId;goal:string;flow?:FlowOptions}
 | {op:'task.detail'|'task.start'|'task.cancel'|'task.recover'|'task.inputs'|'task.artifacts';taskId:string}
 | {op:'task.approve';taskId:string;requestId:string;optionId:string}
 | {op:'handoff.draft';taskId:string} | {op:'handoff.create';taskId:string;engine:EngineId;handoff:Handoff}
 | {op:'artifact.preview'|'artifact.export'|'artifact.open'|'artifact.reveal';artifactId:string}
 | {op:'flow.configure';taskId:string;options:FlowOptions}
 | {op:'flow.prepare';taskId:string;requirements:Requirement[];consent:boolean}
 | {op:'flow.confirm';taskId:string;preparationId:string;constraints:string;acceptedGaps:boolean;reviewConsent:boolean}
 | {op:'flow.review';taskId:string;artifactIds:string[];includeAnswer:boolean;consent:boolean}
 | {op:'flow.repair';taskId:string;reviewId:string}
 | {op:'flow.export';taskId:string;reviewId:string}
 | {op:'task.artifact.import';taskId:string}
 | {op:'task.input.remove';taskId:string;inputId:string}
 | {op:'settings.get'} | {op:'settings.save';settings:SettingsInput} | {op:'engine.check';engine:EngineId};
export interface Preview {kind:'markdown'|'text'|'csv'|'image'|'pdf'|'html'|'unsupported';content:string;name:string;}
export interface Bridge {request<T=unknown>(request:Request):Promise<T>;subscribe(callback:(event:TaskEvent)=>void):()=>void;}

export type CheckMode = 'rules'|'agent';
export interface FlowOptions { preparation:boolean; review:boolean; mode:CheckMode; }
export interface Requirement { id:string; title:string; required:boolean; keywords:string[]; }
export type EvidenceStatus = 'supported'|'partial'|'missing'|'conflicting'|'unknown';
export interface EvidenceCitation {documentId:string;quote:string;locator?:string;}
export interface RequirementCheck {requirementId:string;status:EvidenceStatus;reason:string;citations:EvidenceCitation[];sourceCitations?:EvidenceCitation[];supplement:string;}
export interface DocumentSnapshot {id:string;sourceId:string;sourceVersion?:number;name:string;sha256:string;snapshotPath:string;originalPath?:string;text:string;issue?:string;truncated:boolean;}
export interface PreparationRun {id:string;taskId:string;createdAt:string;status:'running'|'completed'|'failed'|'interrupted';mode:CheckMode;model?:string;requirements:Requirement[];documents:DocumentSnapshot[];checks:RequirementCheck[];limitations:string[];goalHash:string;error?:string;}
export interface Baseline {id:string;taskId:string;version:number;preparationId:string;approvedAt:string;goal:string;goalHash:string;requirements:Requirement[];documents:DocumentSnapshot[];checks:RequirementCheck[];constraints:string;acceptedGaps:boolean;mode:CheckMode;reviewConsent:boolean;limitations:string[];}
export interface ReviewFinding {requirementId?:string;severity:'error'|'warning';title:string;detail:string;documentId?:string;quote?:string;locator?:string;suggestion:string;}
export interface ReviewReport {id:string;taskId:string;baselineId:string;baselineVersion:number;createdAt:string;status:'running'|'completed'|'failed'|'interrupted';mode:CheckMode;model?:string;outcome:'passed'|'changes_requested'|'unable';documents:DocumentSnapshot[];artifactIds:string[];includeAnswer:boolean;answerHash?:string;findings:ReviewFinding[];checks:RequirementCheck[];limitations:string[];error?:string;}
export interface FlowDetail {options:FlowOptions;preparations:PreparationRun[];baselines:Baseline[];reviews:ReviewReport[];baseline?:Baseline;baselineCurrent:boolean;reviewCurrent:boolean;busy:boolean;}
