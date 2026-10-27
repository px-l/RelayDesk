/** Transport / trust boundary only. AI reasoning and retrieval live in agent_runtime/. */
import {existsSync} from 'node:fs';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import type {Baseline,CheckMode,DocumentSnapshot,Requirement,RequirementCheck,ReviewFinding,ReviewReport} from '../shared/types.js';
const citation=z.object({documentId:z.string().max(128),quote:z.string().min(1).max(2000),locator:z.string().max(100).optional()}).strict();
const check=z.object({requirementId:z.string().max(128),status:z.enum(['supported','partial','missing','conflicting','unknown']),reason:z.string().max(3000),citations:z.array(citation).max(8),sourceCitations:z.array(citation).max(8).optional(),supplement:z.string().max(3000)}).strict();
const finding=z.object({requirementId:z.string().max(128).optional(),severity:z.enum(['error','warning']),title:z.string().max(300),detail:z.string().max(3000),documentId:z.string().max(128).optional(),quote:z.string().max(2000).optional(),locator:z.string().max(100).optional(),suggestion:z.string().max(3000)}).strict();
const prepResponse=z.object({checks:z.array(check).max(30),model:z.string().max(128)}).strict();
const reviewResponse=z.object({checks:z.array(check).max(30),findings:z.array(finding).max(80),outcome:z.enum(['passed','changes_requested','unable']),model:z.string().max(128)}).strict();
export interface CheckAgentConfig {key:string;model:string;python?:string;}
export interface CheckAgent {
 config():CheckAgentConfig;
 prepare(goal:string,requirements:Requirement[],documents:DocumentSnapshot[],mode:CheckMode):Promise<{checks:RequirementCheck[];model:string}>;
 review(baseline:Baseline,documents:DocumentSnapshot[],mode:CheckMode):Promise<{checks:RequirementCheck[];findings:ReviewFinding[];model:string;outcome:ReviewReport['outcome']}>;
 dispose?():void;
}
export class PythonCheckAgent implements CheckAgent {
 private children=new Set<ChildProcessWithoutNullStreams>();
 constructor(private settings:()=>CheckAgentConfig,private workerPath=fileURLToPath(new URL('../agent_runtime/worker.py',import.meta.url))){}
 config(){return this.settings();}
 private call(operation:string,mode:CheckMode,input:object):Promise<unknown>{
  if(this.children.size>=2)throw new Error('检查 Agent 正在处理其他任务，请稍后再试');const c=this.settings();if(mode==='agent'&&!c.key)throw new Error('检查 Agent 未配置 DeepSeek API Key；不会自动切换规则模式');
  // Compiled backend lives in dist-electron/backend; source execution in backend.
  const worker=existsSync(this.workerPath)?this.workerPath:fileURLToPath(new URL('../../agent_runtime/worker.py',import.meta.url));
  return new Promise((resolve,reject)=>{const child=spawn(c.python||'python3',[worker],{stdio:'pipe',shell:false,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});this.children.add(child);let text='';let settled=false;
   const finish=(error?:Error,value?:unknown)=>{if(settled)return;settled=true;clearTimeout(timeout);this.children.delete(child);if(error)reject(error);else resolve(value);};
   const timeout=setTimeout(()=>{child.kill();finish(new Error('Python 检查超时；未自动重试或启动生成引擎'));},125000);
   child.stderr.resume();child.stdout.on('data',chunk=>{text+=chunk.toString();if(text.length>2*1024*1024){child.kill();finish(new Error('检查结果超过限制'));}});child.on('error',()=>finish(new Error('无法启动 Python 3.9+，请在设置中填写可执行文件路径')));child.stdin.on('error',()=>{});
   child.on('close',code=>{if(settled)return;if(code!==0)return finish(new Error('Python 检查进程异常退出'));try{const envelope=JSON.parse(text);if(envelope.ok!==true)return finish(new Error(typeof envelope.error==='string'?envelope.error:'Python 检查失败'));finish(undefined,envelope.value);}catch{finish(new Error('Python 检查进程未返回有效结果'));}});
   // API keys travel through a private pipe, not argv/env/logs. File paths never cross this boundary.
   const docs=(items:DocumentSnapshot[])=>items.map(({id,name,text,issue,truncated})=>({id,name,text,issue,truncated}));
   const payload:any={...input};if(payload.documents)payload.documents=docs(payload.documents);if(payload.baseline)payload.baseline={...payload.baseline,documents:docs(payload.baseline.documents)};
   child.stdin.end(JSON.stringify({...payload,operation,mode,config:mode==='agent'?{key:c.key,model:c.model}:{}}));
  });
 }
 async prepare(goal:string,requirements:Requirement[],documents:DocumentSnapshot[],mode:CheckMode){return prepResponse.parse(await this.call('prepare',mode,{goal,requirements,documents}));}
 async review(baseline:Baseline,documents:DocumentSnapshot[],mode:CheckMode){return reviewResponse.parse(await this.call('review',mode,{baseline,documents}));}
 dispose(){this.children.forEach(c=>c.kill());this.children.clear();}
}
