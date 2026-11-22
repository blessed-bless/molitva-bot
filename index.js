import {createBot} from './bot.js';

const token=String(process.env.BOT_TOKEN||'').trim();
const adminId=Number(process.env.ADMIN_ID);
const channelId=String(process.env.CHANNEL_ID||'').trim();
const dryChannel=String(process.env.DRY_CHANNEL||'').trim();

if(!token||!token.includes(':')){
  console.error('Задай BOT_TOKEN в .env');
  process.exit(1);
}
if(!Number.isSafeInteger(adminId)||adminId<=0){
  console.error('Задай числовой ADMIN_ID в .env');
  process.exit(1);
}
if(!channelId){
  console.error('Задай CHANNEL_ID в .env (@channel или -100…)');
  process.exit(1);
}

const bot=createBot({token,adminId,channelId,dryChannel});

process.on('SIGINT',()=>{bot.stop();process.exit(0)});
process.on('SIGTERM',()=>{bot.stop();process.exit(0)});

bot.start().catch(e=>{
  console.error('Start failed:',e?.code?e.message:e);
  process.exit(1);
});
