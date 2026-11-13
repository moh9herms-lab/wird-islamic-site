/**
 * وِرد — خادم HTTP بسيط بُني بمكتبات Node.js القياسية فقط.
 * شغّله: node server.mjs
 * لتفعيل بحث الذكاء الاصطناعي: OPENAI_API_KEY=... node server.mjs
 * لا ترسل مفتاح OpenAI إلى المتصفح أبدًا.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||3000);
const KEY=process.env.OPENAI_API_KEY||'';
const MODEL=process.env.OPENAI_MODEL||'gpt-6-astra';
const DOMAINS=['binbaz.org.sa','islamweb.net','islamqa.info','dorar.net'];
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
const hits=new Map();
const send=(res,status,json)=>{const body=JSON.stringify(json);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body)};
function allowed(url){try{const u=new URL(url);return u.protocol==='https:'&&DOMAINS.some(d=>u.hostname===d||u.hostname.endsWith('.'+d))}catch{return false}}
async function readBody(req){let value='';for await(const chunk of req){value+=chunk.toString('utf8');if(value.length>6000)throw Object.assign(new Error('سؤال طويل جدًا'),{status:413})}try{return JSON.parse(value)}catch{throw Object.assign(new Error('تنسيق الطلب غير صحيح'),{status:400})}}
function throttle(req){const addr=req.socket.remoteAddress||'unknown';const now=Date.now();const entry=hits.get(addr)||[];const next=entry.filter(t=>now-t<3600000);if(next.length>=12)return false;next.push(now);hits.set(addr,next);if(hits.size>10000){for(const[k,v]of hits){if(!v.some(t=>now-t<3600000))hits.delete(k)}}return true}
function extract(result){const contents=(result.output||[]).filter(o=>o.type==='message').flatMap(m=>m.content||[]).filter(c=>c.type==='output_text');const answer=contents.map(c=>c.text).join('\n').trim();let sources=[];for(const c of contents){for(const a of c.annotations||[]){if(a.type==='url_citation'&&allowed(a.url)){sources.push({title:a.title||new URL(a.url).hostname,url:a.url})}}}for(const obj of result.output||[]){if(obj.type==='web_search_call'){for(const s of obj.action?.sources||[]){if(allowed(s.url))sources.push({title:s.title||new URL(s.url).hostname,url:s.url})}}}sources=[...new Map(sources.map(s=>[s.url,s])).values()].slice(0,8);return {answer,sources}}
async function handleAsk(req,res){if(!throttle(req))return send(res,429,{error:'وصلت إلى حد الاستخدام المؤقت. حاول لاحقًا.'});let body;try{body=await readBody(req)}catch(e){return send(res,e.status||400,{error:e.message})}const question=String(body.question||'').trim();if(question.length<5||question.length>1200)return send(res,400,{error:'أدخل سؤالًا بين ٥ و١٢٠٠ حرف.'});if(!KEY)return send(res,503,{error:'المساعد الآلي غير مفعّل بعد. أضف OPENAI_API_KEY إلى إعدادات خادم الموقع، ويمكنك الآن استخدام روابط البحث المباشر أدناه.'});
 const instructions=`أنت مساعد بحث شرعي باللغة العربية. مهمتك جمع معلومات من المصادر التالية فقط: binbaz.org.sa و islamweb.net و islamqa.info و dorar.net. يجب عليك البحث باستخدام أداة web_search لكل سؤال. لا تعتمد على معلومات من خارج المصادر المقيدة. ابدأ بملخص واضح ومحايد، ثم انقل الآراء إن اختلفت مع نسبتها إلى أصحابها. لا تختلق فتوى أو حديثًا أو نصًا أو مصدرًا. لا تستخدم صيغة جازمة إذا كانت المسألة خلافية. إذا لم تجد مصادر واضحة، صرّح بذلك دون تخمين. لا تقتبس فقرات طويلة. اجعل إجابتك موجزة (200-350 كلمة كحد أقصى) وادعم الادعاءات بالإحالة إلى المصادر التي وجدتها. لا تطلب بيانات شخصية. لا تحل محل سؤال أهل العلم في الفتوى الشخصية.`;
 try{
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,reasoning:{effort:'low'},instructions,input:question,tools:[{type:'web_search',search_context_size:'medium',filters:{allowed_domains:DOMAINS}}],tool_choice:'required',max_output_tokens:1000,include:['web_search_call.action.sources']}),signal:AbortSignal.timeout(65000)});
  const data=await response.json();if(!response.ok){console.error('OpenAI request failed',response.status,data.error?.code||'');return send(res,502,{error:'تعذّر الوصول إلى خدمة البحث الآلي. راجع إعدادات المفتاح والنموذج في الخادم.'})}
  const {answer,sources}=extract(data);if(!sources.length){return send(res,200,{answer:'لم أتمكن من العثور على إجابة مرتبطة بمصادر موثقة من المواقع المحددة. استخدم روابط البحث المباشر أو استفتِ أهل العلم.',sources:[]})}
  return send(res,200,{answer:answer||'ظهرت مصادر للبحث، لكن تعذر توليد ملخص مناسب. افتح الروابط أدناه.',sources});
 }catch(e){console.error('AI lookup error',e.message);return send(res,504,{error:'انتهت مهلة البحث أو انقطع الاتصال. حاول مرة أخرى.'})}
}
async function serve(req,res,pathname){if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'الطريقة غير مسموحة'});let name;try{name=decodeURIComponent(pathname)}catch{return send(res,400,{error:'مسار غير صالح'})}if(name==='/'||name==='')name='/index.html';const file=path.resolve(ROOT,'.'+name);if(file!==ROOT&&!file.startsWith(ROOT+path.sep))return send(res,403,{error:'وصول ممنوع'});if(path.basename(file).startsWith('.')||['server.mjs','package.json','README.md','LICENSE'].includes(path.basename(file)))return send(res,404,{error:'غير موجود'});try{const stat=await fs.stat(file);if(!stat.isFile())return send(res,404,{error:'غير موجود'});res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'SAMEORIGIN'});if(req.method==='HEAD')return res.end();res.end(await fs.readFile(file))}catch{send(res,404,{error:'الملف غير موجود'})}}
const server=http.createServer(async(req,res)=>{let pathname;try{pathname=new URL(req.url,'http://localhost').pathname}catch{return send(res,400,{error:'طلب غير صالح'})}if(pathname==='/api/status'&&req.method==='GET')return send(res,200,{ok:true,aiConfigured:Boolean(KEY)});if(pathname==='/api/ask'){if(req.method!=='POST')return send(res,405,{error:'الطريقة غير مسموحة'});return handleAsk(req,res)}return serve(req,res,pathname)});
server.listen(PORT,'0.0.0.0',()=>console.log(`وِرد متاح على http://localhost:${PORT} — المساعد الآلي ${KEY?'مهيأ':'غير مفعّل (يتطلب مفتاح API)'}`));
