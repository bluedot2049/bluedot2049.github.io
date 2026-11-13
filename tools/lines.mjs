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
    keys: { GREETINGS: '走近時', TABLE_LINES: '長桌主人請人吃東西', SURPRISED: '被嚇到', NO_PHOTO: '鏡頭剛對上他時（同一個鏡頭一陣子內不重複）',
      NEXT: '前廳那位走近時說下一步：mirror 還沒照鏡子、camera 還沒拿相機、out 還沒走出後門、back 從別區回來（zones/gallery/ask.js）',
      DONE: '在前廳做完一步', ASK: '按「問」的題目：q 玩家問的、a 他回的；need 做過那件事才出現、carry 帶著相機時換的回答', AFTER_SHOT: '叫你拍他、照片收進去以後' } },
  { title: '畫廊・大樹的樹洞', file: 'js/zones/gallery/hollow-lines.js', note: '人走近就從洞口叫一聲，每次換一種語氣；投了紙條應一聲（zones/gallery/hollow.js）',
    keys: { CALLS: '叫人過來：先照 w 抽一類（多國話、動物叫法、沒有字的聲音、古裝腔），再從那一類抽一句，不跟上一句一樣', GOT: '收到紙條' } },
  { title: '畫廊・地下室會說話的畫', file: 'js/zones/gallery/cellar-lines.js', note: '正對樓梯那幅（zones/gallery/cellar-voice.js）。「我：」開頭的是玩家回的，冒在玩家頭上',
    keys: { CALLS: '走進地下室的方廳時叫一聲', TALKS: '按「聊天」照順序一段一段講', AFTER: '講完以後每按一次抽一句，不跟上一句一樣' } },
  { title: '畫廊・搭船來的訪客', file: 'js/npc/visitor-lines.js',
    note: '觸發位置對照 npc/visitors.js。抽取順序：熟客 → 職業 → 種族自己的先出，共用的混在後面；同一趟不重複，同一船的人不會說同一句。船上的話快靠岸時、全員上船要開走時輪流講，一句隔 4.5 秒，一個人來的就自言自語',
    keys: {
      LINES: '共用，照正在做的事：land 下船、walk／walkOut 走路、hello～plan 跟胖頭聊的話題、eat 吃點心、view 看畫、bench 坐長椅、mirror 照鏡子、leave 上船、greet 玩家走近、dog 小狗跑來、sunset／cow／owl／marmot／pavilion 草原上、fish 釣魚、sketch 速寫、play 彈琴、talk／talk○○ 玩家按「聊天」',
      HOST: '胖頭回話，照話題；story 是回熟客的連載', VOICES: '各種族自己的', ROLE_LINES: '各職業自己的', BOAT: '船上：arrive 靠岸前、leave 開走時，Solo 是一個人來的',
      REGULARS: '熟客：每隔一陣子來一次，每次講下一章', ORIGINS: '{o} 從哪裡來', EVENTS: '{e} 路上的事', NEXTS: '{n} 下一站',
    } },
  { title: '靜海・相機店「灰球朋友旗艦店」', file: 'js/zones/jinghai/jinghai-shop-lines.js', note: '商店街北排西頭（zones/jinghai/jinghai-camshop.js），按互動鍵冒提示（jinghai-film.js）',
    keys: { CLERK: '沖印櫃台的店員：talk 按「聊天」輪著講；handover 領件時照這批最搶眼的那張說（疊影＞色偏＞漂亮＞普通，camera/minilab.js）', FILM: '底片牆', LOOKS: '展示品按「看看」' } },
  { title: '黑森林・谷底營火邊的冒險者', file: 'js/zones/heilin/heilin-lines.js', note: '工坊門前坐著等鐘錶匠的矮人戰士、精靈弓箭手、法師（zones/heilin/heilin-camp.js，坐法共用 npc/firecircle.js）',
    keys: { CAMP_LINES: 'greet 走近營火時三人挑一個講、lines 按「聊天」輪著講', CAMP_BANTER: '按「聊天」偶爾整段插嘴，一人一句隔兩秒多' } },
  { title: '古城・座堂門口火盆邊的獵人、大法師科技的店員', file: 'js/zones/gucheng/gucheng-lines.js', note: '西門南邊火盆旁坐著的會吹的獵人、老獵人、見習修士（zones/gucheng/gucheng-hunters.js，坐法共用 npc/firecircle.js）',
    keys: { HUNTER_LINES: 'greet 走近火盆時三人挑一個講、lines 按「聊天」輪著講', HUNTER_BANTER: '按「聊天」偶爾整段插嘴，一人一句隔兩秒多', ARCHMAGE_LINES: '廣場上大法師科技直營亭的店員（zones/gucheng/gucheng-archmage.js）：greet 走近、lines 按「聊天」輪著講；有貨以後按「看貨」開店家小卡' } },
  { title: '黑森林・洞裡的三個傭兵', file: 'js/zones/dong/dong-lines.js', note: '雇營火那三個人進洞（zones/dong/dong-fight.js 照種子排每一場；試做頁 experiments/cave_preview.html）',
    keys: { LIGHT_SAY: '門口換這一場的打光時回的話（noLamp、noBarrel 是那一間沒有那樣道具）', TELLS: '大招前喊的預兆；括號的是敵人的起手，不說話', WARN: '伏擊前精靈先聽到', OOPS: '失手（自己說）：矮人絆倒、精靈射偏、法師冒煙', BANTER: '打到一半互相吐槽，一段兩三句照順序：count 矮人精靈數誰打倒得多（{me}{you} 是數字）、guard 被擋的人、slip／miss／fizzle 失手後別人插嘴、flash 一閃、big 第一次看到大隻的、stone／ash／reform／wake、hurt 傷重（self 自己、other 另一個）', AFTER: 'win 打完誰先開口（照人分）、rest 短休、ask 往下還是回去、down／back 回答、fallen 有人倒下、retreat 撤退、grab 龍那層抓一個就跑' } },
  { title: '汀・霧中商人', file: 'js/zones/ting/ting-mist-lines.js', note: '跟著霧走的羊（zones/ting/ting-merchant.js），霧在 ting-mist.js：走進霧裡看清楚他才招呼',
    keys: { MERCHANT_LINES: 'greet 走進霧裡看清楚他時、lines 看貨時卡片上那句、done 買齊了以後按「聊天」' } },
  { title: '海市・攤販', file: 'js/npc/vendor-lines.js', note: '照攤位的 id（npc/vendors.js 的 VENDORS）：greet 走近、lines 按「聊天」輪著講、quiet 街上冷清時（晚上最冷清）；暗房 handover 交照片、報社 unsigned 退畫廊的眼睛拍的、printed 照版面（角落、半版、頭版、號外）',
    keys: { VENDOR_LINES: '' } },
  { title: '海市・一幕劇「漁火」', file: 'js/zones/haishi/haishi-act-lines.js', note: '碼頭魚桶裡的魚一路逃上星廟（zones/haishi/haishi-acts.js），魚販和沿路攤販看到牠時說的話',
    keys: { FISH_LINES: '碼頭的魚販：bucket 走近魚桶、start 魚跳出去、away 戲還在演時走過魚攤、back 演完回來', SPOT_LINES: '沿路躲的地方，who 是旁邊那攤：hint 你走近時、pop 被你找到飛走時' } },
  { title: '海市・星廟的籤', file: 'js/zones/haishi/haishi-lot-lines.js', note: '無像殿門口左手邊的籤台（zones/haishi/haishi-lots.js）：擲星石天允才搖籤，一天一支、三枚硬幣。全部文言七言',
    keys: { TIDES: '四等潮（say 是潮名底下那行）', STARS: '28 個星座：tide 第幾等潮、place 分野', LOTS: '56 支籤詩：star 第幾個星座、fun 搞笑的', ITEMS: '籤紙下面幾項：by 照潮等各一組、晴雨照今晚天氣', STONES: '擲星石的結果', LOT_SAY: '籤台、水鏡冒的字' } },
  { title: '海市・星潮報', file: 'js/save/press.js', note: '報社印出來的報紙（save/press.js）：你那則的標題和副標照奇物和版面抽',
    keys: { HEADS: '標題', SUBS: '副標' } },
  { title: '海市・星潮報的其他報導', file: 'js/save/press-lines.js', note: '旁邊那幾欄：頭條抽本地（四成是連載），其他欄混外地和啟事。「新聞　笑點」的後半在小欄裡印成副標',
    keys: { LOCAL: '海市本地', WIRE: '別區傳來的', NOTICE: '啟事、更正、招領', SERIALS: '連載：days 照期號一天一句輪；count 的 {n} 從 from 那期起一天加一', ADS: '廣告（店名、一句）' } },
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
