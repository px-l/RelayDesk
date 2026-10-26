import {randomUUID} from 'node:crypto';
import type {RunContext} from './base.js';
import type {EventPayload} from '../../shared/types.js';
export interface RpcMessage {jsonrpc?:string;id?:number|string;method?:string;params?:any;result?:any;error?:{code:number;message:string};}
export class RpcPeer {
 private id=0;private pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 onNotification:(message:RpcMessage,cursor?:string)=>void=()=>{};
 onRequest:(message:RpcMessage)=>void=()=>{};
 constructor(private write:(m:RpcMessage)=>void|Promise<void>){}
 request(method:string,params:unknown,timeout=60000):Promise<any>{const id=++this.id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`协议请求超时：${method}。请查询已有任务状态，不要重复启动。`));},timeout);this.pending.set(id,{resolve,reject,timer});Promise.resolve(this.write({jsonrpc:'2.0',id,method,params})).catch(e=>{clearTimeout(timer);this.pending.delete(id);reject(e);});});}
 notify(method:string,params:unknown){return this.write({jsonrpc:'2.0',method,params});}
 respond(id:number|string,result:unknown){return this.write({jsonrpc:'2.0',id,result});}
 receive(m:RpcMessage,cursor?:string){if(m.method){if(m.id!==undefined)this.onRequest(m);else this.onNotification(m,cursor);return;}const p=this.pending.get(Number(m.id));if(!p)return;clearTimeout(p.timer);this.pending.delete(Number(m.id));if(m.error)p.reject(new Error(`引擎协议错误 (${m.error.code})`));else p.resolve(m.result);}
 close(){this.pending.forEach(p=>{clearTimeout(p.timer);p.reject(new Error('引擎连接已断开；请查询已有任务'));});this.pending.clear();}
}
export class AcpEvents {
 private sequence=0;
 constructor(private c:RunContext){ }
 emit(p:EventPayload,cursor?:string){this.c.emit({...p,taskId:this.c.task.id,eventId:cursor?`acp:${cursor}`:randomUUID(),timestamp:new Date().toISOString(),sequence:++this.sequence,sourceCursor:cursor});}
 update(m:RpcMessage,cursor?:string){
 if(m.method!=='session/update'||m.params?.sessionId!==this.c.task.remoteId)return;
 const u=m.params.update;
 if(u?.sessionUpdate==='agent_message_chunk'&&u.content?.type==='text')this.emit({type:'message.delta',text:u.content.text},cursor);
 // Deliberately ignore agent_thought_chunk: no private reasoning is exposed.
 if(u?.sessionUpdate==='tool_call')this.emit({type:'tool.started',toolId:u.toolCallId,name:u.title||'工具调用'},cursor);
 if(u?.sessionUpdate==='tool_call_update'&&['completed','failed'].includes(u.status))this.emit({type:'tool.completed',toolId:u.toolCallId,name:u.title||'工具调用',detail:u.status==='failed'?'工具执行失败':'执行完成'},cursor);
 }
 finish(result:any){if(result?.stopReason==='cancelled')this.emit({type:'task.cancelled'});else if(result?.stopReason==='end_turn')this.emit({type:'task.completed'});else this.emit({type:'task.failed',error:`本轮未正常完成：${String(result?.stopReason||'未知结束原因')}`});}
}
export function parseSseBlock(block:string):{id?:string;data:string}|undefined{
 let id:string|undefined;const data:string[]=[];
 for(const line of block.split('\n')){if(line.startsWith('id:'))id=line.slice(3).trim();if(line.startsWith('data:'))data.push(line.slice(5).trimStart());}
 return data.length?{id,data:data.join('\n')}:undefined;
}
