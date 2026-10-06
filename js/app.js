/* Recipe Note — 画面描画とルーティング */
(function () {
  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modal-root');

  const state = {
    recipes: [],
    query: '',
    category: 'すべて',
    categories: [...RecipeParser.CATEGORIES],
    favOnly: false,
    listScroll: 0,
    wakeLock: null,
    plans: {},
  };

  /* ---------- 小道具 ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl2br = s => esc(s).replace(/\n/g, '<br>');
  const uid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const timeLabel = t => (t === '' || t == null) ? '' : (t >= 60 && t % 60 === 0 ? `${t / 60}時間` : t > 60 ? `${Math.floor(t / 60)}時間${t % 60}分` : `${t}分`);

  const ICON = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.7 3.7 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.3 0 5.6 3.2 4.3 6.6-1.8 4.8-9.3 9.4-9.3 9.4z"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14 8 3 3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 13.8 9 19.5 10.5 13.8 12.2 12 18l-1.8-5.8L4.5 10.5 10.2 9z"/><path d="M19 17v4M17 19h4"/></svg>',
    camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="5.5" height="5.5" rx="1"/><rect x="13.5" y="5" width="5.5" height="5.5" rx="1"/><rect x="5" y="13.5" width="5.5" height="5.5" rx="1"/><rect x="13.5" y="13.5" width="5.5" height="5.5" rx="1"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19l1-4L16 5l3 3L9 18z"/><path d="M4 21h8"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>',
    text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 19 8 6.5 12.5 19M5 15h6"/><path d="M14 19l3.5-9 3.5 9M15 16.5h5"/></svg>',
    dish: '<svg viewBox="0 0 48 48" aria-hidden="true"><ellipse cx="24" cy="30" rx="17" ry="6.5"/><path d="M11 29.5a13 13 0 0 1 26 0"/><path d="M24 14.5v-3"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 9.6 4.5 4.5 0 0 0 7 18.5z"/></svg>',
    swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5 4 7.5l3 3M4 7.5h12M17 13.5l3 3-3 3M20 16.5H8"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };

  const NO_PHOTO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><rect width="160" height="120" fill="#efe6da"/><g fill="none" stroke="#c6b5a3" stroke-width="2.4"><ellipse cx="80" cy="74" rx="34" ry="13"/><path d="M54 73a26 26 0 0 1 52 0M80 43v-6"/></g></svg>');
  function photoHTML(recipe, cls = '') {
    if (recipe && recipe.photo) return `<img class="${cls}" src="${esc(recipe.photo)}" alt="${esc(recipe.title)}" loading="lazy" onerror="this.onerror=null;this.src='${NO_PHOTO}'">`;
    return `<div class="${cls} photo-empty">${ICON.dish}</div>`;
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function openModal(html, { onClose } = {}) {
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
    document.body.classList.add('modal-open');
    const backdrop = $('.modal-backdrop', modalRoot);
    const close = () => {
      modalRoot.innerHTML = '';
      document.body.classList.remove('modal-open');
      if (onClose) onClose();
    };
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    $$('[data-close]', modalRoot).forEach(b => b.addEventListener('click', close));
    return { el: $('.modal', modalRoot), close };
  }

  function confirmDialog(message, okLabel = 'OK', danger = false) {
    return new Promise(resolve => {
      let answered = false;
      const m = openModal(`
        <p class="modal-message">${nl2br(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-close>キャンセル</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okLabel)}</button>
        </div>`, { onClose: () => { if (!answered) resolve(false); } });
      $('[data-ok]', m.el).addEventListener('click', () => { answered = true; m.close(); resolve(true); });
    });
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* フォールバックへ */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  /* 写真を縮小して保存（端末容量の節約） */
  function resizeImage(file, max = 1280, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした')); };
      img.src = url;
    });
  }

  /* ---------- データ ---------- */
  async function loadRecipes() {
    const list = await RecipeDB.all();
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    state.recipes = list;
  }

  async function seedIfFirstRun() {
    const seeded = await RecipeDB.getMeta('seeded');
    if (seeded) return;
    const now = Date.now();
    for (let i = 0; i < SAMPLE_RECIPES.length; i++) {
      const s = SAMPLE_RECIPES[i];
      await RecipeDB.put({ ...s, id: uid(), createdAt: now - i * 1000, updatedAt: now - i * 1000 }, { imported: true });
    }
    await RecipeDB.setMeta('seeded', true);
  }

  /* 追加レシピ（added-recipes.js）を一度だけ取り込む。取り込み済みのIDは記録し、削除後に復活させない */
  async function importAddedRecipes() {
    const list = window.ADDED_RECIPES || [];
    if (!list.length) return;
    const done = new Set((await RecipeDB.getMeta('added-ids')) || []);
    const pending = list.filter(r => !done.has(r.id));
    if (!pending.length) return;
    const now = Date.now();
    const norm = t => String(t || '').replace(/[\s　]/g, '');
    const titles = new Set((await RecipeDB.all()).map(x => norm(x.title)));
    for (let i = 0; i < pending.length; i++) {
      const r = pending[i];
      const deletedElsewhere = RecipeDB.isDeleted && RecipeDB.isDeleted(r.id);
      if (!deletedElsewhere && !(await RecipeDB.get(r.id)) && !titles.has(norm(r.title))) {
        const t = now + (pending.length - i) * 1000;
        await RecipeDB.put({ ...r, favorite: false, createdAt: t, updatedAt: t }, { imported: true });
        titles.add(norm(r.title));
      }
      done.add(r.id);
    }
    await RecipeDB.setMeta('added-ids', [...done]);
  }

  /* ---------- カテゴリ ---------- */
  // レシピには従来どおりカテゴリ名（文字列）を保存し、並び順つきの一覧を meta に持つ
  const UNCATEGORIZED = '未分類';
  const RESERVED = ['すべて', UNCATEGORIZED];
  const isUncategorized = r => !r.category || r.category === UNCATEGORIZED;

  async function loadCategories() {
    const saved = await RecipeDB.getMeta('categories');
    let list = Array.isArray(saved) ? saved.filter(c => typeof c === 'string' && c) : [...RecipeParser.CATEGORIES];
    // 一覧にないカテゴリのレシピ（バックアップ読み込みなど）があれば一覧に足して見失わないようにする
    const extra = [...new Set(state.recipes.map(r => r.category).filter(c => c && !RESERVED.includes(c) && !list.includes(c)))];
    list = list.concat(extra);
    state.categories = list;
    if (!Array.isArray(saved) || extra.length) await RecipeDB.setMeta('categories', list);
  }

  const saveCategories = () => RecipeDB.setMeta('categories', state.categories);

  // 新しいカテゴリ名を検査し、問題があればメッセージを返す
  function categoryNameError(name, except = null) {
    if (!name) return 'カテゴリ名を入力してください';
    if (name.length > 20) return 'カテゴリ名は20文字以内にしてください';
    if (RESERVED.includes(name)) return `「${name}」はカテゴリ名に使えません`;
    if (state.categories.some(c => c === name && c !== except)) return `「${name}」はすでにあります`;
    return '';
  }

  async function addCategory(raw) {
    const name = String(raw || '').trim();
    const err = categoryNameError(name);
    if (err) { toast(err); return null; }
    state.categories.push(name);
    await saveCategories();
    return name;
  }

  async function renameCategory(oldName, raw) {
    const name = String(raw || '').trim();
    if (name === oldName) return true;
    const err = categoryNameError(name, oldName);
    if (err) { toast(err); return false; }
    for (const r of state.recipes.filter(x => x.category === oldName)) {
      r.category = name;
      await RecipeDB.put(r);
    }
    state.categories = state.categories.map(c => (c === oldName ? name : c));
    await saveCategories();
    if (state.category === oldName) state.category = name;
    return true;
  }

  // カテゴリを消しても、レシピ自体は消さずに「未分類」へ移す
  async function deleteCategory(name) {
    const now = Date.now();
    for (const r of state.recipes.filter(x => x.category === name)) {
      r.category = UNCATEGORIZED;
      r.updatedAt = now;
      await RecipeDB.put(r);
    }
    state.categories = state.categories.filter(c => c !== name);
    await saveCategories();
    if (state.category === name) state.category = 'すべて';
  }

  async function moveCategory(index, dir) {
    const j = index + dir;
    if (j < 0 || j >= state.categories.length) return;
    const list = state.categories;
    [list[index], list[j]] = [list[j], list[index]];
    await saveCategories();
  }

  const countInCategory = name => state.recipes.filter(r => (name === UNCATEGORIZED ? isUncategorized(r) : r.category === name)).length;

  async function toggleFavorite(id) {
    const r = state.recipes.find(x => x.id === id);
    if (!r) return null;
    r.favorite = !r.favorite;
    await RecipeDB.put(r);
    return r.favorite;
  }

  /* ---------- ルーター ---------- */
  function parseRoute() {
    const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
    const [name, id] = path.split('/');
    return { name: name || 'cover', id: id ? decodeURIComponent(id) : null, query: new URLSearchParams(query || '') };
  }

  let lastRoute = null;
  async function route() {
    const r = parseRoute();
    if (lastRoute === 'list') state.listScroll = window.scrollY;
    releaseWakeLock();
    document.body.dataset.view = r.name;
    if (r.name === 'list') renderList();
    else if (r.name === 'recipe') renderDetail(r.id);
    else if (r.name === 'edit') await renderEdit(r.id);
    else if (r.name === 'new') await renderEdit(null);
    else if (r.name === 'categories') renderCategories();
    else if (r.name === 'plans') renderPlans();
    else if (r.name === 'sync') renderSync();
    else renderCover();
    if (r.name === 'list') window.scrollTo(0, lastRoute && lastRoute !== 'list' ? state.listScroll : 0);
    else window.scrollTo(0, 0);
    lastRoute = r.name;
  }

  const go = path => { location.hash = path; };

  /* ---------- 表紙 ---------- */
  function renderCover() {
    app.innerHTML = `
      <section class="cover">
        <div class="cover-photo" style="background-image:url('assets/samples/cover.jpg')"></div>
        <div class="cover-veil"></div>
        <div class="cover-inner">
          <div class="cover-text">
            <h1 class="cover-title">Recipe<br>Note</h1>
            <p class="cover-sub">わたしのレシピノート</p>
            <span class="cover-rule"></span>
            <p class="cover-script">Good Food<br><span>Good Life</span></p>
            <a class="btn btn-primary btn-lg cover-btn" href="#/list">レシピをひらく<span aria-hidden="true">→</span></a>
            <p class="cover-count">${state.recipes.length} recipes</p>
          </div>
          <footer class="cover-foot">
            <span class="cover-rule"></span>
            <p>SIMPLE RECIPES<br>FOR A HAPPIER LIFE</p>
          </footer>
        </div>
      </section>`;
  }

  /* ---------- 一覧 ---------- */
  function filteredRecipes() {
    const q = state.query.trim().toLowerCase();
    const words = q ? q.split(/[\s　]+/) : [];
    return state.recipes.filter(r => {
      if (state.category === UNCATEGORIZED) { if (!isUncategorized(r)) return false; }
      else if (state.category !== 'すべて' && r.category !== state.category) return false;
      if (state.favOnly && !r.favorite) return false;
      if (!words.length) return true;
      const hay = [r.title, r.subtitle, r.category, r.memo, ...(r.ingredients || []).map(i => i.name)].join(' ').toLowerCase();
      return words.every(w => hay.includes(w));
    });
  }

  function categoryThumb(cat) {
    if (cat === 'すべて') return `<span class="cat-icon">${ICON.grid}</span>`;
    const r = state.recipes.find(x => (cat === UNCATEGORIZED ? isUncategorized(x) : x.category === cat) && x.photo);
    return r ? `<img class="cat-icon" src="${esc(r.photo)}" alt="">` : `<span class="cat-icon cat-letter">${esc(cat.slice(0, 1))}</span>`;
  }

  // 一覧上部に並べるカテゴリ（未分類はレシピがあるときだけ表示）
  function listCategories() {
    const list = ['すべて', ...state.categories];
    if (state.recipes.some(r => r.category === UNCATEGORIZED) || state.category === UNCATEGORIZED) list.push(UNCATEGORIZED);
    if (!list.includes(state.category)) state.category = 'すべて';
    return list;
  }

  function renderList() {
    app.innerHTML = `
      <section class="page list-page">
        <header class="list-head">
          <div>
            <a href="#/" class="head-title-link"><h1 class="page-title">Recipe List</h1></a>
            <p class="page-sub">レシピ一覧</p>
          </div>
          <div class="head-actions">
            <a class="pill plan-pill" href="#/plans" aria-label="献立">${ICON.calendar}<span>献立</span></a>
            <button class="pill ${state.favOnly ? 'is-on' : ''}" id="fav-filter" aria-pressed="${state.favOnly}">
              <span class="pill-heart">${ICON.heart}</span>お気に入り
            </button>
            <a class="btn btn-primary add-btn" href="#/new">${ICON.plus}<span>追加</span></a>
          </div>
        </header>

        ${RecipeDB.mode === 'memory' ? '<p class="notice">このブラウザ設定ではデータを保存できないため、閉じると内容が消えます。プライベートブラウズをオフにするか、別のブラウザで開いてください。</p>' : ''}
        <div id="sync-banner">${syncBannerHTML()}</div>
        <label class="search">
          ${ICON.search}
          <input id="search" type="search" placeholder="料理名・材料で検索" value="${esc(state.query)}" enterkeyhint="search" autocomplete="off">
        </label>

        <nav class="cats" aria-label="カテゴリ">
          ${listCategories().map(c => `
            <button class="cat ${state.category === c ? 'is-on' : ''}" data-cat="${esc(c)}" aria-pressed="${state.category === c}">
              ${categoryThumb(c)}<span class="cat-name">${esc(c)}</span>
            </button>`).join('')}
          <a class="cat cat-manage" href="#/categories" aria-label="カテゴリを管理">
            <span class="cat-icon">${ICON.edit}</span><span class="cat-name">編集</span>
          </a>
        </nav>

        <div id="grid" class="grid"></div>

        <footer class="list-foot">
          <p class="sync-line" id="sync-line">${syncLineHTML()}</p>
          <div class="foot-btns">
            <a class="link-btn" href="#/sync">${ICON.cloud}同期設定</a>
            <button class="link-btn" id="export">バックアップを書き出す</button>
            <button class="link-btn" id="import">バックアップを読み込む</button>
            <input type="file" id="import-file" accept="application/json,.json" hidden>
          </div>
        </footer>
        <a class="fab" href="#/new" aria-label="レシピを追加">${ICON.plus}</a>
      </section>`;

    renderGrid();

    $('#search').addEventListener('input', e => { state.query = e.target.value; renderGrid(); });
    $('#fav-filter').addEventListener('click', e => {
      state.favOnly = !state.favOnly;
      e.currentTarget.classList.toggle('is-on', state.favOnly);
      e.currentTarget.setAttribute('aria-pressed', state.favOnly);
      renderGrid();
    });
    $$('.cat[data-cat]').forEach(b => b.addEventListener('click', () => {
      state.category = b.dataset.cat;
      $$('.cat[data-cat]').forEach(x => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', on); });
      renderGrid();
    }));
    $('#export').addEventListener('click', exportBackup);
    $('#import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', importBackup);
  }

  function renderGrid() {
    const grid = $('#grid');
    if (!grid) return;
    const list = filteredRecipes();
    if (!list.length) {
      const empty = state.recipes.length === 0;
      grid.innerHTML = `<div class="empty">
        <div class="empty-icon">${ICON.dish}</div>
        <p>${empty ? 'まだレシピがありません' : '条件に合うレシピがありません'}</p>
        ${empty ? '<a class="btn btn-primary" href="#/new">最初のレシピを追加</a>' : ''}
      </div>`;
      return;
    }
    grid.innerHTML = list.map(r => `
      <article class="card">
        <a class="card-link" href="#/recipe/${encodeURIComponent(r.id)}">
          <div class="card-photo">${photoHTML(r)}</div>
          <div class="card-body">
            <h2 class="card-title">${esc(r.title)}</h2>
            <p class="card-meta">
              ${r.time !== '' && r.time != null ? `<span class="meta-time">${ICON.clock}${esc(timeLabel(r.time))}</span>` : ''}
              ${r.category ? `<span class="meta-cat">${esc(r.category)}</span>` : ''}
            </p>
          </div>
        </a>
        <button class="heart ${r.favorite ? 'is-on' : ''}" data-fav="${esc(r.id)}" aria-label="お気に入り" aria-pressed="${!!r.favorite}">${ICON.heart}</button>
      </article>`).join('');
    $$('[data-fav]', grid).forEach(b => b.addEventListener('click', async e => {
      e.preventDefault();
      const on = await toggleFavorite(b.dataset.fav);
      if (state.favOnly && !on) renderGrid();
      else { b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); }
    }));
  }

  /* ---------- 詳細 ---------- */
  function renderDetail(id) {
    const r = state.recipes.find(x => x.id === id);
    if (!r) {
      app.innerHTML = `<section class="page"><div class="empty"><p>レシピが見つかりませんでした</p><a class="btn btn-primary" href="#/list">一覧へ戻る</a></div></section>`;
      return;
    }
    const ings = r.ingredients || [];
    const steps = r.steps || [];
    const size = localStorage.getItem('rn-size') || 'm';
    app.innerHTML = `
      <section class="page detail-page" data-size="${esc(size)}">
        <div class="toolbar">
          ${lastRoute === 'plans' ? `<a class="tool-back" href="#/plans">${ICON.back}<span>献立</span></a>` : `<a class="tool-back" href="#/list">${ICON.back}<span>一覧</span></a>`}
          <div class="tools">
            <button class="tool" id="size-btn" aria-label="文字サイズ">${ICON.text}<span>文字</span></button>
            ${'wakeLock' in navigator ? `<button class="tool" id="wake-btn" aria-pressed="false" aria-label="画面を消さない">${ICON.sun}<span>画面ON</span></button>` : ''}
            <button class="tool heart-tool ${r.favorite ? 'is-on' : ''}" id="fav-btn" aria-pressed="${!!r.favorite}" aria-label="お気に入り">${ICON.heart}<span>お気に入り</span></button>
            <a class="tool" href="#/edit/${encodeURIComponent(r.id)}">${ICON.edit}<span>編集</span></a>
          </div>
        </div>

        <header class="detail-head">
          <div>
            <p class="eyebrow">recipe${r.category ? ` <span class="chip">${esc(r.category)}</span>` : ''}</p>
            <h1 class="detail-title">${esc(r.title)}</h1>
            ${r.subtitle ? `<p class="detail-subtitle">${esc(r.subtitle)}</p>` : ''}
          </div>
          ${r.time !== '' && r.time != null ? `<div class="time-badge"><small>調理時間</small><strong>${esc(timeLabel(r.time))}</strong></div>` : ''}
        </header>

        <div class="detail-top">
          <figure class="detail-photo">${photoHTML(r)}</figure>
          <section class="ingredients">
            <h2 class="sec-title">材料${r.servings ? `<span class="servings">（${esc(r.servings)}）</span>` : ''}</h2>
            ${ings.length ? `<ul class="ing-list">
              ${ings.map((i, n) => `
                <li class="ing" data-i="${n}">
                  <span class="ing-check" aria-hidden="true"></span>
                  <span class="ing-name">${esc(i.name)}</span>
                  <span class="ing-dots" aria-hidden="true"></span>
                  <span class="ing-amount">${esc(i.amount)}</span>
                </li>`).join('')}
            </ul><p class="hint">タップでチェックできます</p>` : '<p class="muted">材料は未登録です</p>'}
          </section>
        </div>

        <section class="steps">
          <h2 class="sec-title">作り方<span class="sec-deco">${ICON.pencil}</span></h2>
          ${steps.length ? `<ol class="step-list">
            ${steps.map((s, n) => `
              <li class="step" data-s="${n}">
                <span class="step-num">${n + 1}</span>
                <p class="step-text">${nl2br(s)}</p>
              </li>`).join('')}
          </ol>` : '<p class="muted">作り方は未登録です</p>'}
        </section>

        ${r.memo ? `<section class="memo">
          <h2 class="memo-title">${ICON.pencil}メモ</h2>
          <p class="memo-text">${nl2br(r.memo)}</p>
        </section>` : ''}

        ${(r.sources || []).length ? `<section class="sources">
          <h2 class="memo-title">${ICON.camera}元画像<span class="sources-count">${r.sources.length}枚</span></h2>
          <div class="source-list">
            ${r.sources.map((s, n) => `<button type="button" class="source-thumb" data-src="${n}" aria-label="元画像 ${n + 1}を大きく表示"><img src="${esc(s)}" alt="元画像 ${n + 1}" loading="lazy" onerror="this.onerror=null;this.src='${NO_PHOTO}'"></button>`).join('')}
          </div>
        </section>` : ''}

        <div class="detail-foot">
          <div class="detail-foot-btns">
            <a class="btn btn-ghost" href="#/edit/${encodeURIComponent(r.id)}">${ICON.edit}編集する</a>
            <button class="btn btn-ghost" id="plan-add-btn">${ICON.calendar}献立に追加</button>
          </div>
          <button class="link-btn danger" id="del-btn">${ICON.trash}このレシピを削除</button>
        </div>
      </section>`;

    $('#plan-add-btn').addEventListener('click', () => openAddToPlan(r));
    $$('.source-thumb').forEach(b => b.addEventListener('click', () => openSourceViewer(r.sources, +b.dataset.src)));
    $$('.ing').forEach(li => li.addEventListener('click', () => li.classList.toggle('is-done')));
    $$('.step').forEach(li => li.addEventListener('click', () => li.classList.toggle('is-done')));

    const sizes = ['m', 'l', 'xl'];
    $('#size-btn').addEventListener('click', () => {
      const page = $('.detail-page');
      const next = sizes[(sizes.indexOf(page.dataset.size) + 1) % sizes.length];
      page.dataset.size = next;
      try { localStorage.setItem('rn-size', next); } catch (e) { /* 保存できなくても表示は変える */ }
      toast({ m: '文字サイズ：標準', l: '文字サイズ：大', xl: '文字サイズ：特大' }[next]);
    });

    const wake = $('#wake-btn');
    if (wake) wake.addEventListener('click', async () => {
      if (state.wakeLock) { releaseWakeLock(); toast('画面の自動オフを元に戻しました'); return; }
      try {
        state.wakeLock = await navigator.wakeLock.request('screen');
        wake.classList.add('is-on'); wake.setAttribute('aria-pressed', 'true');
        state.wakeLock.addEventListener('release', () => { wake.classList.remove('is-on'); wake.setAttribute('aria-pressed', 'false'); });
        toast('料理中は画面が消えません');
      } catch (e) { toast('この端末では画面ONを使えませんでした'); }
    });

    $('#fav-btn').addEventListener('click', async e => {
      const on = await toggleFavorite(r.id);
      e.currentTarget.classList.toggle('is-on', on);
      e.currentTarget.setAttribute('aria-pressed', on);
      toast(on ? 'お気に入りに追加しました' : 'お気に入りを外しました');
    });

    $('#del-btn').addEventListener('click', async () => {
      if (!(await confirmDialog(`「${r.title}」を削除しますか？\nこの操作は元に戻せません。`, '削除する', true))) return;
      await RecipeDB.remove(r.id);
      await loadRecipes();
      toast('レシピを削除しました');
      go('/list');
    });
  }

  function openSourceViewer(list, start) {
    let i = start;
    const m = openModal(`
      <div class="modal-head">
        <h2 class="modal-title">${ICON.camera}元画像 <span class="viewer-pos"></span></h2>
        <button class="icon-btn" data-close aria-label="閉じる">${ICON.close}</button>
      </div>
      <div class="viewer"><img class="viewer-img" alt=""></div>
      ${list.length > 1 ? `<div class="modal-actions viewer-nav">
        <button class="btn btn-ghost" data-prev>${ICON.back}前へ</button>
        <button class="btn btn-ghost" data-next>次へ<span class="flip">${ICON.back}</span></button>
      </div>` : ''}`);
    m.el.classList.add('modal-viewer');
    const show = () => {
      $('.viewer-img', m.el).src = list[i];
      $('.viewer-img', m.el).alt = `元画像 ${i + 1}`;
      $('.viewer-pos', m.el).textContent = list.length > 1 ? `${i + 1} / ${list.length}` : '';
      const prev = $('[data-prev]', m.el), next = $('[data-next]', m.el);
      if (prev) prev.disabled = i === 0;
      if (next) next.disabled = i === list.length - 1;
      $('.viewer', m.el).scrollTop = 0;
    };
    const prev = $('[data-prev]', m.el), next = $('[data-next]', m.el);
    if (prev) prev.addEventListener('click', () => { if (i > 0) { i--; show(); } });
    if (next) next.addEventListener('click', () => { if (i < list.length - 1) { i++; show(); } });
    show();
  }

  function releaseWakeLock() {
    if (state.wakeLock) { state.wakeLock.release().catch(() => {}); state.wakeLock = null; }
  }

  /* ---------- 追加・編集 ---------- */
  async function renderEdit(id) {
    const existing = id ? state.recipes.find(x => x.id === id) : null;
    if (id && !existing) { renderDetail(id); return; }
    const d = existing ? JSON.parse(JSON.stringify(existing)) : {
      title: '', subtitle: '', category: '', time: '', servings: '', ingredients: [], steps: [], memo: '', photo: '', favorite: false,
    };
    if (!d.ingredients.length) d.ingredients.push({ name: '', amount: '' });
    if (!d.steps.length) d.steps.push('');

    app.innerHTML = `
      <section class="page edit-page">
        <div class="toolbar">
          <a class="tool-back" href="${existing ? `#/recipe/${encodeURIComponent(existing.id)}` : '#/list'}">${ICON.back}<span>${existing ? '詳細' : '一覧'}</span></a>
          <button class="btn btn-primary btn-sm" form="recipe-form" type="submit">保存</button>
        </div>
        <header class="edit-head">
          <h1 class="page-title">${existing ? 'Edit Recipe' : 'New Recipe'}</h1>
          <p class="page-sub">${existing ? 'レシピを編集' : 'レシピを追加'}</p>
        </header>

        <button type="button" class="ai-card" id="ai-open">
          <span class="ai-icon">${ICON.spark}</span>
          <span class="ai-text"><strong>AIレシピ貼り付け</strong><small>ChatGPTで整理したレシピを貼るだけで自動入力</small></span>
          <span class="ai-arrow" aria-hidden="true">›</span>
        </button>

        <form id="recipe-form" class="form" novalidate>
          <div class="field">
            <label class="label" for="f-title">料理名 <em>必須</em></label>
            <input id="f-title" class="input input-lg" name="title" required value="${esc(d.title)}" placeholder="例）ダルゴナコーヒー">
          </div>
          <div class="field">
            <label class="label" for="f-subtitle">サブタイトル・英語名 <span class="opt">任意</span></label>
            <input id="f-subtitle" class="input" name="subtitle" value="${esc(d.subtitle || '')}" placeholder="例）Dalgona Coffee">
          </div>

          <div class="field">
            <span class="label">料理写真</span>
            <div class="photo-pick">
              <div class="photo-preview" id="photo-preview">${photoHTML(d)}</div>
              <div class="photo-btns">
                <label class="btn btn-ghost">${ICON.camera}写真を選ぶ<input type="file" id="f-photo" accept="image/*" hidden></label>
                <button type="button" class="link-btn danger" id="photo-remove" ${d.photo ? '' : 'hidden'}>写真を外す</button>
              </div>
            </div>
          </div>

          <div class="field">
            <span class="label">カテゴリ</span>
            <div class="seg" role="radiogroup" id="f-category" aria-label="カテゴリ"></div>
            <div class="cat-new" id="cat-new" hidden>
              <input class="input" id="cat-new-input" maxlength="20" placeholder="新しいカテゴリ名" enterkeyhint="done" autocomplete="off" aria-label="新しいカテゴリ名">
              <button type="button" class="btn btn-primary btn-sm" id="cat-new-ok">追加</button>
              <button type="button" class="link-btn" id="cat-new-cancel">やめる</button>
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label class="label" for="f-time">調理時間</label>
              <div class="input-unit"><input id="f-time" class="input" name="time" type="number" inputmode="numeric" min="0" max="9999" value="${esc(d.time)}" placeholder="20"><span>分</span></div>
            </div>
            <div class="field">
              <label class="label" for="f-servings">分量 <span class="opt">任意</span></label>
              <input id="f-servings" class="input" name="servings" value="${esc(d.servings || '')}" placeholder="例）2人分">
            </div>
          </div>

          <div class="field">
            <span class="label">材料と分量</span>
            <div id="ing-rows" class="rows"></div>
            <button type="button" class="btn btn-ghost btn-add" id="ing-add">${ICON.plus}材料を追加</button>
          </div>

          <div class="field">
            <span class="label">作り方</span>
            <div id="step-rows" class="rows"></div>
            <button type="button" class="btn btn-ghost btn-add" id="step-add">${ICON.plus}手順を追加</button>
          </div>

          <div class="field">
            <label class="label" for="f-memo">メモ</label>
            <textarea id="f-memo" class="input textarea" name="memo" rows="4" placeholder="コツ・アレンジ・保存方法など">${esc(d.memo)}</textarea>
          </div>

          <div class="form-actions">
            <button class="btn btn-primary btn-lg" type="submit">${existing ? '変更を保存する' : 'このレシピを登録する'}</button>
            ${existing ? `<button type="button" class="link-btn danger" id="edit-del">${ICON.trash}このレシピを削除</button>` : ''}
          </div>
        </form>
      </section>`;

    const fields = () => ({
      title: $('#f-title'), subtitle: $('#f-subtitle'), time: $('#f-time'), servings: $('#f-servings'), memo: $('#f-memo'),
    });
    const ingRows = $('#ing-rows');
    const stepRows = $('#step-rows');

    // 入力中の値を d に書き戻してから並べ替え・追加・削除する
    function syncRows() {
      d.ingredients = $$('.ing-row', ingRows).map(row => ({ name: $('.in-name', row).value, amount: $('.in-amount', row).value }));
      d.steps = $$('.step-row', stepRows).map(row => $('textarea', row).value);
    }

    function drawIngredients() {
      ingRows.innerHTML = d.ingredients.map((i, n) => `
        <div class="ing-row">
          <input class="input in-name" value="${esc(i.name)}" placeholder="材料名" aria-label="材料名 ${n + 1}">
          <input class="input in-amount" value="${esc(i.amount)}" placeholder="分量" aria-label="分量 ${n + 1}">
          <button type="button" class="icon-btn" data-del-ing="${n}" aria-label="材料を削除">${ICON.close}</button>
        </div>`).join('');
      $$('[data-del-ing]', ingRows).forEach(b => b.addEventListener('click', () => {
        syncRows();
        d.ingredients.splice(+b.dataset.delIng, 1);
        if (!d.ingredients.length) d.ingredients.push({ name: '', amount: '' });
        drawIngredients();
      }));
    }

    function drawSteps() {
      stepRows.innerHTML = d.steps.map((s, n) => `
        <div class="step-row">
          <span class="step-num">${n + 1}</span>
          <textarea class="input textarea" rows="2" placeholder="手順 ${n + 1}" aria-label="手順 ${n + 1}">${esc(s)}</textarea>
          <div class="step-ctrl">
            <button type="button" class="icon-btn" data-mv="${n}" data-dir="-1" aria-label="上へ" ${n === 0 ? 'disabled' : ''}>${ICON.up}</button>
            <button type="button" class="icon-btn" data-mv="${n}" data-dir="1" aria-label="下へ" ${n === d.steps.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
            <button type="button" class="icon-btn" data-del-step="${n}" aria-label="手順を削除">${ICON.close}</button>
          </div>
        </div>`).join('');
      $$('[data-del-step]', stepRows).forEach(b => b.addEventListener('click', () => {
        syncRows();
        d.steps.splice(+b.dataset.delStep, 1);
        if (!d.steps.length) d.steps.push('');
        drawSteps();
      }));
      $$('[data-mv]', stepRows).forEach(b => b.addEventListener('click', () => {
        syncRows();
        const i = +b.dataset.mv, j = i + +b.dataset.dir;
        [d.steps[i], d.steps[j]] = [d.steps[j], d.steps[i]];
        drawSteps();
      }));
    }

    drawIngredients();
    drawSteps();

    $('#ing-add').addEventListener('click', () => {
      syncRows(); d.ingredients.push({ name: '', amount: '' }); drawIngredients();
      $$('.in-name', ingRows).pop().focus();
    });
    $('#step-add').addEventListener('click', () => {
      syncRows(); d.steps.push(''); drawSteps();
      $$('textarea', stepRows).pop().focus();
    });

    // カテゴリ選択（管理画面の並び順どおり＋その場で新規追加）
    const catBox = $('#f-category');
    const catNew = $('#cat-new');
    const catInput = $('#cat-new-input');
    function drawCategories() {
      const opts = [...state.categories];
      if (d.category && !opts.includes(d.category)) opts.push(d.category); // 未分類・貼り付けで読んだ新しい名前
      catBox.innerHTML = opts.map(c => {
        const on = d.category === c;
        const isNew = c !== UNCATEGORIZED && !state.categories.includes(c);
        return `<button type="button" class="seg-btn ${on ? 'is-on' : ''}" data-val="${esc(c)}" role="radio" aria-checked="${on}">${esc(c)}${isNew ? '<small class="seg-new-mark">新規</small>' : ''}</button>`;
      }).join('') + `<button type="button" class="seg-btn seg-add" id="cat-add-btn" aria-expanded="${!catNew.hidden}">${ICON.plus}新しいカテゴリ</button>`;
      $$('.seg-btn[data-val]', catBox).forEach(b => b.addEventListener('click', () => {
        d.category = d.category === b.dataset.val ? '' : b.dataset.val;
        drawCategories();
      }));
      $('#cat-add-btn').addEventListener('click', () => {
        catNew.hidden = false;
        drawCategories();
        catInput.focus();
      });
    }
    async function submitNewCategory() {
      const name = await addCategory(catInput.value);
      if (!name) { catInput.focus(); return; }
      d.category = name;
      catInput.value = '';
      catNew.hidden = true;
      drawCategories();
      toast(`カテゴリ「${name}」を追加しました`);
    }
    $('#cat-new-ok').addEventListener('click', submitNewCategory);
    catInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submitNewCategory(); }
    });
    $('#cat-new-cancel').addEventListener('click', () => { catInput.value = ''; catNew.hidden = true; drawCategories(); });
    drawCategories();

    $('#f-photo').addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        d.photo = await resizeImage(file);
        $('#photo-preview').innerHTML = photoHTML(d);
        $('#photo-remove').hidden = false;
      } catch (err) { toast(err.message); }
      e.target.value = '';
    });
    $('#photo-remove').addEventListener('click', () => {
      d.photo = '';
      $('#photo-preview').innerHTML = photoHTML(d);
      $('#photo-remove').hidden = true;
    });

    $('#ai-open').addEventListener('click', () => openPasteModal(applyParsed));

    function applyParsed(p) {
      syncRows();
      const F = fields();
      if (p.title) F.title.value = p.title;
      if (p.subtitle) F.subtitle.value = p.subtitle;
      if (p.time !== '') F.time.value = p.time;
      if (p.servings) F.servings.value = p.servings;
      if (p.memo) F.memo.value = p.memo;
      if (p.category) {
        d.category = p.category;
        drawCategories();
      }
      if (p.ingredients.length) { d.ingredients = p.ingredients; drawIngredients(); }
      if (p.steps.length) { d.steps = p.steps; drawSteps(); }
      toast(p.found.length ? `${p.found.join('・')}を入力しました` : '読み取れる項目がありませんでした');
    }

    $('#recipe-form').addEventListener('submit', async e => {
      e.preventDefault();
      syncRows();
      const F = fields();
      const title = F.title.value.trim();
      if (!title) {
        F.title.classList.add('is-error');
        F.title.focus();
        toast('料理名を入力してください');
        return;
      }
      // 貼り付けで読んだ一覧にないカテゴリは、保存時にカテゴリとして追加する
      if (d.category && !RESERVED.includes(d.category) && !state.categories.includes(d.category)) {
        if (!(await addCategory(d.category))) return;
      }
      const timeVal = F.time.value.trim();
      const now = Date.now();
      const recipe = {
        ...(existing || {}),
        id: existing ? existing.id : uid(),
        title,
        subtitle: F.subtitle.value.trim(),
        category: d.category || '',
        time: timeVal === '' ? '' : Math.max(0, parseInt(timeVal, 10) || 0),
        servings: F.servings.value.trim(),
        ingredients: d.ingredients.map(i => ({ name: i.name.trim(), amount: i.amount.trim() })).filter(i => i.name || i.amount),
        steps: d.steps.map(s => s.trim()).filter(Boolean),
        memo: F.memo.value.trim(),
        photo: d.photo || '',
        favorite: existing ? !!existing.favorite : false,
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
      };
      try {
        await RecipeDB.put(recipe);
      } catch (err) {
        toast('保存できませんでした（端末の空き容量をご確認ください）');
        return;
      }
      await loadRecipes();
      toast(existing ? '変更を保存しました' : 'レシピを登録しました');
      location.replace('#/recipe/' + encodeURIComponent(recipe.id));
    });
    $('#f-title').addEventListener('input', e => e.target.classList.remove('is-error'));

    const del = $('#edit-del');
    if (del) del.addEventListener('click', async () => {
      if (!(await confirmDialog(`「${existing.title}」を削除しますか？\nこの操作は元に戻せません。`, '削除する', true))) return;
      await RecipeDB.remove(existing.id);
      await loadRecipes();
      toast('レシピを削除しました');
      location.replace('#/list');
    });
  }

  /* ---------- カテゴリ管理 ---------- */
  function renderCategories() {
    app.innerHTML = `
      <section class="page cat-page">
        <div class="toolbar">
          <a class="tool-back" href="#/list">${ICON.back}<span>一覧</span></a>
        </div>
        <header class="edit-head">
          <h1 class="page-title">Categories</h1>
          <p class="page-sub">カテゴリの管理</p>
        </header>

        <form class="cat-add" id="cat-add-form" novalidate>
          <input class="input" id="cat-add-input" maxlength="20" placeholder="新しいカテゴリ名（例：お弁当）" enterkeyhint="done" autocomplete="off" aria-label="新しいカテゴリ名">
          <button class="btn btn-primary" type="submit">${ICON.plus}追加</button>
        </form>
        <p class="cat-hint">矢印で並び替えると、一覧画面のカテゴリもその順番になります。</p>

        <ul class="cat-list" id="cat-list"></ul>

        <div class="cat-row is-fixed">
          ${categoryThumb(UNCATEGORIZED)}
          <div class="cat-row-main">
            <p class="cat-row-name">${UNCATEGORIZED}</p>
            <p class="cat-row-count">${countInCategory(UNCATEGORIZED)}件・削除したカテゴリのレシピはここへ移動します</p>
          </div>
        </div>
      </section>`;

    const listEl = $('#cat-list');
    let editing = null;

    function draw() {
      const n = state.categories.length;
      listEl.innerHTML = n ? state.categories.map((c, i) => {
        if (c === editing) {
          return `<li class="cat-row is-editing">
            ${categoryThumb(c)}
            <div class="cat-row-main">
              <input class="input cat-rename" maxlength="20" value="${esc(c)}" aria-label="カテゴリ名">
              <div class="cat-row-edit-btns">
                <button type="button" class="btn btn-primary btn-sm" data-save="${i}">保存</button>
                <button type="button" class="link-btn" data-cancel>やめる</button>
              </div>
            </div>
          </li>`;
        }
        return `<li class="cat-row">
          ${categoryThumb(c)}
          <div class="cat-row-main">
            <p class="cat-row-name">${esc(c)}</p>
            <p class="cat-row-count">${countInCategory(c)}件</p>
          </div>
          <div class="cat-row-tools">
            <button type="button" class="icon-btn" data-mv="${i}" data-dir="-1" aria-label="「${esc(c)}」を上へ" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
            <button type="button" class="icon-btn" data-mv="${i}" data-dir="1" aria-label="「${esc(c)}」を下へ" ${i === n - 1 ? 'disabled' : ''}>${ICON.down}</button>
            <button type="button" class="icon-btn" data-edit="${i}" aria-label="「${esc(c)}」の名前を変更">${ICON.edit}</button>
            <button type="button" class="icon-btn danger" data-del="${i}" aria-label="「${esc(c)}」を削除">${ICON.trash}</button>
          </div>
        </li>`;
      }).join('') : '<li class="cat-empty">カテゴリがありません。上の欄から追加できます。</li>';

      $$('[data-mv]', listEl).forEach(b => b.addEventListener('click', async () => {
        await moveCategory(+b.dataset.mv, +b.dataset.dir);
        draw();
        const moved = $(`[data-mv="${+b.dataset.mv + +b.dataset.dir}"][data-dir="${b.dataset.dir}"]`, listEl);
        if (moved && !moved.disabled) moved.focus();
      }));
      $$('[data-edit]', listEl).forEach(b => b.addEventListener('click', () => {
        editing = state.categories[+b.dataset.edit];
        draw();
        const input = $('.cat-rename', listEl);
        input.focus();
        input.select();
      }));
      $$('[data-del]', listEl).forEach(b => b.addEventListener('click', async () => {
        const name = state.categories[+b.dataset.del];
        const count = countInCategory(name);
        const msg = count
          ? `カテゴリ「${name}」を削除しますか？\nこのカテゴリの${count}件のレシピは削除されず、「${UNCATEGORIZED}」へ移動します。`
          : `カテゴリ「${name}」を削除しますか？`;
        if (!(await confirmDialog(msg, '削除する', true))) return;
        await deleteCategory(name);
        toast(count ? `「${name}」を削除し、${count}件を${UNCATEGORIZED}へ移動しました` : `「${name}」を削除しました`);
        renderCategories();
      }));
      const saveBtn = $('[data-save]', listEl);
      if (saveBtn) {
        const input = $('.cat-rename', listEl);
        const save = async () => {
          const before = editing;
          if (await renameCategory(before, input.value)) {
            editing = null;
            const after = input.value.trim();
            if (after !== before) toast(`「${before}」を「${after}」に変更しました`);
            draw();
          } else input.focus();
        };
        saveBtn.addEventListener('click', save);
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); save(); }
          if (e.key === 'Escape') { editing = null; draw(); }
        });
        $('[data-cancel]', listEl).addEventListener('click', () => { editing = null; draw(); });
      }
    }

    $('#cat-add-form').addEventListener('submit', async e => {
      e.preventDefault();
      const input = $('#cat-add-input');
      const name = await addCategory(input.value);
      if (!name) { input.focus(); return; }
      input.value = '';
      draw();
      toast(`カテゴリ「${name}」を追加しました`);
    });

    draw();
  }

  /* ---------- 献立 ---------- */
  // 献立は { 'YYYY-MM-DD': { items: [{ id, recipeId }] } } の形で保存（日付ごとに同期）
  const WEEK = '日月火水木金土';
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const dayAfter = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

  function dayLabel(date) {
    const d = parseYmd(date);
    const diff = Math.round((d - parseYmd(ymd(new Date()))) / 86400000);
    const rel = { '-1': '昨日', 0: '今日', 1: '明日', 2: '明後日' }[diff] || '';
    return { rel, text: `${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`, short: `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）` };
  }

  async function loadPlans() {
    state.plans = (await RecipeDB.getPlans()) || {};
  }
  const planItems = date => ((state.plans[date] && state.plans[date].items) || []);

  async function savePlan(date, items) {
    if (items.length) state.plans[date] = { items };
    else delete state.plans[date];
    await RecipeDB.setPlan(date, items);
  }

  function planDayHTML(date) {
    const lab = dayLabel(date);
    const items = planItems(date);
    return `<article class="plan-day ${lab.rel === '今日' ? 'is-today' : ''}" data-date="${date}">
      <header class="plan-day-head">
        <div>
          ${lab.rel ? `<span class="plan-rel">${lab.rel}</span>` : ''}
          <h2 class="plan-date">${lab.text}</h2>
        </div>
        <span class="plan-count">${items.length ? `${items.length}品` : ''}</span>
      </header>
      ${items.length ? `<ul class="plan-items">
        ${items.map(it => {
          const r = state.recipes.find(x => x.id === it.recipeId);
          const body = r
            ? `<a class="plan-link" href="#/recipe/${encodeURIComponent(r.id)}">
                <span class="plan-thumb">${photoHTML(r)}</span>
                <span class="plan-text"><span class="plan-name">${esc(r.title)}</span>${r.category ? `<span class="plan-cat">${esc(r.category)}</span>` : ''}</span>
              </a>`
            : `<div class="plan-link is-missing">
                <span class="plan-thumb">${photoHTML(null)}</span>
                <span class="plan-text"><span class="plan-name">削除されたレシピ</span></span>
              </div>`;
          return `<li class="plan-item">${body}
            <div class="plan-item-tools">
              <button type="button" class="icon-btn" data-swap="${esc(it.id)}" aria-label="別の料理に入れ替え">${ICON.swap}</button>
              <button type="button" class="icon-btn danger" data-remove="${esc(it.id)}" aria-label="献立から外す">${ICON.close}</button>
            </div>
          </li>`;
        }).join('')}
      </ul>` : '<p class="plan-empty">まだ料理がありません</p>'}
      <div class="plan-day-foot">
        <button type="button" class="btn btn-ghost btn-add" data-add>${ICON.plus}料理を追加</button>
        ${items.length ? '<button type="button" class="link-btn danger" data-clear>この日をすべて消す</button>' : ''}
      </div>
    </article>`;
  }

  function renderPlans() {
    const today = ymd(new Date());
    state.planDays = state.planDays || 7;
    const days = Array.from({ length: state.planDays }, (_, i) => dayAfter(i));
    const later = Object.keys(state.plans).filter(d => d > days[days.length - 1]).sort();
    const past = Object.keys(state.plans).filter(d => d < today).sort().reverse();
    app.innerHTML = `
      <section class="page plan-page">
        <div class="toolbar">
          <a class="tool-back" href="#/list">${ICON.back}<span>一覧</span></a>
        </div>
        <header class="edit-head">
          <h1 class="page-title">Meal Plan</h1>
          <p class="page-sub">献立</p>
        </header>

        <div class="plan-pick-date">
          <label class="label" for="plan-date">日付を選んで献立を作る</label>
          <div class="plan-pick-row">
            <input type="date" class="input" id="plan-date" value="${today}">
            <button type="button" class="btn btn-primary" id="plan-date-add">${ICON.plus}料理を追加</button>
          </div>
        </div>

        <div class="plan-days">
          ${days.concat(later).map(planDayHTML).join('')}
        </div>
        <div class="plan-more"><button type="button" class="btn btn-ghost" id="plan-more">さらに7日分を表示</button></div>

        ${past.length ? `<details class="plan-past">
          <summary>過去の献立（${past.length}日）</summary>
          <div class="plan-days">${past.map(planDayHTML).join('')}</div>
        </details>` : ''}
      </section>`;

    $('#plan-more').addEventListener('click', () => { state.planDays += 7; rerenderKeepScroll(renderPlans); });
    $('#plan-date-add').addEventListener('click', () => {
      const date = $('#plan-date').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('日付を選んでください'); return; }
      addToDay(date);
    });
    $$('.plan-day').forEach(card => {
      const date = card.dataset.date;
      $('[data-add]', card).addEventListener('click', () => addToDay(date));
      const clear = $('[data-clear]', card);
      if (clear) clear.addEventListener('click', async () => {
        if (!(await confirmDialog(`${dayLabel(date).text}の献立をすべて消しますか？\n（レシピ自体は消えません）`, '消す', true))) return;
        await savePlan(date, []);
        rerenderKeepScroll(renderPlans);
        toast('献立を消しました');
      });
      $$('[data-remove]', card).forEach(b => b.addEventListener('click', async () => {
        await savePlan(date, planItems(date).filter(x => x.id !== b.dataset.remove));
        rerenderKeepScroll(renderPlans);
        toast('献立から外しました');
      }));
      $$('[data-swap]', card).forEach(b => b.addEventListener('click', async () => {
        const ids = await openRecipePicker({ title: `${dayLabel(date).short}の料理を入れ替え`, multi: false });
        if (!ids) return;
        await savePlan(date, planItems(date).map(x => (x.id === b.dataset.swap ? { ...x, recipeId: ids[0] } : x)));
        rerenderKeepScroll(renderPlans);
        toast('料理を入れ替えました');
      }));
    });
  }

  async function addToDay(date) {
    const lab = dayLabel(date);
    const ids = await openRecipePicker({ title: `${lab.rel || lab.short}の献立に追加`, multi: true, disabledIds: planItems(date).map(x => x.recipeId) });
    if (!ids || !ids.length) return;
    await savePlan(date, planItems(date).concat(ids.map(recipeId => ({ id: uid(), recipeId }))));
    if (parseRoute().name === 'plans') rerenderKeepScroll(renderPlans);
    toast(`${lab.rel || lab.short}の献立に${ids.length}品追加しました`);
  }

  // レシピを選ぶ画面（multi: 複数選択して「追加する」／単一: タップで決定）
  function openRecipePicker({ title, multi, disabledIds = [] }) {
    return new Promise(resolve => {
      let done = false;
      let q = '';
      let cat = 'すべて';
      const chosen = new Set();
      const disabled = new Set(disabledIds);
      const cats = ['すべて', ...state.categories];
      if (state.recipes.some(isUncategorized)) cats.push(UNCATEGORIZED);
      const m = openModal(`
        <div class="modal-head">
          <h2 class="modal-title">${ICON.calendar}${esc(title)}</h2>
          <button class="icon-btn" data-close aria-label="閉じる">${ICON.close}</button>
        </div>
        <label class="search picker-search">${ICON.search}<input type="search" id="pick-q" placeholder="料理名・材料で検索" autocomplete="off" enterkeyhint="search"></label>
        <div class="seg picker-cats">${cats.map(c => `<button type="button" class="seg-btn ${c === cat ? 'is-on' : ''}" data-pcat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <ul class="picker-list" id="pick-list"></ul>
        ${multi ? `<div class="modal-actions picker-actions">
          <button class="btn btn-ghost" data-close>キャンセル</button>
          <button class="btn btn-primary" id="pick-ok" disabled>追加する</button>
        </div>` : ''}`, { onClose: () => { if (!done) resolve(null); } });
      m.el.classList.add('modal-picker');
      const listEl = $('#pick-list', m.el);
      const okBtn = $('#pick-ok', m.el);
      const finish = ids => { done = true; m.close(); resolve(ids); };

      function draw() {
        const words = q.trim().toLowerCase().split(/[\s　]+/).filter(Boolean);
        const list = state.recipes.filter(r => {
          if (cat === UNCATEGORIZED ? !isUncategorized(r) : cat !== 'すべて' && r.category !== cat) return false;
          const hay = [r.title, r.subtitle, r.category, ...(r.ingredients || []).map(i => i.name)].join(' ').toLowerCase();
          return words.every(w => hay.includes(w));
        });
        listEl.innerHTML = list.length ? list.map(r => {
          const off = disabled.has(r.id);
          const on = chosen.has(r.id);
          return `<li><button type="button" class="pick-row ${on ? 'is-on' : ''}" data-pid="${esc(r.id)}" ${off ? 'disabled' : ''} aria-pressed="${on}">
            <span class="plan-thumb">${photoHTML(r)}</span>
            <span class="plan-text"><span class="plan-name">${esc(r.title)}</span>${r.category ? `<span class="plan-cat">${esc(r.category)}</span>` : ''}</span>
            <span class="pick-mark">${off ? '追加済み' : multi ? `<span class="pick-check">${on ? '✓' : ''}</span>` : ''}</span>
          </button></li>`;
        }).join('') : '<li class="picker-empty">該当するレシピがありません</li>';
        $$('[data-pid]', listEl).forEach(b => b.addEventListener('click', () => {
          const id = b.dataset.pid;
          if (!multi) { finish([id]); return; }
          if (chosen.has(id)) chosen.delete(id); else chosen.add(id);
          b.classList.toggle('is-on', chosen.has(id));
          b.setAttribute('aria-pressed', chosen.has(id));
          $('.pick-check', b).textContent = chosen.has(id) ? '✓' : '';
          okBtn.disabled = !chosen.size;
          okBtn.textContent = chosen.size ? `追加する（${chosen.size}品）` : '追加する';
        }));
      }
      $('#pick-q', m.el).addEventListener('input', e => { q = e.target.value; draw(); });
      $$('[data-pcat]', m.el).forEach(b => b.addEventListener('click', () => {
        cat = b.dataset.pcat;
        $$('[data-pcat]', m.el).forEach(x => x.classList.toggle('is-on', x === b));
        draw();
      }));
      if (okBtn) okBtn.addEventListener('click', () => finish([...chosen]));
      draw();
    });
  }

  // レシピ詳細から「献立に追加」
  function openAddToPlan(r) {
    let date = ymd(new Date());
    const m = openModal(`
      <div class="modal-head">
        <h2 class="modal-title">${ICON.calendar}献立に追加</h2>
        <button class="icon-btn" data-close aria-label="閉じる">${ICON.close}</button>
      </div>
      <p class="plan-modal-text">「${esc(r.title)}」を追加する日を選んでください</p>
      <div class="seg plan-quick">${[0, 1, 2].map(i => { const d = dayAfter(i); return `<button type="button" class="seg-btn ${i === 0 ? 'is-on' : ''}" data-q="${d}">${dayLabel(d).rel}<small>${dayLabel(d).short}</small></button>`; }).join('')}</div>
      <input type="date" class="input" id="plan-modal-date" value="${date}" aria-label="日付">
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>キャンセル</button>
        <button class="btn btn-primary" id="plan-modal-ok">追加する</button>
      </div>`);
    const input = $('#plan-modal-date', m.el);
    const mark = () => $$('[data-q]', m.el).forEach(x => x.classList.toggle('is-on', x.dataset.q === date));
    $$('[data-q]', m.el).forEach(b => b.addEventListener('click', () => { date = b.dataset.q; input.value = date; mark(); }));
    input.addEventListener('change', () => { date = input.value; mark(); });
    $('#plan-modal-ok', m.el).addEventListener('click', async () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('日付を選んでください'); return; }
      const lab = dayLabel(date);
      if (planItems(date).some(x => x.recipeId === r.id)) { toast(`${lab.rel || lab.short}の献立にすでに入っています`); return; }
      await savePlan(date, planItems(date).concat({ id: uid(), recipeId: r.id }));
      m.close();
      toast(`${lab.rel || lab.short}の献立に追加しました`);
    });
  }

  function rerenderKeepScroll(fn) {
    const y = window.scrollY;
    fn();
    window.scrollTo(0, y);
  }

  /* ---------- 写真をクラウドへ ---------- */
  // スクショから取り込んだレシピの写真・元画像は公開サイトには置かない（著作権のため）。
  // 画像ファイルがある環境（PCの start.bat での配信）で開いたときに、画像そのものをレシピに埋め込み、
  // 合言葉で守られた Supabase に同期する → 公開サイトの iPhone・iPad・PC でも表示される
  const isLocalAsset = s => typeof s === 'string' && /^assets\/(recipes|sources)\//.test(s);
  async function toDataUrl(path) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!/^image\//.test(blob.type)) return null;
      return await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
    } catch (e) { return null; }
  }
  async function embedLocalImages() {
    const targets = state.recipes.filter(r => isLocalAsset(r.photo) || (r.sources || []).some(isLocalAsset));
    if (!targets.length) return 0;
    const probe = isLocalAsset(targets[0].photo) ? targets[0].photo : targets[0].sources.find(isLocalAsset);
    if (!(await toDataUrl(probe))) return 0; // 画像ファイルがない環境（公開サイトなど）では何もしない
    let n = 0;
    for (const r of targets) {
      const copy = { ...r };
      if (isLocalAsset(copy.photo)) copy.photo = (await toDataUrl(copy.photo)) || copy.photo;
      if (Array.isArray(copy.sources)) copy.sources = await Promise.all(copy.sources.map(async s => (isLocalAsset(s) ? (await toDataUrl(s)) || s : s)));
      if (copy.photo === r.photo && JSON.stringify(copy.sources) === JSON.stringify(r.sources)) continue;
      copy.updatedAt = Date.now();
      await RecipeDB.put(copy);
      n++;
    }
    if (n) {
      await loadRecipes();
      const name = parseRoute().name;
      if (['list', 'recipe', 'plans'].includes(name) && !modalRoot.innerHTML) route();
    }
    return n;
  }

  /* ---------- クラウド同期 ---------- */
  const hm = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  function syncBannerHTML() {
    if (!CloudSync.configured()) {
      const c = CloudSync.config();
      return `<a class="sync-banner is-off" href="#/sync">${ICON.cloud}<span><b>この端末はクラウドに接続されていません</b>ここでの変更はほかの端末に反映されません。${c.url && c.key ? '合言葉を入れるだけで接続できます。' : ''}タップして同期設定へ</span></a>`;
    }
    const s = CloudSync.status();
    if (s.lastError) return `<a class="sync-banner is-error" href="#/sync">${ICON.cloud}<span><b>同期できていません</b>${esc(s.lastError)}（タップして確認）</span></a>`;
    return '';
  }

  function syncLineHTML() {
    if (!CloudSync.configured()) return 'データはこの端末のブラウザ内に保存されています（<a href="#/sync">クラウド同期</a>はオフ）';
    const s = CloudSync.status();
    if (s.lastError) return `${ICON.cloud}同期できませんでした：${esc(s.lastError)}${s.pending ? `（未送信 ${s.pending}件・つながったら自動で送ります）` : ''}`;
    if (s.pending) return `${ICON.cloud}クラウドへ送信中（未送信 ${s.pending}件）`;
    return `${ICON.cloud}クラウドと同期しています${s.lastSync ? `（最終確認 ${hm(s.lastSync)}）` : ''}`;
  }

  // ほかの端末の変更が届いたら、表示中の画面を更新する（入力中・ダイアログ表示中は待つ）
  let refreshPending = false;
  async function onCloudChange(info) {
    const line = $('#sync-line');
    if (line) line.innerHTML = syncLineHTML();
    const banner = $('#sync-banner');
    if (banner) banner.innerHTML = syncBannerHTML();
    if (parseRoute().name === 'sync') { const st = $('#sync-status'); if (st) st.innerHTML = syncStatusHTML(); }
    if (!info.changed && !refreshPending) return;
    await loadRecipes();
    await loadCategories();
    await loadPlans();
    const name = parseRoute().name;
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && app.contains(document.activeElement);
    if (modalRoot.innerHTML || typing || name === 'edit' || name === 'new' || name === 'sync') { refreshPending = true; return; }
    refreshPending = false;
    const id = parseRoute().id;
    const view = { list: renderList, plans: renderPlans, categories: renderCategories, cover: renderCover, recipe: () => renderDetail(id) }[name];
    if (view) rerenderKeepScroll(view);
  }

  const RT_LABEL = { on: 'リアルタイム通知：オン', connecting: 'リアルタイム通知：接続中…', error: 'リアルタイム通知：使えません（10秒ごとの確認で反映します）', off: 'リアルタイム通知：オフ' };

  function syncStatusHTML() {
    if (!CloudSync.configured()) return '<p class="sync-state is-off">この端末はまだクラウドにつながっていません</p>';
    const s = CloudSync.status();
    const plansHere = Object.keys(state.plans).length;
    return `<p class="sync-state ${s.lastError ? 'is-error' : 'is-on'}">${ICON.cloud}${s.lastError ? `同期できませんでした：${esc(s.lastError)}` : 'クラウドと同期しています'}</p>
      <dl class="sync-grid">
        <dt>最終確認</dt><dd>${s.lastSync ? hm(s.lastSync) : '—'}</dd>
        <dt>レシピ</dt><dd>クラウド ${s.cloud ? s.cloud.recipes : '—'}件 ／ この端末 ${state.recipes.length}件${s.cloud && s.cloud.recipes === state.recipes.length && !s.pending ? ' <span class="ok-mark">一致</span>' : ''}</dd>
        <dt>献立</dt><dd>クラウド ${s.cloud ? s.cloud.plans : '—'}日分 ／ この端末 ${plansHere}日分</dd>
        <dt>未送信</dt><dd>${s.pending ? `${s.pending}件（つながったら自動で送ります）` : 'なし'}</dd>
      </dl>
      <p class="sync-sub">${RT_LABEL[s.realtime] || ''}</p>`;
  }

  function shareLink() {
    const c = CloudSync.config();
    const base = `${location.origin}${location.pathname}`;
    return `${base}#/sync?u=${encodeURIComponent(c.url)}&k=${encodeURIComponent(c.key)}`;
  }

  function loadQrLib() {
    if (window.qrcode) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
      sc.onload = resolve; sc.onerror = reject;
      document.head.appendChild(sc);
    });
  }

  function renderSync() {
    const c = CloudSync.config();
    const on = CloudSync.configured();
    const q = parseRoute().query;
    const url = q.get('u') || c.url;
    const key = q.get('k') || c.key;
    const fromLink = !on && q.get('u');
    app.innerHTML = `
      <section class="page sync-page">
        <div class="toolbar">
          <a class="tool-back" href="#/list">${ICON.back}<span>一覧</span></a>
        </div>
        <header class="edit-head">
          <h1 class="page-title">Sync</h1>
          <p class="page-sub">クラウド同期</p>
        </header>

        <div class="sync-card" id="sync-status">${syncStatusHTML()}</div>
        <div class="sync-diag">
          <button type="button" class="btn btn-ghost" id="sync-diag-btn">接続診断をする</button>
          <div id="sync-diag-out"></div>
        </div>
        ${on ? `<div class="sync-actions">
          <button type="button" class="btn btn-primary" id="sync-now">今すぐ確認</button>
          <button type="button" class="link-btn danger" id="sync-off">この端末の同期をやめる</button>
        </div>

        <section class="sync-share">
          <h2 class="memo-title">${ICON.cloud}iPhone・iPad をつなぐ</h2>
          <p class="sync-lead">ほかの端末でこのQRコードを読み取る（またはリンクを開く）と、URLとキーが入った状態でこの画面が開きます。あとは同じ合言葉を入れるだけです。</p>
          <div class="sync-qr" id="sync-qr"></div>
          <div class="sync-link-row">
            <input class="input" id="sync-link" value="${esc(shareLink())}" readonly aria-label="接続用リンク">
            <button type="button" class="btn btn-ghost" id="sync-copy">コピー</button>
          </div>
          <p class="sync-note">※ リンクには合言葉は入っていません。PCで配信している場合、iPhone・iPad は同じWi-Fiにつないでください。</p>
          ${/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '<p class="notice">いまPCで「localhost」のアドレスで開いているため、このリンクはiPhone・iPadでは開けません。start.bat の黒い画面に出る「iPhone / iPad : http://192.168.…」のアドレスでこの画面を開き直してから、QRコードを読み取ってください。</p>' : ''}
        </section>` : ''}

        <form class="form sync-form" id="sync-form" novalidate>
          ${fromLink ? '<p class="notice">接続用リンクからURLとキーを入れました。ほかの端末と同じ合言葉を入力してください。</p>' : ''}
          <p class="sync-lead">Supabase（無料プラン）を正本として、レシピ・カテゴリ・献立を iPhone・iPad・PC で同じ内容にします。<br>すべての端末で同じ「合言葉」を入力してください。</p>
          <div class="field">
            <label class="label" for="sync-url">Project URL</label>
            <input class="input" id="sync-url" value="${esc(url)}" placeholder="https://xxxxxxxx.supabase.co" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="url">
          </div>
          <div class="field">
            <label class="label" for="sync-key">Publishable key（または anon key）</label>
            <input class="input" id="sync-key" value="${esc(key)}" placeholder="sb_publishable_..." autocomplete="off" autocapitalize="off" spellcheck="false">
          </div>
          <div class="field">
            <label class="label" for="sync-secret">合言葉 <span class="opt">8文字以上・全端末で同じもの</span></label>
            <input class="input" id="sync-secret" type="password" placeholder="${on ? '設定済み（変更するときだけ入力）' : '最初の端末で決めた合言葉'}" autocomplete="off" autocapitalize="off" spellcheck="false">
          </div>
          <button class="btn btn-primary btn-lg" type="submit" id="sync-connect">${on ? '設定を更新して同期' : '接続して同期をはじめる'}</button>
          <p class="sync-note">いま端末に入っているレシピ・カテゴリ・献立は消えずにクラウドへ移ります。ほかの端末と同じ料理が重なった場合は1つにまとめ、ほかの端末で削除したものは復活しません。</p>
        </form>

        <details class="sync-help" ${on ? '' : 'open'}>
          <summary>Supabase の準備のしかた（最初の1回だけ）</summary>
          <ol>
            <li>supabase.com で無料アカウントを作り、「New project」でプロジェクトを作成（Free プラン）</li>
            <li>左メニューの「SQL Editor」を開き、アプリのフォルダにある <code>supabase/setup.sql</code> の中身を全部貼り付けて「Run」（更新版が出たときも同じ操作でOK・データは消えません）</li>
            <li>画面上部の「Connect」ボタン（または「Project Settings」→「Data API」）で <b>Project URL</b>、「Project Settings」→「API Keys」で <b>Publishable key</b> をコピーして、上の欄に貼り付け（余分な文字が付いていても大丈夫です）</li>
            <li>合言葉を決めて「接続して同期をはじめる」。2台目以降は上のQRコードから開いて同じ合言葉を入力</li>
          </ol>
          <p>※ secret key（service_role key）は入力しないでください。</p>
        </details>
      </section>`;

    if (fromLink || (!on && url && key)) $('#sync-secret').focus();
    // 貼り付けた文字に余計なものが付いていたら、その場で整える
    $('#sync-url').addEventListener('change', e => { e.target.value = CloudSync.parseUrl(e.target.value); });
    $('#sync-key').addEventListener('change', e => { e.target.value = CloudSync.parseKey(e.target.value); });
    $('#sync-diag-btn').addEventListener('click', async e => {
      const btn = e.currentTarget;
      const out = $('#sync-diag-out');
      btn.disabled = true;
      btn.textContent = '確認しています…';
      try {
        const steps = await CloudSync.diagnose({ url: $('#sync-url').value, key: $('#sync-key').value });
        const report = steps.map(x => `${x.ok ? '○' : '×'} ${x.name}：${x.detail}`).join('\n');
        out.innerHTML = `<ul class="diag-list">${steps.map(x => `<li class="${x.ok ? 'ok' : 'ng'}"><span class="diag-mark">${x.ok ? '○' : '×'}</span><span><b>${esc(x.name)}</b>${esc(x.detail)}</span></li>`).join('')}</ul>
          <button type="button" class="link-btn" id="diag-copy">結果をコピー（合言葉は含まれません）</button>`;
        $('#diag-copy').addEventListener('click', async () => toast((await copyText(report)) ? 'コピーしました' : 'コピーできませんでした'));
      } catch (err) {
        out.textContent = err.message;
      }
      btn.disabled = false;
      btn.textContent = '接続診断をする';
    });
    $('#sync-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('#sync-connect');
      const secret = $('#sync-secret').value || (on ? null : '');
      if (secret === '') { toast('合言葉を入力してください'); $('#sync-secret').focus(); return; }
      btn.disabled = true;
      btn.textContent = '接続しています…';
      try {
        const result = await CloudSync.connect({ url: $('#sync-url').value, key: $('#sync-key').value, secret: secret === null ? undefined : secret });
        await afterSyncReload();
        toast(result === 'created' ? '合言葉を登録して、同期をはじめました' : 'クラウドと同期しました');
        history.replaceState(null, '', '#/sync');
        renderSync();
      } catch (err) {
        toast(err.message || '接続できませんでした');
        btn.disabled = false;
        btn.textContent = on ? '設定を更新して同期' : '接続して同期をはじめる';
      }
    });
    const now = $('#sync-now');
    if (now) now.addEventListener('click', async () => {
      now.disabled = true;
      try { await CloudSync.syncNow(); await afterSyncReload(); toast('クラウドの最新と一致しています'); }
      catch (err) { toast(err.message || '同期できませんでした'); }
      renderSync();
    });
    const off = $('#sync-off');
    if (off) off.addEventListener('click', async () => {
      if (!(await confirmDialog('この端末の同期をやめますか？\n端末内のデータとクラウドのデータはどちらも消えません。', 'やめる', true))) return;
      await CloudSync.disconnect();
      toast('この端末の同期をやめました');
      renderSync();
    });
    const copy = $('#sync-copy');
    if (copy) copy.addEventListener('click', async () => toast((await copyText(shareLink())) ? 'リンクをコピーしました' : 'コピーできませんでした'));
    const qrBox = $('#sync-qr');
    if (qrBox) loadQrLib().then(() => {
      const qr = window.qrcode(0, 'M');
      qr.addData(shareLink());
      qr.make();
      qrBox.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    }).catch(() => { qrBox.hidden = true; });
  }

  async function afterSyncReload() {
    await loadRecipes();
    await loadCategories();
    await loadPlans();
  }

  /* ---------- AIレシピ貼り付け ---------- */
  function openPasteModal(onApply) {
    const canRead = !!(navigator.clipboard && navigator.clipboard.readText && window.isSecureContext);
    const m = openModal(`
      <div class="modal-head">
        <h2 class="modal-title">${ICON.spark}AIレシピ貼り付け</h2>
        <button class="icon-btn" data-close aria-label="閉じる">${ICON.close}</button>
      </div>
      <ol class="howto">
        <li><button type="button" class="link-btn" id="copy-prompt">ChatGPT用の依頼文をコピー</button>して、ChatGPTに貼り付けます</li>
        <li>整理された結果をコピーして、下の欄に貼り付けます</li>
        <li>「読み込んで入力」を押すと、各項目へ自動で振り分けます</li>
      </ol>
      <textarea id="paste-area" class="input textarea paste-area" rows="10" placeholder="【料理名】…&#10;【カテゴリ】…&#10;【調理時間】…&#10;【材料】…&#10;【作り方】…&#10;【メモ】…"></textarea>
      <div class="paste-tools">
        ${canRead ? '<button type="button" class="link-btn" id="paste-clip">クリップボードから貼り付け</button>' : ''}
        <button type="button" class="link-btn" id="paste-sample">記入例を入れる</button>
        <button type="button" class="link-btn" id="paste-clear">クリア</button>
      </div>
      <details class="format">
        <summary>貼り付けの形式</summary>
        <pre>${esc(RecipeParser.TEMPLATE)}</pre>
        <p class="muted">見出しは【】のほか「料理名：」「## 材料」などでも読み取れます。材料は「材料名：分量」、作り方は番号付きで1行ずつ書いてください。</p>
      </details>
      <p class="paste-note">※ すでに入力されている項目は、読み取れた内容で上書きされます</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>キャンセル</button>
        <button class="btn btn-primary" id="paste-apply">読み込んで入力</button>
      </div>`);
    const area = $('#paste-area', m.el);
    $('#copy-prompt', m.el).addEventListener('click', async () => {
      toast((await copyText(RecipeParser.CHATGPT_PROMPT.replace(RecipeParser.CATEGORIES.join('・'), state.categories.join('・')))) ? '依頼文をコピーしました。ChatGPTに貼り付けてください' : 'コピーできませんでした');
    });
    const clip = $('#paste-clip', m.el);
    if (clip) clip.addEventListener('click', async () => {
      try { area.value = await navigator.clipboard.readText(); } catch (e) { toast('貼り付けできませんでした。欄を長押しして貼り付けてください'); }
    });
    $('#paste-sample', m.el).addEventListener('click', () => { area.value = RecipeParser.TEMPLATE; });
    $('#paste-clear', m.el).addEventListener('click', () => { area.value = ''; area.focus(); });
    $('#paste-apply', m.el).addEventListener('click', () => {
      const text = area.value.trim();
      if (!text) { toast('テキストを貼り付けてください'); return; }
      const parsed = RecipeParser.parse(text, { categories: state.categories });
      if (!parsed.found.length) { toast('形式を読み取れませんでした。【料理名】などの見出しを確認してください'); return; }
      m.close();
      onApply(parsed);
    });
  }

  /* ---------- バックアップ ---------- */
  function exportBackup() {
    const data = JSON.stringify({ app: 'recipe-note', version: 1, exportedAt: new Date().toISOString(), categories: state.categories, plans: state.plans, recipes: state.recipes });
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `recipe-note-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('バックアップを書き出しました');
  }

  async function importBackup(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let recipes, cats = [], json;
    try {
      json = JSON.parse(await file.text());
      recipes = Array.isArray(json) ? json : json.recipes;
      if (json && Array.isArray(json.categories)) cats = json.categories.filter(c => typeof c === 'string' && c && !RESERVED.includes(c));
      if (!Array.isArray(recipes)) throw new Error();
    } catch (err) { toast('バックアップファイルを読み込めませんでした'); return; }
    if (!(await confirmDialog(`${recipes.length}件のレシピを読み込みます。\n同じレシピは上書きされます。`, '読み込む'))) return;
    for (const r of recipes) {
      if (!r || !r.title) continue;
      await RecipeDB.put({
        id: r.id || uid(), title: String(r.title), subtitle: r.subtitle || '', category: r.category || '',
        time: r.time ?? '', servings: r.servings || '', ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
        steps: Array.isArray(r.steps) ? r.steps : [], memo: r.memo || '', photo: r.photo || '',
        favorite: !!r.favorite, createdAt: r.createdAt || Date.now(), updatedAt: r.updatedAt || Date.now(),
        ...(Array.isArray(r.sources) && r.sources.length ? { sources: r.sources.filter(x => typeof x === 'string') } : {}),
      });
    }
    // バックアップ側のカテゴリは、今の並び順を保ったまま足りない分だけ後ろに追加する
    // 献立：バックアップ側にしかない料理を日付ごとに足す
    if (json && json.plans && typeof json.plans === 'object' && !Array.isArray(json.plans)) {
      for (const [date, p] of Object.entries(json.plans)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !p || !Array.isArray(p.items)) continue;
        const have = new Set(planItems(date).map(x => x.recipeId));
        const extra = p.items.filter(x => x && typeof x.recipeId === 'string' && !have.has(x.recipeId)).map(x => ({ id: x.id || uid(), recipeId: x.recipeId }));
        if (extra.length) await savePlan(date, planItems(date).concat(extra));
      }
    }
    const missing = cats.filter(c => !state.categories.includes(c));
    if (missing.length) { state.categories = state.categories.concat(missing); await saveCategories(); }
    await loadRecipes();
    await loadCategories();
    renderList();
    toast('バックアップを読み込みました');
  }

  /* ---------- 起動 ---------- */
  async function start() {
    try {
      await RecipeDB.ready;
      await CloudSync.init();
      // 端末内にデータがあれば待たずに表示し、同期は表示後に裏で行う（データが空の初回だけ待つ）
      if (CloudSync.configured() && !(await RecipeDB.getMeta('sync-last')) && !(await RecipeDB.keys()).length) {
        app.innerHTML = '<p class="boot">Recipe Note<small>クラウドから最新のデータを読み込んでいます…</small></p>';
        try {
          await Promise.race([CloudSync.syncNow(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
          // クラウドにレシピがあれば、この端末で初期サンプルを入れ直さない（重複防止）
          const cloud = CloudSync.status().cloud;
          if (cloud && cloud.recipes > 0) await RecipeDB.setMeta('seeded', true);
        } catch (e) {
          state.offlineStart = true; // つながらないときは端末内の写しで表示し、つながったら自動で最新にする
          console.warn(e);
        }
      }
      await seedIfFirstRun();
      await importAddedRecipes();
      await loadRecipes();
      await loadCategories();
      await loadPlans();
    } catch (err) {
      app.innerHTML = `<section class="page"><div class="empty"><p>データを読み込めませんでした。<br>プライベートブラウズでは保存できない場合があります。</p></div></section>`;
      console.error(err);
      return;
    }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    window.addEventListener('hashchange', route);
    CloudSync.onChange(onCloudChange);
    document.addEventListener('visibilitychange', async () => {
      // 画面ONは他アプリへ切り替えると解除されるため、戻ってきたら掛け直す
      const wake = $('#wake-btn');
      if (document.visibilityState === 'visible' && wake && wake.classList.contains('is-on') === false && state.wakeLock && state.wakeLock.released) {
        try { state.wakeLock = await navigator.wakeLock.request('screen'); wake.classList.add('is-on'); } catch (e) { /* 無視 */ }
      }
    });
    route();
    // 同梱レシピの取り込みなど、起動中に出た変更を送る
    if (CloudSync.configured()) CloudSync.syncNow().catch(e => console.warn(e));
    if (state.offlineStart) toast('オフラインのため端末内のデータを表示しています');
    embedLocalImages().then(n => { if (n) toast(`${n}件のレシピの写真をクラウドに保存しました`); }).catch(e => console.warn(e));
    if ('serviceWorker' in navigator && location.protocol !== 'file:' && window.isSecureContext) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  start();
})();
