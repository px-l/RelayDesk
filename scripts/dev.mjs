import {spawn} from 'node:child_process';
const children=[]; const run=(cmd,args)=>{const c=spawn(cmd,args,{stdio:'inherit',env:{...process.env}});children.push(c);return c;};
const compile=run('npx',['tsc','-p','tsconfig.backend.json']);
compile.on('exit',async code=>{if(code)process.exit(code);const vite=run('npx',['vite']);for(let i=0;i<80;i++){try{await fetch('http://127.0.0.1:5173');break;}catch{await new Promise(r=>setTimeout(r,250));}}const e=spawn('npx',['electron','.'],{stdio:'inherit',env:{...process.env,RELAYDESK_DEV:'1'}});children.push(e);e.on('exit',()=>{vite.kill();process.exit();});});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{children.forEach(c=>c.kill());process.exit();});
