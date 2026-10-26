import type {Artifact,Handoff,Task,TaskEvent,TaskStatus} from './types.js';
export const terminal = (s:TaskStatus)=>['completed','failed','cancelled'].includes(s);
export function transition(status:TaskStatus,event:TaskEvent):TaskStatus {
 if(terminal(status))return status;
 switch(event.type){
 case 'task.started':return status==='cancelling'?'cancelling':'running';
 case 'approval.required':return status==='cancelling'?'cancelling':'waiting_input';
 case 'task.completed':return 'completed';case 'task.failed':return 'failed';case 'task.cancelled':return 'cancelled';default:return status;
 }
}
export function draftHandoff(task:Task,artifacts:Artifact[]):Handoff {
 return {goal:task.originalGoal||task.goal,completed:task.summary||'请根据已生成成果填写已完成事项。',findings:task.summary||'',unresolved:'请填写尚未解决的问题。',next:'请检查已有成果，完善下一阶段交付。',artifactIds:artifacts.filter(a=>a.taskId===task.id).map(a=>a.id)};
}
export function handoffText(h:Handoff,artifacts:Artifact[]):string {
 return `# 接力交接包\n\n## 原始目标\n${h.goal}\n\n## 已完成事项\n${h.completed}\n\n## 关键结论\n${h.findings}\n\n## 未解决问题\n${h.unresolved}\n\n## 选定成果\n${artifacts.filter(a=>h.artifactIds.includes(a.id)).map(a=>`- ${a.name}（v${a.version}）`).join('\n')||'无'}\n\n## 下一阶段要求\n${h.next}`;
}
