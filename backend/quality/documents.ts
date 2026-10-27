import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {readable,writeOutput} from '../files.js';
import type {DocumentSnapshot} from '../../shared/types.js';
export const hash=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');
export const TEXT_LIMIT=18000;
async function extract(bytes:Uint8Array,name:string):Promise<{text:string;issue?:string}>{
 const ext=path.extname(name).toLowerCase();
 if(['.md','.markdown','.txt','.csv','.json','.log','.ts','.js','.py'].includes(ext)){
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text.includes('\0'))return {text:'',issue:'文件包含二进制内容，未作为文本读取'};return {text};
 }
 if(ext==='.pdf'){
  // Parsing only: never render or execute actions in uploaded documents.
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,useWorkerFetch:false,useWasm:false,enableXfa:false,verbosity:0});
  try{const pdf=await loading.promise;const pages:string[]=[];for(let n=1;n<=Math.min(pdf.numPages,60);n++){const p=await pdf.getPage(n);const content=await p.getTextContent();pages.push(`[第 ${n} 页]\n${content.items.map(i=>'str' in i?i.str:'').join(' ')}`);if(pages.join('\n').length>TEXT_LIMIT)break;}const text=pages.join('\n\n');if(!text.replace(/\[第 \d+ 页\]/g,'').trim())return {text:'',issue:'PDF 无可提取文本；本版不做 OCR'};return {text:text+(pdf.numPages>pages.length?'\n[剩余页未检查]':'')};}finally{await loading.destroy();}
 }
 return {text:'',issue:'此格式不支持内容检查（支持 UTF-8 文本、Markdown、CSV、JSON 和文本型 PDF）；预览可用不等于内容可审核'};
}
export async function captureFile(root:string,taskId:string,sourceId:string,name:string,originalPath:string):Promise<DocumentSnapshot>{
 const f=await readable(root,originalPath);const bytes=await readFile(f);const id=randomUUID();const snapshotPath=await writeOutput(root,taskId,`snapshot-${id}-${path.basename(name)}`,bytes);
 let extracted:{text:string;issue?:string};try{extracted=await extract(bytes,name);}catch{extracted={text:'',issue:'文件解析失败，不能把未读取内容视为已检查'};}
 const truncated=extracted.text.length>TEXT_LIMIT||extracted.text.includes('[剩余页未检查]');return {id,sourceId,name,originalPath:f,snapshotPath,sha256:hash(bytes),text:extracted.text.slice(0,TEXT_LIMIT),issue:extracted.issue,truncated};
}
export async function captureAnswer(root:string,taskId:string,text:string):Promise<DocumentSnapshot>{
 const id=randomUUID();const snapshotPath=await writeOutput(root,taskId,`answer-${id}.txt`,text);return {id,sourceId:'answer',name:'本轮公开回答.txt',snapshotPath,sha256:hash(text),text:text.slice(0,TEXT_LIMIT),truncated:text.length>TEXT_LIMIT};
}
export async function snapshotIntact(root:string,d:DocumentSnapshot){try{return hash(await readFile(await readable(root,d.snapshotPath)))===d.sha256;}catch{return false;}}
export async function originalIntact(root:string,d:DocumentSnapshot){if(!d.originalPath)return true;try{return hash(await readFile(await readable(root,d.originalPath)))===d.sha256;}catch{return false;}}
