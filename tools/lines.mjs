// 把各處的台詞整理成一份給人讀的文件 docs/NPC台詞整理.md：改了台詞跑一次。
//   node tools/lines.mjs
// 台詞都放在資料檔，不跟邏輯混（檔名 *-lines.js，或資料本來就在那個檔）；新的 NPC 台詞也寫成資料檔，在下面 SOURCES 登記一筆就會進文件。
// 填空：{f} 點心、{t} 畫名、{m} 媒材、{y} 年份、{p} 標價、{o} 從哪裡來、{e} 路上的事、{n} 下一站；{S} 已售出、{R} 已預訂、{A} 還買得到時才會選那句
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installDom, ROOT } from './zone-env.mjs';

installDom();

// 每一筆：title 文件裡的標題、file 資料檔、note 什麼時候說（給人看的）、keys 要列哪幾個匯出，和每個的說明
const SOURCES = [
  { title: '畫廊・前廳的胖頭頭人、陽台長桌的主人', file: 'js/npc/manatee-lines.js', note: '站著不走，玩家走近才說話（npc/manatee.js）。名字在 npc/names.js',
    keys: { GREETINGS: '走近時', TABLE_LINES: '長桌主人請人吃東西', SURPRISED: '被嚇到', NO_PHOTO: '鏡頭剛對上他時（同一個鏡頭一陣子內不重複）' } },
  { title: '畫廊・大樹的樹洞', file: 'js/zones/gallery/hollow-lines.js', note: '人走近就從洞口叫一聲，每次換一種語氣；投了紙條應一聲（zones/gallery/hollow.js）',
    keys: { CALLS: '叫人過來：先照 w 抽一類（多國話、動物叫法、沒有字的聲音、古裝腔），再從那一類抽一句，不跟上一句一樣', GOT: '收到紙條' } },
  { title: '畫廊・搭船來的訪客', file: 'js/npc/visitor-lines.js',
    note: '觸發位置對照 npc/visitors.js。抽取順序：熟客 → 職業 → 種族自己的先出，共用的混在後面；同一趟不重複，同一船的人不會說同一句。船上的話快靠岸時、全員上船要開走時輪流講，一句隔 4.5 秒，一個人來的就自言自語',
    keys: {
      LINES: '共用，照正在做的事：land 下船、walk／walkOut 走路、hello～plan 跟胖頭聊的話題、eat 吃點心、view 看畫、bench 坐長椅、mirror 照鏡子、leave 上船、greet 玩家走近、dog 小狗跑來、sunset／cow／owl／marmot／pavilion 草原上、fish 釣魚、sketch 速寫、play 彈琴、talk／talk○○ 玩家按「聊天」',
      HOST: '胖頭回話，照話題；story 是回熟客的連載', VOICES: '各種族自己的', ROLE_LINES: '各職業自己的', BOAT: '船上：arrive 靠岸前、leave 開走時，Solo 是一個人來的',
      REGULARS: '熟客：每隔一陣子來一次，每次講下一章', ORIGINS: '{o} 從哪裡來', EVENTS: '{e} 路上的事', NEXTS: '{n} 下一站',
    } },
  { title: '海市・攤販', file: 'js/npc/vendor-lines.js', note: '照攤位的 id（npc/vendors.js 的 VENDORS）：greet 走近、lines 按「聊天」輪著講、quiet 街上冷清時（晚上最冷清）；暗房 handover 交照片、報社 unsigned 退畫廊的眼睛拍的、printed 照版面（角落、半版、頭版、號外）',
    keys: { VENDOR_LINES: '' } },
  { title: '海市・星潮報', file: 'js/save/press.js', note: '報社印出來的報紙（save/press.js）：標題和副標照奇物和版面抽，旁邊填小新聞和廣告',
    keys: { HEADS: '標題', SUBS: '副標', NEWS: '小新聞', ADS: '廣告（店名、賣什麼）' } },
];

const esc = (s) => String(s).replace(/\|/g, '\|');
function render(v, depth, out) {
  if (typeof v === 'string') out.push(`- ${esc(v)}`);
  else if (typeof v === 'number' || typeof v === 'boolean' || v == null) out.push(`- ${v}`);
  else if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'string')) for (const s of v) out.push(`- ${esc(s)}`);
    else if (v.every((x) => Array.isArray(x) && x.every((y) => typeof y === 'string'))) for (const d of v) out.push(`- ${d.map(esc).join(' → ')}`);
    else v.forEach((x, i) => {
      if (x && typeof x === 'object' && !Array.isArray(x) && (x.name || x.id)) out.push('', `${'#'.repeat(Math.min(6, depth))} ${x.name || x.id}${x.kind ? `（${x.kind}${x.role ? '・' + x.role : ''}）` : ''}`, '');
      else if (x && typeof x === 'object' && !Array.isArray(x) && 'w' in x && Array.isArray(x.lines)) { out.push(`- 權重 ${x.w}：${x.lines.map(esc).join('｜')}`); return; }
      else out.push('', `${'#'.repeat(Math.min(6, depth))} ${i + 1}`, '');
      render(x, depth + 1, out);
    });
  } else if (typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (k === 'name' || k === 'id' || k === 'kind' || k === 'role') continue;
      if (typeof x === 'string') { out.push(`- ${k}：${esc(x)}`); continue; }
      out.push('', `${'#'.repeat(Math.min(6, depth))} ${k}`, '');
      render(x, depth + 1, out);
    }
  }
}

const out = ['# NPC 台詞整理（依地區）', '', '由 `node tools/lines.mjs` 從各台詞資料檔整理出來，不要手改這份；改台詞改資料檔。', '',
  '填空：{f} 點心（麵包／蘋果／起司）、{t} 畫名、{m} 媒材、{y} 年份、{p} 標價、{o} 從哪裡來、{e} 路上的事、{n} 下一站。{S} 已售出、{R} 已預訂、{A} 還買得到時才會選那句。', ''];
let n = 0;
for (const src of SOURCES) {
  let mod;
  try { mod = await import(pathToFileURL(path.join(ROOT, src.file)).href); } catch (e) { console.log(`✗ ${src.file} 讀不進來：${e.message}`); continue; }
  out.push('', `## ${src.title}`, '', `資料：\`${src.file}\`${src.note ? `。${src.note}` : ''}`, '');
  for (const [key, note] of Object.entries(src.keys)) {
    if (!(key in mod)) { console.log(`  ✗ ${src.file} 沒有匯出 ${key}`); continue; }
    out.push('', `### ${key}${note ? `　${note}` : ''}`, '');
    const before = out.length;
    render(mod[key], 4, out);
    n += out.slice(before).filter((l) => l.startsWith('- ')).length;
  }
}
const file = path.join(ROOT, 'docs/NPC台詞整理.md');
fs.writeFileSync(file, out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n');
console.log(`寫好 docs/NPC台詞整理.md（${n} 條）`);
