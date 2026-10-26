import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {BaseAdapter,type RunContext} from './base.js';
import {writeOutput} from '../files.js';
import {demoPng,demoPdf} from '../demo-media.js';
import type {Artifact,EngineId,EngineInfo,EventPayload,Task} from '../../shared/types.js';
export class DemoAdapter extends BaseAdapter {
 private controllers=new Map<string,AbortController>();
 constructor(private id:EngineId='demo',private speed=55){super();}
 info():EngineInfo{return {id:this.id,name:this.id==='demo'?'Demo · 方案助手':'Demo · 审阅助手',mode:'demo',state:'ready',detail:'独立的本地演示引擎，不连接任何厂商服务。',capabilities:{stream:true,tools:true,files:true,artifacts:true,cancel:true,resume:false,approval:false}};}
 async createTask(c:RunContext){
 const controller=new AbortController();this.controllers.set(c.task.id,controller);let seq=0;
 const emit=(p:EventPayload)=>this.publish(c,{...p,taskId:c.task.id,eventId:`${c.task.id}:${++seq}`,sequence:seq,timestamp:new Date().toISOString()});
 const pause=()=>delay(this.speed,undefined,{signal:controller.signal});
 try{c.bindRemote(`demo-${c.task.id}`);emit({type:'task.started',remoteId:`demo-${c.task.id}`});
 emit({type:'tool.started',toolId:'inspect',name:'检查输入资料',detail:`${c.task.inputs.length} 个本地文件；仅演示记录`});await pause();
 emit({type:'tool.completed',toolId:'inspect',name:'检查输入资料',detail:'已记录文件名称与任务目标'});
 const review=this.id==='demo-review';
 const text=`## ${review?'接力审阅已完成':'方案已整理'}\n\n> 演示模式：以下为可重复的本地示例，不是厂商模型回答。\n\n${review?'已收到交接包，完成结构检查并整理下一阶段清单。':'我会把目标拆分成可执行步骤，并生成便于继续处理的资料。'}\n\n### 交付内容\n\n- 一份 Markdown ${review?'审阅记录':'执行方案'}\n- 一份 CSV 行动清单\n- 一张 PNG 流程示意图与 PDF 摘要\n\n### 下一步\n\n检查右侧成果，选择需要的文件，再通过 **接力任务** 交给另一个引擎。\n\n\`\`\`typescript\nconst relay = { goal: '明确目标', artifacts: ['方案', '清单'] };\n\`\`\`\n`;
 for(let i=0;i<text.length;i+=18){await pause();emit({type:'message.delta',text:text.slice(i,i+18)});}
 emit({type:'tool.started',toolId:'write',name:'生成演示成果',detail:'在工作区 .relaydesk 下创建新文件'});
 const files:[string,string,string|Uint8Array][]=[['方案.md','text/markdown',`# ${review?'接力审阅':'任务执行方案'}\n\n**演示模式** · RelayDesk\n\n## 原始需求\n${c.task.goal}\n\n## 已完成\n- 梳理目标与约束\n- 形成阶段交付清单\n- 准备跨引擎交接资料\n\n## 关键结论\n成果与任务独立存储，接力以新任务携带必要资料进行。\n\n## 未解决\n真实引擎输出需在配置凭据后验证。\n`],['行动清单.csv','text/csv','阶段,事项,状态\n1,梳理需求,已完成\n2,检查成果,待确认\n3,接力审阅,待执行\n'],['流程.png','image/png',demoPng()],['交接摘要.pdf','application/pdf',demoPdf()]];
 for(const [name,mime,content] of files){if(controller.signal.aborted)throw new Error('cancelled');const file=await writeOutput(c.workspace.directory,c.task.id,name,content);const artifact:Artifact={id:randomUUID(),taskId:c.task.id,engine:this.id,name,mime,version:1,createdAt:new Date().toISOString(),location:{kind:'local',path:file}};emit({type:'artifact.created',artifact});}
 emit({type:'tool.completed',toolId:'write',name:'生成演示成果',detail:'4 个成果已保存'});
 emit({type:'task.completed',summary:review?'已审阅交接资料，整理阶段检查项。演示结果需用户确认。':'已生成执行方案、行动清单与示意图。待用户确认后进入下一阶段。'});
 }catch(err){if(controller.signal.aborted)emit({type:'task.cancelled'});else emit({type:'task.failed',error:err instanceof Error?err.message:'本地演示执行失败'});}finally{this.controllers.delete(c.task.id);}
 }
 async cancel(task:Task){this.controllers.get(task.id)?.abort();}
 dispose(){this.controllers.forEach(c=>c.abort());}
}
