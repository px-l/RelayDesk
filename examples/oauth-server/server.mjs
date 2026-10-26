/** Server-only OAuth reference. Never include this directory in a desktop bundle. */
import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
const {WORKBUDDY_CLIENT_ID:clientId,WORKBUDDY_CLIENT_SECRET:clientSecret,PUBLIC_ORIGIN:origin}=process.env;
if(!clientId||!clientSecret||!origin||new URL(origin).protocol!=='https:')throw new Error('Configure server-only client ID, secret and HTTPS PUBLIC_ORIGIN');
const redirectUri=new URL('/callback',origin).href;const pending=new Map();
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
setInterval(()=>{for(const [state,expiry] of pending)if(expiry<Date.now())pending.delete(state);},60000).unref();
http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
 const url=new URL(req.url,'http://localhost');
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 if(url.pathname==='/login'){
  if(pending.size>1000){res.writeHead(429);return res.end('Try later');}
  const state=randomBytes(32).toString('hex');pending.set(state,Date.now()+10*60000);
  res.setHeader('Set-Cookie',`wb_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  const auth=new URL('https://www.workbuddy.cn/openapi/v2/authorize');auth.search=new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirectUri,scope:'user.task.readable user.task.invokable',state}).toString();res.writeHead(302,{Location:auth.href});return res.end();
 }
 if(url.pathname==='/callback'){
  const state=url.searchParams.get('state')||'';const cookie=req.headers.cookie?.match(/(?:^|;\s*)wb_oauth_state=([a-f0-9]{64})/)?.[1]||'';const expires=pending.get(state);pending.delete(state);
  if(!expires||expires<Date.now()||!cookie||cookie.length!==state.length||!timingSafeEqual(Buffer.from(cookie),Buffer.from(state))||!url.searchParams.get('code')){res.writeHead(400);return res.end('Invalid OAuth state');}
  res.setHeader('Set-Cookie','wb_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  try{
   const response=await fetch('https://www.workbuddy.cn/openapi/v2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:url.searchParams.get('code'),redirect_uri:redirectUri,client_id:clientId,client_secret:clientSecret}),signal:AbortSignal.timeout(15000),redirect:'error'});
   if(!response.ok)throw new Error('Token exchange failed');const tokens=await response.json();if(typeof tokens.access_token!=='string')throw new Error('Missing token');
   // This reference uses manual transfer; production needs authenticated per-user storage and refresh rotation.
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(`<h1>RelayDesk 授权完成</h1><p>将 access_token 复制到桌面设置。关闭此页面后不保留。不要分享此页面内容。</p><textarea rows="10" cols="80" readonly>${escape(tokens.access_token)}</textarea><p>有效期：${Number(tokens.expires_in)||'以官方返回为准'} 秒。此示例不保存 refresh_token。</p>`);
  }catch{res.writeHead(502);return res.end('OAuth exchange failed; check server configuration. No credentials are logged.');}
 }
 res.writeHead(404);res.end('Visit /login');
}).listen(8787,'127.0.0.1',()=>console.log('OAuth reference listening on localhost:8787; place behind your HTTPS reverse proxy'));
