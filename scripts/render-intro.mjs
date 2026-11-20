// intro-source.jpg (или intro.svg) → assets/intro.png 1280×720. Нужен sharp: npm i -D sharp
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
const ASSETS=join(ROOT,'assets');
const FONTS=join(ASSETS,'fonts');
const OUT=join(ASSETS,'intro.png');
const PHOTO=join(ASSETS,'intro-source.jpg');
const SVG=join(ASSETS,'intro.svg');

let sharp;
try{
  sharp=(await import('sharp')).default;
}catch{
  console.error('Нужен sharp. Разреши добавить: npm i -D sharp');
  process.exit(1);
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

let png;
if(existsSync(PHOTO)){
  png=await sharp(PHOTO).resize(1280,720,{fit:'cover'}).png().toBuffer();
  console.log('Source: intro-source.jpg');
}else if(existsSync(SVG)){
  const svg=withEmbeddedFonts(readFileSync(SVG,'utf8'));
  png=await sharp(Buffer.from(svg)).resize(1280,720,{fit:'fill'}).png().toBuffer();
  console.log('Source: intro.svg');
}else{
  console.error('Нет assets/intro-source.jpg и assets/intro.svg');
  process.exit(1);
}

writeFileSync(OUT,png);
console.log(`Wrote ${OUT} (${png.length} bytes)`);
console.log(pathToFileURL(OUT).href);
