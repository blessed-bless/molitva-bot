import assert from 'node:assert/strict';
import test from 'node:test';
import {optionLabel,quoteFor,quizSteps} from '../config.js';
import {createBot} from '../bot.js';

test('quoteFor formats normal and urgent forks',()=>{
  const normal=quoteFor({need:'site',timing:'month'});
  assert.equal(normal.min,30000);
  assert.equal(normal.max,70000);
  assert.equal(normal.urgent,false);
  assert.match(normal.line,/от 30 000 ₽, обычно 30 000–70 000 ₽, срок 2–4 недели\./);
  assert.match(normal.hosting,/YCLIENTS/);

  const urgent=quoteFor({need:'site',timing:'asap'});
  assert.equal(urgent.min,39000);
  assert.equal(urgent.max,91000);
  assert.match(urgent.line,/от 39 000 ₽, обычно 39 000–91 000 ₽, срок 2 недели \(срочность \+30%\)\./);
});

test('quoteFor covers all four needs',()=>{
  const cases=[
    ['bot',25000,50000,'1–3 недели',33000,65000,'1 неделя'],
    ['booking',50000,90000,'2–4 недели',65000,117000,'2 недели'],
    ['auto',20000,50000,'1–3 недели',26000,65000,'1 неделя'],
  ];
  for(const [need,min,max,term,umin,umax,uterm] of cases){
    const n=quoteFor({need,timing:'later'});
    assert.equal(n.min,min);
    assert.equal(n.max,max);
    assert.match(n.line,new RegExp(term.replace(/[–]/g,'\\$&')));
    const u=quoteFor({need,timing:'asap'});
    assert.equal(u.min,umin);
    assert.equal(u.max,umax);
    assert.match(u.line,new RegExp(uterm));
  }
});

test('optionLabel resolves Russian labels',()=>{
  assert.equal(optionLabel('need','booking'),'Онлайн-запись');
  assert.equal(optionLabel('niche','barber'),'Барбершоп / салон');
  assert.equal(optionLabel('crm','no'),'Нет');
});

test('quiz has four steps',()=>{
  assert.equal(quizSteps.length,4);
  assert.deepEqual(quizSteps.map(s=>s.key),['need','niche','crm','timing']);
});

function mockBot(){
  const calls=[];
  const original=globalThis.fetch;
  globalThis.fetch=async(_url,opts)=>{
    const body=JSON.parse(opts.body);
    const method=String(_url).split('/').pop();
    calls.push({method,body});
    if(method==='getMe')return Response.json({ok:true,result:{id:1,is_bot:true,username:'molitva_test_bot'}});
    if(method==='answerCallbackQuery')return Response.json({ok:true,result:true});
    if(method==='sendMessage'||method==='editMessageText'){
      return Response.json({ok:true,result:{message_id:body.message_id||10,chat:{id:body.chat_id}}});
    }
    if(method==='setMyCommands')return Response.json({ok:true,result:true});
    return Response.json({ok:false,error_code:400,description:`unexpected ${method}`});
  };
  const bot=createBot({token:'1:test',adminId:42,channelId:'@test_channel'});
  return {
    bot,
    calls,
    restore(){globalThis.fetch=original},
  };
}

test('/start shows menu with five actions',async()=>{
  const {bot,calls,restore}=mockBot();
  try{
    await bot.handle({
      update_id:1,
      message:{
        message_id:1,
        chat:{id:7,type:'private'},
        from:{id:7,username:'guest'},
        text:'/start',
      },
    });
    const sent=calls.find(c=>c.method==='sendMessage');
    assert.ok(sent);
    assert.match(sent.body.text,/Привет/);
    const rows=sent.body.reply_markup.inline_keyboard.flat();
    assert.ok(rows.some(b=>b.text==='Портфолио'&&b.url));
    assert.ok(rows.some(b=>b.text==='Оценить проект'&&b.callback_data==='quiz:start'));
    assert.ok(rows.some(b=>b.text==='Канал'));
  }finally{restore()}
});

test('/start quiz jumps into first step',async()=>{
  const {bot,calls,restore}=mockBot();
  try{
    await bot.handle({
      update_id:2,
      message:{
        message_id:2,
        chat:{id:7,type:'private'},
        from:{id:7},
        text:'/start quiz',
      },
    });
    const sent=calls.find(c=>c.method==='sendMessage');
    assert.equal(sent.body.text,quizSteps[0].ask);
    assert.ok(bot.sessions.has(7));
  }finally{restore()}
});

test('quiz answers end with quote and send lead to admin',async()=>{
  const {bot,calls,restore}=mockBot();
  try{
    const user={id:7,username:'guest',first_name:'Гость'};
    const chat={id:7,type:'private'};
    await bot.handle({update_id:3,callback_query:{
      id:'c1',from:user,message:{message_id:9,chat},data:'quiz:start',
    }});
    const path=[
      ['need','site'],
      ['niche','services'],
      ['crm','yes'],
      ['timing','asap'],
    ];
    for(const [key,value] of path){
      await bot.handle({update_id:4,callback_query:{
        id:'c2',from:user,message:{message_id:9,chat},data:`quiz:${key}:${value}`,
      }});
    }
    const result=calls.filter(c=>c.method==='editMessageText').at(-1);
    assert.match(result.body.text,/Ориентир/);
    assert.ok(result.body.reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='quiz:send'));

    await bot.handle({update_id:5,callback_query:{
      id:'c3',from:user,message:{message_id:9,chat},data:'quiz:send',
    }});
    const lead=calls.find(c=>c.method==='sendMessage'&&c.body.chat_id===42);
    assert.ok(lead);
    assert.match(lead.body.text,/@guest/);
    assert.match(lead.body.text,/Сайт/);
    assert.equal(bot.sessions.has(7),false);
  }finally{restore()}
});

test('/post is admin-only and publishes navigator',async()=>{
  const {bot,calls,restore}=mockBot();
  try{
    await bot.handle({
      update_id:6,
      message:{
        message_id:3,
        chat:{id:7,type:'private'},
        from:{id:7},
        text:'/post',
      },
    });
    assert.match(calls.at(-1).body.text,/только для админа/);

    await bot.handle({
      update_id:7,
      message:{
        message_id:4,
        chat:{id:42,type:'private'},
        from:{id:42,username:'admin'},
        text:'/post',
      },
    });
    const channel=calls.find(c=>c.method==='sendMessage'&&c.body.chat_id==='@test_channel');
    assert.ok(channel);
    assert.equal(channel.body.parse_mode,'HTML');
    assert.match(channel.body.text,/Molitva Deploy/);
    const buttons=channel.body.reply_markup.inline_keyboard.flat();
    assert.ok(buttons.some(b=>b.text==='Оценить проект'&&/start=quiz/.test(b.url)));
    assert.ok(buttons.some(b=>b.text==='GitHub'));
  }finally{restore()}
});

test('unknown updates do not throw',async()=>{
  const {bot,restore}=mockBot();
  try{
    await assert.doesNotReject(()=>bot.handle({update_id:9}));
    await assert.doesNotReject(()=>bot.handle({
      update_id:10,
      message:{message_id:1,chat:{id:1,type:'group'},from:{id:1},text:'hi'},
    }));
  }finally{restore()}
});
