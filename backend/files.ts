import {realpath,stat,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
export async function within(root:string,target:string):Promise<string>{
 const [r,t]=await Promise.all([realpath(root),realpath(target)]);const relative=path.relative(r,t);
 if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error('文件不在已授权目录内');return t;
}
export async function outputDir(root:string,taskId:string){
 if(!/^[a-zA-Z0-9-]+$/.test(taskId))throw new Error('非法任务标识');
 const base=path.join(root,'.relaydesk');await mkdir(base,{recursive:true});await within(root,base);
 const dir=path.join(base,taskId);await mkdir(dir,{recursive:true});return within(root,dir);
}
export async function writeOutput(root:string,taskId:string,name:string,content:string|Uint8Array){
 if(path.basename(name)!==name||name==='.'||name==='..')throw new Error('非法文件名');
 const dir=await outputDir(root,taskId);const target=path.join(dir,name);
 // Exclusive creation avoids overwriting a symlink or existing user file.
 await writeFile(target,content,{flag:'wx'});return within(root,target);
}
export async function readable(root:string,target:string){const file=await within(root,target);const s=await stat(file);if(!s.isFile()||s.size>20*1024*1024)throw new Error('仅支持预览 20MB 以下的普通文件');return file;}

export function mimeForName(name:string){const types:Record<string,string>={'.md':'text/markdown','.markdown':'text/markdown','.txt':'text/plain','.csv':'text/csv','.json':'application/json','.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.html':'text/html','.htm':'text/html','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'};return types[path.extname(name).toLowerCase()]||'application/octet-stream';}
