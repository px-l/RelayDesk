import {DatabaseSync} from 'node:sqlite';
import type {Artifact,Task,TaskEvent,Workspace,PreparationRun,Baseline,ReviewReport} from '../shared/types.js';
import {transition} from '../shared/domain.js';
export class Store {
 readonly db:DatabaseSync;
 constructor(file:string){this.db=new DatabaseSync(file);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS events(task_id TEXT NOT NULL,event_id TEXT NOT NULL,sequence INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(task_id,event_id));
 CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS preparations(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS baselines(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,UNIQUE(task_id,version));
 CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,data TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS events_task ON events(task_id,sequence);`);}
 list<T>(table:'tasks'|'workspaces'|'artifacts'):T[]{return (this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid DESC`).all() as {data:string}[]).map(r=>JSON.parse(r.data));}
 putWorkspace(w:Workspace){this.db.prepare('INSERT INTO workspaces VALUES (?,?)').run(w.id,JSON.stringify(w));}
 putTask(t:Task){this.db.prepare('INSERT INTO tasks VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(t.id,JSON.stringify(t));}
 task(id:string):Task{const r=this.db.prepare('SELECT data FROM tasks WHERE id=?').get(id) as {data:string}|undefined;if(!r)throw new Error('任务不存在');return JSON.parse(r.data);}
 workspace(id:string):Workspace{const w=this.list<Workspace>('workspaces').find(w=>w.id===id);if(!w)throw new Error('工作区不存在');return w;}
 artifact(id:string):Artifact{const a=this.list<Artifact>('artifacts').find(a=>a.id===id);if(!a)throw new Error('成果不存在');return a;}
 events(id:string):TaskEvent[]{return (this.db.prepare('SELECT data FROM events WHERE task_id=? ORDER BY sequence,rowid').all(id) as {data:string}[]).map(r=>JSON.parse(r.data));}
 append(e:TaskEvent):boolean{
 this.db.exec('BEGIN IMMEDIATE');try{
 const max=this.db.prepare('SELECT COALESCE(MAX(sequence),0) AS seq FROM events WHERE task_id=?').get(e.taskId) as {seq:number};e.sequence=max.seq+1;
 const inserted=this.db.prepare('INSERT OR IGNORE INTO events VALUES (?,?,?,?)').run(e.taskId,e.eventId,e.sequence,JSON.stringify(e));
 if(!inserted.changes){this.db.exec('COMMIT');return false;}
 const t=this.task(e.taskId);t.status=transition(t.status,e);t.updatedAt=e.timestamp;
 if(e.type==='task.started'&&e.remoteId)t.remoteId=e.remoteId;
 if(e.type==='approval.required'){t.pendingApprovals=[...(t.pendingApprovals||[]).filter(p=>p.requestId!==e.requestId),{requestId:e.requestId,description:e.description,options:e.options}];}
 if(e.type==='task.completed'){if(e.summary!==undefined)t.summary=e.summary;t.error=undefined;t.pendingApprovals=[];}
 if(e.type==='task.cancelled')t.pendingApprovals=[];
 if(e.type==='task.failed')t.error=e.error;
 if(e.type==='artifact.created')this.db.prepare('INSERT INTO artifacts VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(e.artifact.id,e.taskId,JSON.stringify(e.artifact));
 if(e.type==='artifact.deleted')this.db.prepare('DELETE FROM artifacts WHERE id=? AND task_id=?').run(e.artifactId,e.taskId);
 this.putTask(t);this.db.exec('COMMIT');return true;
 }catch(err){this.db.exec('ROLLBACK');throw err;}}
 preparations(taskId:string):PreparationRun[]{return this.records<PreparationRun>('preparations',taskId);}
 baselines(taskId:string):Baseline[]{return this.records<Baseline>('baselines',taskId);}
 reviews(taskId:string):ReviewReport[]{return this.records<ReviewReport>('reviews',taskId);}
 private records<T>(table:'preparations'|'baselines'|'reviews',taskId:string):T[]{return (this.db.prepare(`SELECT data FROM ${table} WHERE task_id=? ORDER BY rowid DESC`).all(taskId) as {data:string}[]).map(r=>JSON.parse(r.data));}
 putPreparation(r:PreparationRun){this.db.prepare('INSERT INTO preparations VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(r.id,r.taskId,JSON.stringify(r));}
 putReview(r:ReviewReport){this.db.prepare('INSERT INTO reviews VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(r.id,r.taskId,JSON.stringify(r));}
 insertBaseline(b:Baseline){this.db.prepare('INSERT INTO baselines VALUES (?,?,?,?)').run(b.id,b.taskId,b.version,JSON.stringify(b));}
 close(){this.db.close();}
}
