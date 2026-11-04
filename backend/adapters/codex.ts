import {execFile,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {access,copyFile,lstat,mkdir,mkdtemp,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {promisify} from 'node:util';
import {mimeForName,outputDir,readable,within} from '../files.js';
import type {EngineInfo,EventPayload,Task} from '../../shared/types.js';
import {BaseAdapter,type RunContext} from './base.js';

const runFile=promisify(execFile);
const toolNames:Record<string,string>={
 command_execution:'执行命令',
 file_change:'修改文件',
 mcp_tool_call:'调用 MCP 工具',
 web_search:'搜索网页',
};
type Run={cancelled:boolean;stop?:()=>void};

export class CodexAdapter extends BaseAdapter {
 private runs=new Map<string,Run>();
 private checked?:{path:string;state:'ready'|'error';detail:string};

 constructor(private executable:()=>string){super();}

 info():EngineInfo {
  const executable=this.executable();
  const checked=this.checked?.path===executable?this.checked:undefined;
  return {
   id:'codex',name:'Codex CLI',mode:'real',
   state:checked?.state||(executable?'unverified':'unconfigured'),
   detail:checked?.detail||(executable?'请检测本地 Codex CLI 和登录状态。':'请填写 Codex CLI 的绝对路径。'),
   capabilities:{stream:true,tools:true,files:true,artifacts:true,cancel:true,resume:false,approval:false},
  };
 }

 async check() {
  const executable=this.executable();
  if(!executable)return this.info();
  const options={timeout:8000,maxBuffer:64*1024};
  try{
   await access(executable,constants.X_OK);
   const {stdout}=await runFile(executable,['exec','--help'],options);
   if(!stdout.includes('--json')||!stdout.includes('--sandbox'))throw new Error('unsupported');
  }catch{
   this.checked={path:executable,state:'error',detail:'无法执行 Codex CLI 或当前版本不支持所需的 exec 参数。'};
   return this.info();
  }
  try{
   await runFile(executable,['login','status'],options);
   this.checked={path:executable,state:'ready',detail:'CLI 可执行，已检测到本机登录。模型访问以实际任务为准。'};
  }catch{
   this.checked={path:executable,state:'error',detail:'未确认 Codex 登录。请在终端运行 codex login 后重新检测。'};
  }
  return this.info();
 }

 async createTask(context:RunContext) {
  const {task,workspace}=context;
  const emit=(payload:EventPayload)=>this.publish(context,{
   ...payload,taskId:task.id,eventId:randomUUID(),timestamp:new Date().toISOString(),sequence:0,
  });
  const run:Run={cancelled:false};
  this.runs.set(task.id,run);
  try{
   const executable=this.executable();
   const taskDir=await outputDir(workspace.directory,task.id);
   const cwd=await mkdtemp(path.join(taskDir,'codex-'));
   const inputs=path.join(cwd,'input');
   const output=path.join(cwd,'output');
   await mkdir(inputs);
   await mkdir(output);
   const attachments:string[]=[];
   for(const [i,file] of task.inputs.entries()){
    if(run.cancelled)break;
    const name=`${i+1}-${path.basename(file.name)}`;
    await copyFile(await readable(workspace.directory,file.path),path.join(inputs,name),constants.COPYFILE_EXCL);
    attachments.push(`input/${name}`);
   }
   if(run.cancelled)return;
   const prompt=[
    task.goal,
    '以下是 RelayDesk 提供的附件相对路径：'+JSON.stringify(attachments),
    '如需交付文件，请将普通文件直接写入 output/，不要创建子目录或符号链接。保留 input/ 原件。',
   ].join('\n\n');

   const child=spawn(executable,[
    '-a','never','exec','--json','--sandbox','workspace-write',
    '--skip-git-repo-check','-',
   ],{cwd,stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32',shell:false});
   const signal=(kind:NodeJS.Signals)=>{
    try{
     if(child.pid&&process.platform!=='win32')process.kill(-child.pid,kind);
     else child.kill(kind);
    }catch{/* process group already stopped */}
   };
   let force:NodeJS.Timeout|undefined;
   run.stop=()=>{
    signal('SIGTERM');
    force??=setTimeout(()=>signal('SIGKILL'),2000);
    force.unref();
   };
   child.stderr.resume();
   child.stdin.on('error',()=>{/* child closed stdin */});
   let spawnFailed=false;
   child.on('error',()=>{spawnFailed=true;});
   const closed=new Promise<number|null>(resolve=>child.once('close',resolve));
   child.stdin.end(prompt);

   let completed=false;
   let failed=false;
   let summary='';
   const startedTools=new Set<string>();
   for await(const line of createInterface({input:child.stdout,crlfDelay:Infinity})){
    if(run.cancelled||line.length>2_000_000)continue;
    let event;
    try{event=JSON.parse(line);}catch{continue;}
    if(!event||typeof event!=='object')continue;
    if(event.type==='thread.started'&&typeof event.thread_id==='string'){
     context.bindRemote(event.thread_id);
     emit({type:'task.started',remoteId:event.thread_id});
    }
    if(event.type==='turn.completed')completed=true;
    if(event.type==='turn.failed')failed=true;
    if(event.type==='item.completed'&&event.item?.type==='agent_message'&&typeof event.item.text==='string'){
     summary=event.item.text;
     emit({type:'message.delta',text:summary+'\n'});
    }
    const item=event.item;
    if((event.type==='item.started'||event.type==='item.completed')&&typeof item?.id==='string'&&Object.hasOwn(toolNames,item.type)){
     const name=toolNames[item.type];
     if(!startedTools.has(item.id)){
      startedTools.add(item.id);
      emit({type:'tool.started',toolId:item.id,name});
     }
     if(event.type==='item.completed')emit({type:'tool.completed',toolId:item.id,name});
    }
   }
   const code=await closed;
   if(force)clearTimeout(force);
   if(run.cancelled){
    signal('SIGKILL');
    return;
   }
   if(spawnFailed||code!==0||failed||!completed){
    throw new Error(spawnFailed?'无法启动 Codex CLI，请检查路径。':'Codex 未完成任务，请在终端检查 CLI 登录、模型权限和执行配置。');
   }

   // Only accept regular files directly under the task-owned output directory.
   if(!(await lstat(output)).isDirectory()||await within(cwd,output)!==output){
    throw new Error('Codex 输出目录已变化，无法导入成果。');
   }
   for(const entry of (await readdir(output,{withFileTypes:true})).filter(e=>e.isFile()).slice(0,100)){
    if(run.cancelled)return;
    const candidate=path.join(output,entry.name);
    const metadata=await lstat(candidate);
    if(!metadata.isFile()||metadata.nlink!==1||metadata.size>20*1024*1024)continue;
    const file=await readable(output,candidate);
    if(!run.cancelled)emit({type:'artifact.created',artifact:{
     id:randomUUID(),taskId:task.id,engine:'codex',name:entry.name,mime:mimeForName(entry.name),
     version:1,createdAt:new Date().toISOString(),location:{kind:'local',path:file},
    }});
   }
   if(!run.cancelled)emit({type:'task.completed',summary:summary.slice(0,1000)});
  }catch(error){
   if(!run.cancelled)emit({type:'task.failed',error:error instanceof Error?error.message:'Codex 执行失败。'});
  }finally{
   if(run.cancelled)emit({type:'task.cancelled'});
   this.runs.delete(task.id);
  }
 }

 async cancel(task:Task) {
  const run=this.runs.get(task.id);
  if(!run)throw new Error('Codex 任务已结束。');
  run.cancelled=true;
  run.stop?.();
 }

 dispose(){
  for(const run of this.runs.values()){
   run.cancelled=true;
   run.stop?.();
  }
 }
}
