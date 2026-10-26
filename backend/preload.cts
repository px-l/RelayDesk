import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('relaydesk',{
 request:(request:unknown)=>ipcRenderer.invoke('relaydesk:request',request).then((r:{ok:boolean;value:unknown;error?:string})=>{if(!r.ok)throw new Error(r.error);return r.value;}),
 subscribe:(callback:(event:unknown)=>void)=>{const listener=(_event:unknown,data:unknown)=>callback(data);ipcRenderer.on('relaydesk:event',listener);return ()=>ipcRenderer.removeListener('relaydesk:event',listener);}
});
