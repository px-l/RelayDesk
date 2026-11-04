// Protocol fixtures exercise our client. They are not vendor end-to-end validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DshAdapter} from '../backend/adapters/dsh.ts';
import {CodexAdapter} from '../backend/adapters/codex.ts';
import type {Task,TaskEvent} from '../shared/types.ts';
function context(){const task:Task={id:'t',workspaceId:'w',title:'goal',goal:'请执行',engine:'dsh',createdAt:'',updatedAt:'',status:'draft',dispatched:false,inputs:[]};const events:TaskEvent[]=[];return {events,task,workspace:{id:'w',directory:tmpdir(),name:'w',createdAt:''},bindRemote:(id:string)=>{task.remoteId=id;},emit:(e:TaskEvent)=>events.push(e)};}
test('DSH 官方 ACP stdio 调用契约（本地协议替身）',async()=>{const dir=await mkdtemp(path.join(tmpdir(),'relaydesk-rpc-'));const exe=path.join(dir,'fixture');await writeFile(exe,`#!${process.execPath}\nconst rl=require('node:readline').createInterface({input:process.stdin});rl.on('line',line=>{const m=JSON.parse(line);const send=x=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...x})+'\\n');if(m.method==='initialize')send({id:m.id,result:{protocolVersion:1}});else if(m.method==='session/new')send({id:m.id,result:{sessionId:'session-real-shape'}});else if(m.method==='session/prompt'){send({method:'session/update',params:{sessionId:m.params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'fixture response'}}}});send({id:m.id,result:{stopReason:'end_turn'}});}});`);await chmod(exe,0o700);const adapter=new DshAdapter(()=>exe);assert.equal((await adapter.check()).state,'ready');const c=context();c.task.engine='dsh';const subscribed:TaskEvent[]=[];const unsubscribe=adapter.subscribe(c.task.id,e=>subscribed.push(e));await adapter.createTask(c);assert.equal(subscribed.length,c.events.length);unsubscribe();assert.equal(c.task.remoteId,'session-real-shape');assert.ok(c.events.some(e=>e.type==='message.delta'));assert.equal(c.events.at(-1)?.type,'task.completed');adapter.dispose();});

test('Codex CLI 接收附件和需求，只导入合规成果，并验证完成事件',{timeout:10000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'relaydesk-codex-'));
 const exe=path.join(dir,'fixture');
 const input=path.join(dir,'source.md');
 await writeFile(input,'授权资料');
 await writeFile(exe,`#!${process.execPath}
 const fs=require('node:fs');
 const args=process.argv.slice(2);
 if(args.includes('--help')){console.log('--json --sandbox');process.exit(0);}
 if(args[0]==='login')process.exit(0);
 const send=(type,body={})=>console.log(JSON.stringify({type,...body}));
 if(!args.includes('workspace-write')||!args.includes('--json'))process.exit(1);
 const prompt=fs.readFileSync(0,'utf8');
 if(!prompt.includes('input/1-source.md')||fs.readFileSync('input/1-source.md','utf8')!=='授权资料')process.exit(1);
 send('thread.started',{thread_id:'codex-fixture'});
 if(prompt.includes('取消测试')){setInterval(()=>{},1000);return;}
 if(prompt.includes('失败测试')){send('turn.failed');process.exit(0);}
 send('item.started',{item:{id:'tool-1',type:'command_execution'}});
 send('item.completed',{item:{id:'tool-1',type:'command_execution'}});
 fs.writeFileSync('output/报告.md','# 测试成果');
 fs.symlinkSync('../input/1-source.md','output/link.md');
 send('item.completed',{item:{id:'message-1',type:'agent_message',text:'成果已写入'}});
 send('turn.completed');
 `);
 await chmod(exe,0o700);
 const adapter=new CodexAdapter(()=>exe);
 assert.equal((await adapter.check()).state,'ready');
 const prepare=(id:string,goal:string)=>{
  const c=context();
  c.workspace.directory=dir;
  Object.assign(c.task,{id,goal,engine:'codex',inputs:[{id:'source',name:'source.md',path:input,size:12}]});
  return c;
 };
 try{
  const c=prepare('success','完成测试');
  await adapter.createTask(c);
  assert.equal(c.task.remoteId,'codex-fixture');
  assert.deepEqual(c.events.map(e=>e.type),['task.started','tool.started','tool.completed','message.delta','artifact.created','task.completed']);
  const result=c.events.find(e=>e.type==='artifact.created');
  assert.equal(result?.artifact.name,'报告.md');
  const failed=prepare('failed','失败测试');
  await adapter.createTask(failed);
  assert.equal(failed.events.at(-1)?.type,'task.failed');
  const cancelled=prepare('cancelled','取消测试');
  const run=adapter.createTask(cancelled);
  await new Promise<void>(resolve=>{
   const unsubscribe=adapter.subscribe(cancelled.task.id,e=>{
    if(e.type==='task.started'){unsubscribe();resolve();}
   });
  });
  await adapter.cancel(cancelled.task);
  await run;
  assert.equal(cancelled.events.at(-1)?.type,'task.cancelled');
 }finally{
  adapter.dispose();
  await rm(dir,{recursive:true,force:true});
 }
});
