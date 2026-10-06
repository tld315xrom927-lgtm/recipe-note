/* AIレシピ貼り付け：決められた形式のテキストを各項目へ振り分ける */
(function () {
  const CATEGORIES = ['主食', '主菜', '副菜', 'スープ', 'おやつ', 'ドリンク'];

  const FIELD_ALIASES = {
    title: ['料理名', 'レシピ名', 'タイトル', '名前', 'メニュー名'],
    subtitle: ['サブタイトル', '英語名', '英名', 'ローマ字'],
    category: ['カテゴリ', 'カテゴリー', '分類', 'ジャンル', '種類'],
    time: ['調理時間', '所要時間', '時間', '目安時間'],
    servings: ['分量', '人数', '何人分', '人分'],
    ingredients: ['材料と分量', '材料', '食材', '用意するもの'],
    steps: ['作り方', '手順', '調理手順', '工程', 'つくり方'],
    memo: ['メモ', 'ポイント', 'コツ', '備考', 'ひとこと', 'アレンジ', '補足'],
  };

  const CATEGORY_SYNONYMS = {
    主食: ['主食', 'ご飯', 'ごはん', 'ご飯もの', '麺', '麺類', 'パスタ', 'パン', '丼', 'どんぶり', 'カレー', 'ライス', '粉もの'],
    主菜: ['主菜', 'メイン', 'おかず', 'メインディッシュ', '肉料理', '魚料理'],
    副菜: ['副菜', 'サラダ', '小鉢', '付け合わせ', 'サイド', '和え物', '漬物'],
    スープ: ['スープ', '汁物', '味噌汁', 'みそ汁', 'ポタージュ', '鍋'],
    おやつ: ['おやつ', 'デザート', 'スイーツ', 'お菓子', 'ケーキ', '焼き菓子'],
    ドリンク: ['ドリンク', '飲み物', '飲料', 'カフェ', 'ジュース', 'スムージー'],
  };

  const BULLET = /^[\s　]*(?:[・\-\*•●○◦▪■□◆◇►▶︎✓✔]|[-–—]\s)[\s　]*/;
  const STEP_NUM = /^[\s　]*(?:(?:STEP|Step|step|ステップ)\s*\d+[\s　.:：)）]*|\d+\s*[.)．、）:：]\s*|[①-⑳]\s*|[\(（]\d+[\)）]\s*|\d+[\s　]+)/;

  function toHalfWidth(s) {
    return s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  }

  function normLabel(s) {
    return s.replace(/[\s　]/g, '').replace(/[（(].*?[)）]/g, '');
  }

  const aliasLookup = [];
  Object.entries(FIELD_ALIASES).forEach(([field, list]) => list.forEach(a => aliasLookup.push([a, field])));
  aliasLookup.sort((a, b) => b[0].length - a[0].length);

  function findField(label) {
    const n = normLabel(label);
    for (const [alias, field] of aliasLookup) if (n === alias) return field;
    return null;
  }

  /* 1行が見出しなら {field, note, rest} を返す */
  function parseHeader(rawLine) {
    let line = rawLine.trim().replace(/^[#＃■◆●▼▽★☆◎]+[\s　]*/, '');
    if (!line) return null;
    let label = null, rest = '';
    let m = line.match(/^【(.+?)】[\s　]*[:：]?[\s　]*(.*)$/) || line.match(/^\[(.+?)\][\s　]*[:：]?[\s　]*(.*)$/) || line.match(/^〈(.+?)〉[\s　]*[:：]?[\s　]*(.*)$/);
    if (m) { label = m[1]; rest = m[2]; }
    else if ((m = line.match(/^([^:：]{1,16}?)[\s　]*[:：][\s　]*(.*)$/))) { label = m[1]; rest = m[2]; }
    else { label = line; rest = ''; }
    // 見出し側の括弧書き（例：材料（2人分））
    const noteMatch = label.match(/[（(](.+?)[)）]/);
    const field = findField(label.replace(/\*\*/g, ''));
    if (!field) return null;
    return { field, note: noteMatch ? noteMatch[1].trim() : '', rest: rest.trim() };
  }

  function parseTime(s) {
    if (!s) return '';
    const t = toHalfWidth(s);
    let min = 0, hit = false;
    const h = t.match(/(\d+(?:\.\d+)?)\s*時間/);
    if (h) { min += Math.round(parseFloat(h[1]) * 60); hit = true; }
    const m = t.match(/(\d+)\s*分/);
    if (m) { min += parseInt(m[1], 10); hit = true; }
    if (!hit) {
      const n = t.match(/(\d+)/);
      if (n) { min = parseInt(n[1], 10); hit = true; }
    }
    return hit ? min : '';
  }

  /* list：アプリで使っているカテゴリ一覧（省略時は初期カテゴリ）。
     一覧に当てはまらないときは、書かれていた名前をそのまま返す（新しいカテゴリ候補になる） */
  function parseCategory(s, list) {
    if (!s) return '';
    const cats = (list && list.length ? list : CATEGORIES).slice().sort((a, b) => b.length - a.length);
    const t = s.replace(/[\s　]/g, '');
    for (const c of cats) if (t === c.replace(/[\s　]/g, '')) return c;
    for (const c of cats) if (t.includes(c.replace(/[\s　]/g, ''))) return c;
    for (const [cat, words] of Object.entries(CATEGORY_SYNONYMS)) {
      if (cats.includes(cat) && words.some(w => t.includes(w))) return cat;
    }
    return list ? s.trim().replace(/^[「『]|[」』]$/g, '').slice(0, 20) : '';
  }

  const AMOUNT_HINT = /(\d|[０-９]|大さじ|小さじ|カップ|少々|適量|適宜|ひとつまみ|お好み|個|本|枚|片|かけ|束|袋|缶|パック|合|g|ｇ|ml|ｍｌ|cc|kg|L)/;

  function parseIngredient(line) {
    let s = line.replace(BULLET, '').trim();
    if (!s) return null;
    let m;
    if ((m = s.match(/^(.+?)[\s　]*[:：][\s　]*(.+)$/))) return { name: m[1].trim(), amount: m[2].trim() };
    if ((m = s.match(/^(.+?)[\s　]*[.．…‥・･·\-－ー]{2,}[\s　]*(.+)$/))) return { name: m[1].trim(), amount: m[2].trim() };
    if ((m = s.match(/^(.+?)(?:\t+|[\s　]{2,})(.+)$/))) return { name: m[1].trim(), amount: m[2].trim() };
    if ((m = s.match(/^(.+)[\s　]+(\S+)$/)) && AMOUNT_HINT.test(m[2])) return { name: m[1].trim(), amount: m[2].trim() };
    return { name: s, amount: '' };
  }

  function parseSteps(lines) {
    const steps = [];
    const numbered = lines.some(l => STEP_NUM.test(l));
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) continue;
      if (numbered) {
        if (STEP_NUM.test(l)) steps.push(l.replace(STEP_NUM, '').trim());
        else if (steps.length) steps[steps.length - 1] += '\n' + l.replace(BULLET, '').trim();
        else steps.push(l.replace(BULLET, '').trim());
      } else {
        steps.push(l.replace(BULLET, '').trim());
      }
    }
    return steps.filter(Boolean);
  }

  function parse(text, options = {}) {
    const result = {
      title: '', subtitle: '', category: '', time: '', servings: '',
      ingredients: [], steps: [], memo: '', found: [],
    };
    const buckets = {};
    let current = null;
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');

    for (const line of lines) {
      if (/^[\s　]*(?:-{3,}|={3,}|＿{3,}|─{3,})[\s　]*$/.test(line)) continue; // 区切り線
      if (/^[\s　]*```/.test(line)) continue; // コードブロック記号
      const header = parseHeader(line);
      if (header) {
        current = header.field;
        buckets[current] = buckets[current] || [];
        if (header.note && current === 'ingredients' && !buckets.servingsNote) buckets.servingsNote = header.note;
        if (header.rest) buckets[current].push(header.rest);
        continue;
      }
      if (current) buckets[current].push(line);
      else if (line.trim() && !buckets.title) buckets.untitled = (buckets.untitled || []).concat(line.trim());
    }

    const firstText = arr => (arr || []).map(s => s.trim()).find(Boolean) || '';

    result.title = firstText(buckets.title).replace(/^[「『]|[」』]$/g, '');
    if (!result.title && buckets.untitled) result.title = buckets.untitled[0];
    result.subtitle = firstText(buckets.subtitle);
    result.category = parseCategory(firstText(buckets.category), options.categories);
    result.time = parseTime(firstText(buckets.time));
    result.servings = firstText(buckets.servings) || buckets.servingsNote || '';
    result.ingredients = (buckets.ingredients || []).map(parseIngredient).filter(Boolean);
    result.steps = parseSteps(buckets.steps || []);
    result.memo = (buckets.memo || []).map(s => s.trim()).filter(Boolean).join('\n');

    const labels = { title: '料理名', category: 'カテゴリ', time: '調理時間', ingredients: '材料', steps: '作り方', memo: 'メモ' };
    Object.keys(labels).forEach(k => {
      const v = result[k];
      if (Array.isArray(v) ? v.length : v !== '') result.found.push(labels[k]);
    });
    return result;
  }

  const TEMPLATE = [
    '【料理名】ダルゴナコーヒー',
    '【カテゴリ】ドリンク',
    '【調理時間】5分',
    '【分量】1人分',
    '【材料】',
    '・インスタントコーヒー：大さじ2',
    '・白砂糖：大さじ2',
    '・お湯：大さじ3',
    '・牛乳：150ml',
    '【作り方】',
    '1. ボウルにインスタントコーヒーと白砂糖を入れる。',
    '2. お湯を少しずつ加えながら、もったりするまで泡立てる。',
    '3. グラスに牛乳を注ぎ、泡をのせて完成。',
    '【メモ】',
    '・牛乳は豆乳やアーモンドミルクでも美味しい。',
  ].join('\n');

  const CHATGPT_PROMPT = [
    '次のレシピを、下の形式どおりに整理して出力してください。',
    '・見出し（【】の部分）はそのまま使ってください',
    '・カテゴリは「主食・主菜・副菜・スープ・おやつ・ドリンク」から1つ選んでください',
    '・調理時間は「〇分」の形で書いてください',
    '・材料は「・材料名：分量」の形で1行ずつ書いてください',
    '・作り方は「1. 」から始まる番号付きで1手順1行にしてください',
    '・前置きや説明文は不要です。形式の部分だけを出力してください',
    '',
    '【料理名】',
    '【カテゴリ】',
    '【調理時間】',
    '【分量】',
    '【材料】',
    '・材料名：分量',
    '【作り方】',
    '1. ',
    '【メモ】',
    '',
    '--- 整理してほしいレシピ ---',
    '（ここにレシピのURLや文章を貼り付け）',
  ].join('\n');

  window.RecipeParser = { parse, parseTime, parseCategory, parseIngredient, CATEGORIES, TEMPLATE, CHATGPT_PROMPT };
})();
