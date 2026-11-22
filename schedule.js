import {existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {basename,dirname,isAbsolute,join,normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=dirname(fileURLToPath(import.meta.url));
const POSTS_DIR=join(ROOT,'posts');
const DATA_DIR=join(ROOT,'data');
const QUEUE_PATH=join(DATA_DIR,'schedule.json');
const CAPTION_LIMIT=1024;
const OMSK_OFFSET_MS=6*60*60*1000;
const LATE_WINDOW_MS=6*60*60*1000;
const TICK_MS=30_000;

const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/** Parse `YYYY-MM-DD HH:mm` as Omsk wall time (UTC+6) → UTC ms. */
export function parseOmskAt(raw){
  const m=/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/.exec(String(raw||'').trim());
  if(!m)throw Object.assign(Error(`Bad at: ${raw}`),{code:'BAD_AT'});
  const y=+m[1],mo=+m[2]-1,d=+m[3],h=+m[4],mi=+m[5];
  return Date.UTC(y,mo,d,h,mi)-OMSK_OFFSET_MS;
}

export function formatOmsk(ms){
  const t=new Date(ms+OMSK_OFFSET_MS);
  const p=n=>String(n).padStart(2,'0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth()+1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())} (Омск)`;
}

/**
 * Tiny frontmatter parser (--- … ---).
 * Supports: at, image, buttons as `- [Label, url]`.
 */
export function parseFrontmatter(source){
  const text=String(source||'').replace(/^\uFEFF/,'');
  if(!text.startsWith('---')){
    return {meta:{},body:text.trim()};
  }
  const end=text.indexOf('\n---',3);
  if(end<0)return {meta:{},body:text.trim()};
  const raw=text.slice(3,end).replace(/^\r?\n/,'').replace(/\r?\n$/,'');
  const body=text.slice(end+4).replace(/^\r?\n/,'').trim();
  const meta={};
  const lines=raw.split(/\r?\n/);
  let i=0;
  while(i<lines.length){
    const line=lines[i];
    const kv=/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if(!kv){i+=1;continue}
    const key=kv[1];
    let val=kv[2].trim();
    if(key==='buttons'&&(val===''||val==='|')){
      const buttons=[];
      i+=1;
      while(i<lines.length){
        const row=lines[i];
        if(/^[a-zA-Z_][\w-]*\s*:/.test(row)&&!/^\s+-/.test(row))break;
        const btn=/^\s*-\s*\[(.+)\]\s*$/.exec(row);
        if(btn){
          const inner=btn[1];
          const comma=inner.indexOf(',');
          if(comma>0){
            buttons.push({
              text:inner.slice(0,comma).trim(),
              url:inner.slice(comma+1).trim(),
            });
          }
        }
        i+=1;
      }
      meta.buttons=buttons;
      continue;
    }
    if((val.startsWith('"')&&val.endsWith('"'))||(val.startsWith("'")&&val.endsWith("'"))){
      val=val.slice(1,-1);
    }
    // strip inline comments after value (space + #)
    const hash=val.search(/\s+#/);
    if(hash>=0)val=val.slice(0,hash).trim();
    meta[key]=val;
    i+=1;
  }
  return {meta,body};
}

function resolveImagePath(image){
  if(!image)return {path:null,missing:false};
  const rel=String(image).trim().replace(/^\.\//,'');
  const full=isAbsolute(rel)?rel:join(ROOT,rel);
  const norm=normalize(full);
  if(!norm.startsWith(ROOT))throw Object.assign(Error(`Image outside project: ${image}`),{code:'BAD_IMAGE'});
  if(!existsSync(norm))return {path:null,missing:true,wanted:rel};
  return {path:norm,missing:false};
}

function firstLine(body){
  const line=String(body||'').split(/\r?\n/).map(s=>s.trim()).find(Boolean)||'(пусто)';
  return line.replace(/<[^>]+>/g,'').slice(0,120);
}

export function loadPostFile(fileName,{botUsername=''}={}){
  const base=basename(fileName);
  if(!base.endsWith('.md')||base.includes('..')||base.includes('/')||base.includes('\\')){
    throw Object.assign(Error(`Bad file: ${fileName}`),{code:'BAD_FILE'});
  }
  const path=join(POSTS_DIR,base);
  if(!existsSync(path))throw Object.assign(Error(`No post: ${base}`),{code:'MISSING_POST'});
  const raw=readFileSync(path,'utf8');
  const {meta,body}=parseFrontmatter(raw);
  if(!meta.at)throw Object.assign(Error(`${base}: нет поля at`),{code:'NO_AT'});
  const atMs=parseOmskAt(meta.at);
  const buttons=(meta.buttons||[]).map(({text,url})=>({
    text,
    url:String(url||'')
      .replaceAll('<бот>',botUsername)
      .replaceAll('{bot}',botUsername)
      .replaceAll('%bot%',botUsername),
  })).filter(b=>b.text&&b.url);
  const img=resolveImagePath(meta.image);
  const captionTooLong=Boolean(img.path&&body.length>CAPTION_LIMIT);
  return {
    file:base,
    path,
    atMs,
    atRaw:meta.at,
    body,
    imagePath:img.path,
    imageMissing:img.missing?img.wanted:null,
    buttons,
    captionTooLong,
    previewLine:firstLine(body),
  };
}

export function listPostFiles(){
  if(!existsSync(POSTS_DIR))return [];
  return readdirSync(POSTS_DIR)
    .filter(n=>n.endsWith('.md'))
    .sort();
}

function emptyQueue(){
  return {items:[]};
}

export function loadQueue(){
  try{
    if(!existsSync(QUEUE_PATH))return emptyQueue();
    const data=JSON.parse(readFileSync(QUEUE_PATH,'utf8'));
    if(!data||!Array.isArray(data.items))return emptyQueue();
    return {items:data.items};
  }catch{
    return emptyQueue();
  }
}

export function saveQueue(queue){
  mkdirSync(DATA_DIR,{recursive:true});
  writeFileSync(QUEUE_PATH,JSON.stringify(queue,null,2)+'\n','utf8');
}

function buttonsKeyboard(buttons){
  if(!buttons?.length)return undefined;
  return {inline_keyboard:buttons.map(b=>[{text:b.text,url:b.url}])};
}

/**
 * Publish one post to chatId. Returns {message_id, mode:'photo'|'text'}.
 */
export async function publishPost(api,telegramForm,token,{post,chatId}){
  const markup=buttonsKeyboard(post.buttons);
  if(post.imagePath&&!post.captionTooLong){
    const form=new FormData();
    form.append('chat_id',String(chatId));
    form.append('caption',post.body);
    form.append('parse_mode','HTML');
    if(markup)form.append('reply_markup',JSON.stringify(markup));
    const buf=readFileSync(post.imagePath);
    const name=basename(post.imagePath);
    const type=name.endsWith('.png')?'image/png':name.endsWith('.webp')?'image/webp':'image/jpeg';
    form.append('photo',new Blob([buf],{type}),name);
    const result=await telegramForm(token,'sendPhoto',form);
    return {message_id:result.message_id,mode:'photo'};
  }
  const result=await api('sendMessage',{
    chat_id:chatId,
    text:post.body,
    parse_mode:'HTML',
    link_preview_options:{is_disabled:true},
    reply_markup:markup||{inline_keyboard:[]},
  });
  return {message_id:result.message_id,mode:'text'};
}

export function createScheduler({
  token,
  adminId,
  channelId,
  dryChannel,
  api,
  telegramForm,
  ensureUsername,
  notifyAdmin,
}){
  let timer=null;
  let ticking=false;

  function publishTarget(){
    const dry=String(dryChannel||'').trim();
    return dry||channelId;
  }

  async function withBotUser(file){
    const username=await ensureUsername();
    return loadPostFile(file,{botUsername:username});
  }

  /** Scan posts/*.md and enqueue future (unposted) items. */
  async function scheduleAll(){
    const queue=loadQueue();
    const now=Date.now();
    const username=await ensureUsername();
    const added=[];
    const warnings=[];
    for(const name of listPostFiles()){
      let post;
      try{
        post=loadPostFile(name,{botUsername:username});
      }catch(e){
        if(e.code==='NO_AT')continue;
        warnings.push(`${name}: ${e.message}`);
        continue;
      }
      if(post.atMs<=now)continue;
      const existing=queue.items.find(i=>i.file===post.file);
      if(existing?.posted)continue;
      if(post.imageMissing){
        warnings.push(`${post.file}: нет файла ${post.imageMissing} — уйдёт текстом без фото`);
      }
      if(post.captionTooLong){
        warnings.push(`${post.file}: текст ${post.body.length} > ${CAPTION_LIMIT} — уйдёт как sendMessage без фото`);
      }
      if(existing){
        existing.at=post.atMs;
        existing.atLabel=formatOmsk(post.atMs);
        existing.previewLine=post.previewLine;
        existing.captionTooLong=post.captionTooLong;
        existing.skipped=false;
        existing.skipReason=null;
      }else{
        queue.items.push({
          file:post.file,
          at:post.atMs,
          atLabel:formatOmsk(post.atMs),
          previewLine:post.previewLine,
          captionTooLong:post.captionTooLong,
          posted:false,
          message_id:null,
          skipped:false,
          skipReason:null,
        });
      }
      added.push(post);
    }
    queue.items.sort((a,b)=>a.at-b.at);
    saveQueue(queue);
    return {added,warnings,queue};
  }

  function pendingItems(queue=loadQueue()){
    return queue.items.filter(i=>!i.posted&&!i.skipped).sort((a,b)=>a.at-b.at);
  }

  function unschedule(fileName){
    const base=basename(String(fileName||''));
    const queue=loadQueue();
    const before=queue.items.length;
    queue.items=queue.items.filter(i=>!(i.file===base&&!i.posted));
    saveQueue(queue);
    return before!==queue.items.length;
  }

  /** Mark file posted so the timer will not publish it again. */
  function markPosted(fileName,{message_id=null,mode=null,target=null,atMs=null,previewLine=''}={}){
    const base=basename(String(fileName||''));
    if(!base)throw Object.assign(Error('Bad file'),{code:'BAD_FILE'});
    const queue=loadQueue();
    let item=queue.items.find(i=>i.file===base);
    if(!item){
      const at=atMs??Date.now();
      item={
        file:base,
        at,
        atLabel:formatOmsk(at),
        previewLine,
        captionTooLong:false,
        posted:false,
        message_id:null,
        skipped:false,
        skipReason:null,
      };
      queue.items.push(item);
    }
    item.posted=true;
    item.skipped=false;
    item.skipReason=null;
    item.message_id=message_id;
    item.postedAt=Date.now();
    item.mode=mode;
    item.target=target==null?null:String(target);
    if(previewLine)item.previewLine=previewLine;
    queue.items.sort((a,b)=>a.at-b.at);
    saveQueue(queue);
    return item;
  }

  function queueEntry(fileName){
    const base=basename(String(fileName||''));
    return loadQueue().items.find(i=>i.file===base)||null;
  }

  async function publishDue(now=Date.now()){
    const queue=loadQueue();
    const target=publishTarget();
    let changed=false;
    for(const item of queue.items){
      if(item.posted||item.skipped)continue;
      if(item.at>now)continue;
      const late=now-item.at;
      if(late>LATE_WINDOW_MS){
        item.skipped=true;
        item.skipReason=`просрочен более 6 ч (at ${item.atLabel||formatOmsk(item.at)})`;
        changed=true;
        const msg=`Пропуск ${item.file}: ${item.skipReason}`;
        console.error(msg);
        await notifyAdmin(msg).catch(()=>{});
        continue;
      }
      try{
        const post=await withBotUser(item.file);
        const result=await publishPost(api,telegramForm,token,{post,chatId:target});
        item.posted=true;
        item.message_id=result.message_id;
        item.postedAt=Date.now();
        item.mode=result.mode;
        item.target=String(target);
        changed=true;
        console.log(`Scheduled ${item.file} → ${target} msg ${result.message_id}`);
      }catch(e){
        const detail=e?.description||e?.message||String(e);
        const msg=`Ошибка публикации ${item.file}: ${detail}`;
        console.error(msg);
        await notifyAdmin(esc(msg)).catch(()=>{});
      }
    }
    if(changed)saveQueue(queue);
    return queue;
  }

  function start(){
    if(timer)return;
    const tick=async()=>{
      if(ticking)return;
      ticking=true;
      try{await publishDue()}
      catch(e){console.error('Schedule tick failed:',e?.message||e)}
      finally{ticking=false}
    };
    void tick();
    timer=setInterval(tick,TICK_MS);
    if(typeof timer.unref==='function')timer.unref();
  }

  function stop(){
    if(timer){clearInterval(timer);timer=null}
  }

  return {
    scheduleAll,
    pendingItems,
    unschedule,
    markPosted,
    queueEntry,
    publishDue,
    loadPost:withBotUser,
    publishPost:(post,chatId)=>publishPost(api,telegramForm,token,{post,chatId}),
    publishTarget,
    channelId,
    formatOmsk,
    CAPTION_LIMIT,
    start,
    stop,
    loadQueue,
  };
}
