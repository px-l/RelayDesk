import {create} from 'zustand';
import type {Bridge,Snapshot,TaskDetail,TaskEvent} from '../shared/types';
declare global {interface Window {relaydesk?:Bridge}}
export const api=<T,>(request:Parameters<Bridge['request']>[0]):Promise<T>=>{if(!window.relaydesk)return Promise.reject(new Error('请在 Electron 桌面应用中运行；浏览器不提供本地文件权限。'));return window.relaydesk.request<T>(request);};
interface State {snapshot:Snapshot;workspaceId:string;taskId:string;details:Record<string,TaskDetail>;error:string;loading:boolean;refresh:()=>Promise<void>;select:(id:string)=>Promise<void>;setWorkspace:(id:string)=>void;flush:(events:TaskEvent[])=>void;}
export const useDesk=create<State>((set,get)=>({snapshot:{workspaces:[],tasks:[],artifacts:[],engines:[]},workspaceId:'',taskId:'',details:{},error:'',loading:true,
 refresh:async()=>{try{const snapshot=await api<Snapshot>({op:'snapshot'});set(s=>({snapshot,loading:false,error:'',workspaceId:s.workspaceId||snapshot.workspaces[0]?.id||''}));const id=get().taskId;if(id){const detail=await api<TaskDetail>({op:'task.detail',taskId:id});set(s=>({details:{...s.details,[id]:detail}}));}}catch(e){set({error:(e as Error).message,loading:false});}},
 select:async id=>{set({taskId:id});try{const detail=await api<TaskDetail>({op:'task.detail',taskId:id});set(s=>({details:{...s.details,[id]:detail}}));}catch(e){set({error:(e as Error).message});}},
 setWorkspace:id=>set({workspaceId:id,taskId:''}),
 flush:events=>set(s=>{const details={...s.details};for(const e of events){const old=details[e.taskId];if(!old||old.events.some(x=>x.eventId===e.eventId))continue;details[e.taskId]={...old,events:[...old.events,e]};}return {details};})
}));
let initialized=false;
export function connect(){if(initialized)return;initialized=true;let queue:TaskEvent[]=[];let timer:ReturnType<typeof setTimeout>|undefined;
 window.relaydesk?.subscribe(e=>{queue.push(e);if(!timer)timer=setTimeout(()=>{const batch=queue;queue=[];timer=undefined;useDesk.getState().flush(batch);if(batch.some(e=>e.type!=='message.delta'))void useDesk.getState().refresh();},60);});
 void useDesk.getState().refresh();
 // Read-only local refresh also catches transport interruptions (not remote re-execution).
 setInterval(()=>{if(useDesk.getState().snapshot.tasks.some(t=>['starting','running','waiting_input','cancelling'].includes(t.status)))void useDesk.getState().refresh();},2000);
}
