import {useEffect,useRef,useState} from 'react';
import {getDocument,GlobalWorkerOptions,type PDFDocumentProxy,type RenderTask} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {LoaderCircle,AlertCircle,ChevronRight} from 'lucide-react';
GlobalWorkerOptions.workerSrc=new URL(workerUrl,window.location.href).href;
export default function PdfPreview({content}:{content:string}){
 const canvas=useRef<HTMLCanvasElement>(null);const [document,setDocument]=useState<PDFDocumentProxy>();const [page,setPage]=useState(1);const [error,setError]=useState('');const [busy,setBusy]=useState(true);
 useEffect(()=>{setError('');setBusy(true);const bytes=Uint8Array.from(atob(content.split(',')[1]),c=>c.charCodeAt(0));const loading=getDocument({data:bytes,useSystemFonts:true,useWorkerFetch:false,useWasm:false,enableXfa:false,maxImageSize:16*1024*1024,verbosity:0});let disposed=false;
 loading.promise.then(pdf=>{if(!disposed){setDocument(pdf);setPage(1);}}).catch(e=>{if(!disposed){setError(e.message);setBusy(false);}});return ()=>{disposed=true;void loading.destroy();};},[content]);
 useEffect(()=>{if(!document)return;let disposed=false;let rendering:RenderTask|undefined;setBusy(true);setError('');
 void document.getPage(page).then(async p=>{if(disposed||!canvas.current)return;const viewport=p.getViewport({scale:1.35});const c=canvas.current;c.width=viewport.width;c.height=viewport.height;rendering=p.render({canvas:c,canvasContext:c.getContext('2d')!,viewport});await rendering.promise;if(!disposed){c.dataset.rendered='true';setBusy(false);}}).catch(e=>{if(!disposed){setError(e.message);setBusy(false);}});return ()=>{disposed=true;rendering?.cancel();if(canvas.current)delete canvas.current.dataset.rendered;};},[document,page]);
 return <div className="pdf-preview"><div className="pdf-controls"><button disabled={page<=1||busy} onClick={()=>setPage(p=>p-1)}>上一页</button><span>{page} / {document?.numPages||'…'}</span><button disabled={!document||page>=document.numPages||busy} onClick={()=>setPage(p=>p+1)}>下一页<ChevronRight size={12}/></button><span className="muted">仅渲染内容</span></div>{busy&&<p className="flex items-center justify-center gap-2 text-xs muted py-5"><LoaderCircle size={15} className="spin"/>正在绘制 PDF…</p>}{error&&<p className="notice"><AlertCircle size={15} className="inline"/> PDF 预览失败：{error}。可导出后使用系统应用打开。</p>}<canvas ref={canvas} className="pdf-canvas" aria-label="PDF 页面"/></div>;
}
