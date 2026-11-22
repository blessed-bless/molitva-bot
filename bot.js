import {readFileSync} from 'node:fs';
import {basename,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {links,optionLabel,quizSteps,quoteFor} from './config.js';
import {createScheduler} from './schedule.js';

const ROOT=dirname(fileURLToPath(import.meta.url));
const CAPTION_LIMIT=1024;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

export async function telegram(token,method,payload={},attempt=0){
  const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(35000),
  });
  const data=await response.json().catch(()=>({}));
  if(data.ok)return data.result;
  const wait=Number(data.parameters?.retry_after);
  if(data.error_code===429&&attempt<2&&wait>0&&wait<=10){
    await sleep(wait*1000);
    return telegram(token,method,payload,attempt+1);
  }
  throw Object.assign(Error(`Telegram ${method}: ${data.error_code||response.status}`),{
    code:data.error_code||response.status,
    description:String(data.description||''),
  });
}

async function telegramForm(token,method,form,attempt=0){
  const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{
    method:'POST',
    body:form,
    signal:AbortSignal.timeout(60000),
  });
  const data=await response.json().catch(()=>({}));
  if(data.ok)return data.result;
  const wait=Number(data.parameters?.retry_after);
  if(data.error_code===429&&attempt<2&&wait>0&&wait<=10){
    await sleep(wait*1000);
    return telegramForm(token,method,form,attempt+1);
  }
  throw Object.assign(Error(`Telegram ${method}: ${data.error_code||response.status}`),{
    code:data.error_code||response.status,
    description:String(data.description||''),
  });
}

function menuKeyboard(){
  return {inline_keyboard:[
    [{text:'Портфолио',url:links.portfolio},{text:'Кейсы',url:links.cases}],
    [{text:'Оценить проект',callback_data:'quiz:start'}],
    [{text:'Канал',url:links.channel},{text:'Написать',url:links.write}],
  ]};
}

function quizKeyboard(step){
  const rows=[];
  for(let i=0;i<step.options.length;i+=2){
    const chunk=step.options.slice(i,i+2).map(([id,label])=>({
      text:label,
      callback_data:`quiz:${step.key}:${id}`,
    }));
    rows.push(chunk);
  }
  return {inline_keyboard:rows};
}

function resultKeyboard(){
  return {inline_keyboard:[[{text:'Отправить заявку',callback_data:'quiz:send'}]]};
}

function navigatorKeyboard(botUsername){
  return {inline_keyboard:[
    [{text:'Портфолио',url:links.portfolio},{text:'Смена',url:links.smena}],
    [{text:'Оценить проект',url:`https://t.me/${botUsername}?start=quiz`}],
    [{text:'Написать',url:links.write},{text:'GitHub',url:links.github}],
  ]};
}

function introKeyboard(botUsername){
  return {inline_keyboard:[
    [
      {text:'🌐 Портфолио',url:links.portfolio},
      {text:'📅 Смена',url:links.smena},
    ],
    [
      {text:'🧮 Оценить проект',url:`https://t.me/${botUsername}?start=quiz`},
      {text:'💬 Написать',url:links.write},
    ],
  ]};
}

function pricingKeyboard(botUsername){
  return {inline_keyboard:[[
    {text:'🧮 Оценить проект',url:`https://t.me/${botUsername}?start=quiz`},
    {text:'💬 Написать',url:links.write},
  ]]};
}

function greeting(){
  return 'Привет. Сайты, боты, запись и автоматизация — коротко по делу.\nВыбери, куда дальше:';
}

function resultText(answers){
  const q=quoteFor(answers);
  return [
    '<b>Ориентир по ответам</b>',
    '',
    `Нужно: ${esc(optionLabel('need',answers.need))}`,
    `Ниша: ${esc(optionLabel('niche',answers.niche))}`,
    `Сайт/CRM: ${esc(optionLabel('crm',answers.crm))}`,
    `Сроки: ${esc(optionLabel('timing',answers.timing))}`,
    '',
    esc(q.line),
    esc(q.hosting),
  ].join('\n');
}

function leadText(user,answers){
  const q=quoteFor(answers);
  const who=user.username?`@${user.username}`:esc(user.first_name||'без имени');
  return [
    '<b>Новая заявка</b>',
    `${who} · <code>${user.id}</code>`,
    '',
    `Нужно: ${esc(optionLabel('need',answers.need))}`,
    `Ниша: ${esc(optionLabel('niche',answers.niche))}`,
    `Сайт/CRM: ${esc(optionLabel('crm',answers.crm))}`,
    `Сроки: ${esc(optionLabel('timing',answers.timing))}`,
    '',
    esc(q.line),
    esc(q.hosting),
  ].join('\n');
}

function loadNavigator(){
  return readFileSync(join(ROOT,'posts','navigator.md'),'utf8').trim();
}

function loadCaption(name){
  const caption=readFileSync(join(ROOT,'posts',`${name}.md`),'utf8').trim();
  if(caption.length>CAPTION_LIMIT){
    throw Object.assign(Error(`${name} caption ${caption.length} > ${CAPTION_LIMIT}`),{code:'CAPTION_TOO_LONG'});
  }
  return caption;
}

function loadPhoto(name){
  return readFileSync(join(ROOT,'assets',`${name}.png`));
}

export function createBot({token,adminId,channelId,dryChannel=''}){
  const sessions=new Map();
  let botUsername='';
  let stopped=false;
  let pollError='';
  const abort=new AbortController();

  const api=(method,payload)=>telegram(token,method,payload);
  const msg=(chatId,text,keyboard)=>({
    chat_id:chatId,
    text,
    parse_mode:'HTML',
    link_preview_options:{is_disabled:true},
    reply_markup:keyboard,
  });
  const send=(chatId,text,keyboard)=>api('sendMessage',msg(chatId,text,keyboard));
  const notifyAdmin=text=>send(adminId,text,{inline_keyboard:[]});

  const scheduler=createScheduler({
    token,
    adminId,
    channelId,
    dryChannel,
    api,
    telegramForm,
    ensureUsername:()=>ensureUsername(),
    notifyAdmin,
  });

  async function editOrSend(chatId,messageId,text,keyboard){
    if(messageId){
      try{
        await api('editMessageText',{...msg(chatId,text,keyboard),message_id:messageId});
        return;
      }catch(e){
        if(/not modified/i.test(e.description||''))return;
      }
    }
    await send(chatId,text,keyboard);
  }

  function beginQuiz(userId){
    sessions.set(userId,{step:0,answers:{}});
    const first=quizSteps[0];
    return {text:first.ask,keyboard:quizKeyboard(first)};
  }

  async function showMenu(chatId){
    await send(chatId,greeting(),menuKeyboard());
  }

  async function advanceQuiz(ctx,stepKey,value){
    const state=sessions.get(ctx.userId);
    if(!state){
      const started=beginQuiz(ctx.userId);
      await editOrSend(ctx.chatId,ctx.messageId,started.text,started.keyboard);
      return;
    }
    const expected=quizSteps[state.step];
    if(!expected||expected.key!==stepKey)return;
    if(!expected.options.some(([id])=>id===value))return;

    state.answers[stepKey]=value;
    state.step+=1;

    if(state.step>=quizSteps.length){
      await editOrSend(ctx.chatId,ctx.messageId,resultText(state.answers),resultKeyboard());
      return;
    }
    const next=quizSteps[state.step];
    await editOrSend(ctx.chatId,ctx.messageId,next.ask,quizKeyboard(next));
  }

  async function submitLead(ctx,user){
    const state=sessions.get(ctx.userId);
    if(!state||Object.keys(state.answers).length<quizSteps.length){
      await editOrSend(ctx.chatId,ctx.messageId,'Сначала пройди оценку — четыре коротких вопроса.');
      return;
    }
    sessions.delete(ctx.userId);
    try{
      await send(adminId,leadText(user,state.answers),{inline_keyboard:[]});
    }catch(e){
      console.error('Lead notify failed:',e?.code?e.message:e?.name||'error');
      await editOrSend(ctx.chatId,ctx.messageId,'Не удалось отправить заявку. Напиши напрямую: '+links.write);
      return;
    }
    await editOrSend(
      ctx.chatId,
      ctx.messageId,
      'Заявку отправил. Отвечу в личку, обычно в тот же день.\nПока можно глянуть кейсы или канал — /start',
      {inline_keyboard:[]},
    );
  }

  async function ensureUsername(){
    if(botUsername)return botUsername;
    const me=await api('getMe');
    botUsername=me.username;
    return botUsername;
  }

  async function publishNavigator(chatId){
    const username=await ensureUsername();
    const text=loadNavigator();
    await api('sendMessage',{
      chat_id:channelId,
      text,
      parse_mode:'HTML',
      link_preview_options:{is_disabled:true},
      reply_markup:navigatorKeyboard(username),
    });
    await send(chatId,'Пост ушёл в канал.',{inline_keyboard:[]});
  }

  async function sendNamedPhoto(targetChatId,name,keyboard){
    const form=new FormData();
    form.append('chat_id',String(targetChatId));
    form.append('caption',loadCaption(name));
    form.append('parse_mode','HTML');
    form.append('reply_markup',JSON.stringify(keyboard));
    form.append('photo',new Blob([loadPhoto(name)],{type:'image/png'}),`${name}.png`);
    return telegramForm(token,'sendPhoto',form);
  }

  async function publishPhotoPost(chatId,{name,preview,keyboard,label}){
    const target=preview?adminId:channelId;
    await sendNamedPhoto(target,name,keyboard);
    if(preview){
      await send(chatId,`Превью ${label} ушло тебе в личку. В канал — /${name==='intro'?'intro':'post2'} без аргументов.`,{inline_keyboard:[]});
      return;
    }
    await send(chatId,`${label} ушёл в канал.`,{inline_keyboard:[]});
  }

  async function handle(update){
    const callback=update.callback_query;
    const incoming=update.message||callback?.message;
    const user=callback?.from||incoming?.from;
    if(!user)return;

    if(callback){
      await api('answerCallbackQuery',{callback_query_id:callback.id}).catch(()=>{});
      const data=String(callback.data||'');
      const chatId=incoming?.chat?.id;
      if(!chatId||incoming.chat.type!=='private')return;
      const ctx={userId:user.id,chatId,messageId:incoming.message_id};

      if(data==='quiz:start'){
        const started=beginQuiz(user.id);
        await editOrSend(chatId,incoming.message_id,started.text,started.keyboard);
        return;
      }
      if(data==='quiz:send'){
        await submitLead(ctx,user);
        return;
      }
      const match=/^quiz:([a-z]+):([a-z0-9_]+)$/.exec(data);
      if(match){
        await advanceQuiz(ctx,match[1],match[2]);
        return;
      }
      return;
    }

    if(!incoming||incoming.chat?.type!=='private')return;
    const text=String(incoming.text||'').trim();
    if(!text)return;

    const [rawCmd='',payload='']=text.split(/\s+/,2);
    const cmd=rawCmd.split('@')[0].toLowerCase();

    if(cmd==='/start'){
      if(payload==='quiz'){
        const started=beginQuiz(user.id);
        await send(incoming.chat.id,started.text,started.keyboard);
        return;
      }
      await showMenu(incoming.chat.id);
      return;
    }

    if(cmd==='/post'){
      if(user.id!==adminId){
        await send(incoming.chat.id,'Эта команда только для админа.',{inline_keyboard:[]});
        return;
      }
      await publishNavigator(incoming.chat.id);
      return;
    }

    if(cmd==='/intro'||cmd==='/post2'){
      if(user.id!==adminId){
        await send(incoming.chat.id,'Эта команда только для админа.',{inline_keyboard:[]});
        return;
      }
      const preview=payload.toLowerCase()==='preview';
      if(payload&&!preview){
        await send(incoming.chat.id,`Использование: ${cmd} preview или ${cmd}`,{inline_keyboard:[]});
        return;
      }
      const username=await ensureUsername();
      if(cmd==='/intro'){
        await publishPhotoPost(incoming.chat.id,{
          name:'intro',
          preview,
          keyboard:introKeyboard(username),
          label:'Intro',
        });
        return;
      }
      await publishPhotoPost(incoming.chat.id,{
        name:'pricing',
        preview,
        keyboard:pricingKeyboard(username),
        label:'Пост про цены',
      });
      return;
    }

    if(cmd==='/schedule'||cmd==='/queue'||cmd==='/unschedule'||cmd==='/preview'){
      if(user.id!==adminId){
        await send(incoming.chat.id,'Эта команда только для админа.',{inline_keyboard:[]});
        return;
      }
      await handleScheduleCmd(cmd,payload,incoming.chat.id);
      return;
    }
  }

  async function handleScheduleCmd(cmd,payload,chatId){
    if(cmd==='/schedule'){
      const {added,warnings,queue}=await scheduler.scheduleAll();
      const pending=scheduler.pendingItems(queue);
      const lines=[
        `<b>Очередь обновлена</b>`,
        `В очереди: ${pending.length}`,
        dryChannel?`DRY → ${esc(String(dryChannel))}`:`Цель: ${esc(String(channelId))}`,
      ];
      if(added.length){
        lines.push('',...added.map(p=>`• ${esc(p.file)} — ${esc(p.atRaw)}`));
      }else{
        lines.push('','Новых будущих постов нет.');
      }
      if(warnings.length){
        lines.push('', '<b>Предупреждения</b>', ...warnings.map(w=>`• ${esc(w)}`));
      }
      await send(chatId,lines.join('\n'),{inline_keyboard:[]});
      return;
    }

    if(cmd==='/queue'){
      const pending=scheduler.pendingItems();
      if(!pending.length){
        await send(chatId,'Очередь пуста. /schedule — собрать из posts/*.md',{inline_keyboard:[]});
        return;
      }
      const lines=[
        `<b>Очередь (${pending.length})</b>`,
        dryChannel?`DRY → ${esc(String(dryChannel))}`:'',
        '',
        ...pending.map(i=>`• <code>${esc(i.file)}</code>\n  ${esc(i.atLabel||scheduler.formatOmsk(i.at))}\n  ${esc(i.previewLine||'')}`),
      ].filter(Boolean);
      await send(chatId,lines.join('\n'),{inline_keyboard:[]});
      return;
    }

    if(cmd==='/unschedule'){
      const file=basename(String(payload||'').trim());
      if(!file){
        await send(chatId,'Использование: /unschedule 03-gran.md',{inline_keyboard:[]});
        return;
      }
      const ok=scheduler.unschedule(file);
      await send(chatId,ok?`Снял с очереди: ${file}`:`В очереди нет незапощенного ${file}`,{inline_keyboard:[]});
      return;
    }

    if(cmd==='/preview'){
      const file=basename(String(payload||'').trim());
      if(!file){
        await send(chatId,'Использование: /preview 03-gran.md',{inline_keyboard:[]});
        return;
      }
      try{
        const post=await scheduler.loadPost(file);
        const notes=[];
        if(post.imageMissing)notes.push(`нет файла ${post.imageMissing} — текстом`);
        if(post.captionTooLong)notes.push(`текст ${post.body.length} > ${scheduler.CAPTION_LIMIT} — без фото`);
        const result=await scheduler.publishPost(post,adminId);
        const extra=notes.length?` (${notes.join('; ')})`:'';
        await send(chatId,`Превью ${file} → тебе (${result.mode})${extra}`,{inline_keyboard:[]});
      }catch(e){
        const detail=e?.description||e?.message||String(e);
        await send(chatId,`Превью не вышло: ${esc(detail)}`,{inline_keyboard:[]});
      }
    }
  }

  async function configure(){
    const me=await api('getMe');
    botUsername=me.username;
    await api('setMyCommands',{commands:[
      {command:'start',description:'Меню и оценка проекта'},
      {command:'post',description:'Пост-проводник в канал (админ)'},
      {command:'intro',description:'Первый пост с картинкой (админ)'},
      {command:'post2',description:'Пост про цены (админ)'},
      {command:'schedule',description:'Собрать очередь из posts/*.md (админ)'},
      {command:'queue',description:'Показать очередь (админ)'},
      {command:'unschedule',description:'Снять пост с очереди (админ)'},
      {command:'preview',description:'Превью поста из файла (админ)'},
    ]});
    return me;
  }

  function pause(){
    return new Promise(resolve=>{
      const done=()=>{clearTimeout(timer);abort.signal.removeEventListener('abort',done);resolve()};
      const timer=setTimeout(done,5000);
      abort.signal.addEventListener('abort',done,{once:true});
    });
  }

  async function poll(){
    let offset=0;
    while(!stopped){
      try{
        const updates=await api('getUpdates',{
          offset,
          timeout:25,
          allowed_updates:['message','callback_query'],
        });
        pollError='';
        for(const update of updates){
          try{await handle(update)}
          catch(e){console.error('Update failed:',e?.code?e.message:e?.name||'error')}
          offset=update.update_id+1;
        }
      }catch(e){
        if(stopped)break;
        const reason=e?.code===409?'another process is polling this bot token'
          :e?.code===401?'bot token rejected'
          :e?.code?e.message
          :'network error';
        if(reason!==pollError){pollError=reason;console.error('Polling paused:',reason)}
        await pause();
      }
    }
  }

  return {
    sessions,
    handle,
    beginQuiz,
    scheduler,
    async start(){
      const me=await configure();
      scheduler.start();
      const dry=String(dryChannel||'').trim();
      console.log(`Bot @${me.username} online`);
      if(dry)console.log(`Schedule DRY → ${dry}`);
      poll();
      return me;
    },
    stop(){stopped=true;scheduler.stop();abort.abort()},
  };
}
