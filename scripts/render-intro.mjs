// Рендер обложек в PNG 1280×720.
// node scripts/render-intro.mjs [intro|pricing]
// Нужен sharp: npm i -D sharp
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
const ASSETS=join(ROOT,'assets');
const FONTS=join(ASSETS,'fonts');
const name=(process.argv[2]||'intro').toLowerCase();
if(!['intro','pricing'].includes(name)){
  console.error('Usage: node scripts/render-intro.mjs [intro|pricing]');
  process.exit(1);
}

async function loadSharp(){
  try{
    return (await import('sharp')).default;
  }catch{
    const require=createRequire('C:/Users/newsl/Projects/portfolio/package.json');
    return require('sharp');
  }
}

function withEmbeddedFonts(svg){
  const unbounded=readFileSync(join(FONTS,'Unbounded-Bold.ttf')).toString('base64');
  const onest=readFileSync(join(FONTS,'Onest-Bold.ttf')).toString('base64');
  const css=`
@font-face{font-family:'Unbounded';src:url(data:font/ttf;base64,${unbounded}) format('truetype');font-weight:700;font-style:normal}
@font-face{font-family:'Onest';src:url(data:font/ttf;base64,${onest}) format('truetype');font-weight:700;font-style:normal}
`;
  const style=`<style type="text/css"><![CDATA[${css}]]></style>`;
  return svg.replace(/<style type="text\/css"><!\[CDATA\[[\s\S]*?\]\]><\/style>/,style);
}

const sharp=await loadSharp();
const out=join(ASSETS,`${name}.png`);
const photo=join(ASSETS,`${name}-source.jpg`);
const svgPath=join(ASSETS,`${name}.svg`);

let png;
if(existsSync(photo)){
  png=await sharp(photo).resize(1280,720,{fit:'cover'}).png().toBuffer();
  console.log(`Source: ${name}-source.jpg`);
}else if(existsSync(svgPath)){
  const svg=withEmbeddedFonts(readFileSync(svgPath,'utf8'));
  png=await sharp(Buffer.from(svg)).resize(1280,720,{fit:'fill'}).png().toBuffer();
  console.log(`Source: ${name}.svg`);
}else{
  console.error(`Нет assets/${name}-source.jpg и assets/${name}.svg`);
  process.exit(1);
}

writeFileSync(out,png);
console.log(`Wrote ${out} (${png.length} bytes)`);
console.log(pathToFileURL(out).href);
