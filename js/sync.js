/* クラウド同期（Supabase を正本にする）
   ・正しいデータは常に Supabase 側。端末内（IndexedDB）は表示を速くするための写し
   ・開くたび／戻ってくるたび／10秒ごと／リアルタイム通知のたびに、クラウドの一覧（rn_manifest）と照らし合わせ、
     違うものだけ取り寄せて（rn_get）端末内をクラウドと同じ状態にそろえる
   ・変更はすぐ送信（rn_push）。送れなかったものは「未送信」として残し、つながったら送り直す
   ・送信したら Supabase Realtime で「変わったよ」と通知 → ほかの端末がすぐ取りに行く
   ・RecipeDB の put / remove / setMeta を包むので、既存の保存処理はそのまま同期される */
(function () {
  const LS_KEY = 'rn-cloud';
  const SYNCED_META = new Set(['categories']);
  const REALTIME_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  const raw = {
    put: RecipeDB.put, remove: RecipeDB.remove, get: RecipeDB.get, all: RecipeDB.all,
    getMeta: RecipeDB.getMeta, setMeta: RecipeDB.setMeta,
  };

  let stamps = {};   // 'kind:id' -> 端末内の写しの更新時刻（クラウドと同じなら最新）
  let outbox = {};   // 'kind:id' -> まだクラウドへ送れていない変更の時刻
  let tombs = {};    // 削除されたレシピID -> 料理名（同梱レシピ・サンプルの復活防止）
  let loaded = false;
  let applying = false;
  let pushTimer = null;
  let refreshTimer = null;
  let pollTimer = null;
  let busy = null;
  let again = false;
  let lastSync = 0;
  let lastError = '';
  let cloudCount = null;   // { recipes, plans }
  const realtime = { state: 'off', client: null, channel: null };
  const listeners = [];

  /* ---------- 設定 ---------- */
  // 接続設定は localStorage と IndexedDB の両方に保存する（片方が消えても残るように）
  let idbConfig = null;
  let draft = {};   // 接続に失敗したときも、入力したURL・キーは残しておく
  function readConfig() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { saved = {}; }
    if (!saved.secret && idbConfig && idbConfig.secret) saved = idbConfig;
    const def = window.RN_CLOUD_CONFIG || {};
    return {
      url: extractUrl(saved.url || draft.url || def.url || ''),
      key: extractKey(saved.key || draft.key || def.anonKey || ''),
      secret: String(saved.secret || ''),
    };
  }
  function writeConfig(c) {
    idbConfig = { ...c };
    try { localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch (e) { /* 保存できない環境 → IndexedDB 側に残る */ }
    raw.setMeta('cloud-config', c).catch(() => {});
  }
  const configured = () => { const c = readConfig(); return !!(c.url && c.key && c.secret); };

  // Supabase の画面からコピーした文字に余計なもの（/rest/v1/、NEXT_PUBLIC_SUPABASE_URL= など）が付いていても取り出す
  function extractUrl(text) {
    const s = String(text || '').trim();
    const m = s.match(/https:\/\/[a-z0-9-]+\.supabase\.(co|in)/i) || s.match(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i);
    if (m) return m[0].toLowerCase();
    return s.replace(/\/(rest|auth|realtime|storage)\/v1.*$/i, '').replace(/\/+$/, '');
  }
  function extractKey(text) {
    const s = String(text || '').trim();
    const m = s.match(/sb_publishable_[A-Za-z0-9_-]+/) || s.match(/sb_secret_[A-Za-z0-9_-]+/) || s.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    return m ? m[0] : s.replace(/^[A-Z_]+=/, '').replace(/^["']|["']$/g, '');
  }
  function keyProblem(key) {
    if (!key) return 'キーを入力してください';
    if (/^sb_secret_/.test(key)) return 'secret key は使えません。「Publishable key」（sb_publishable_ で始まるもの）を入れてください';
    if (/^eyJ/.test(key)) {
      try {
        const p = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (p.role === 'service_role') return 'service_role key は使えません。「Publishable key」（または anon key）を入れてください';
      } catch (e) { /* 判定できなければ通す */ }
      return '';
    }
    if (!/^sb_publishable_/.test(key)) return 'キーの形が違います。「Publishable key」（sb_publishable_ で始まるもの）をコピーしてください';
    return '';
  }

  /* ---------- Supabase 呼び出し ---------- */
  async function rpc(fn, body, cfg = readConfig()) {
    const headers = { 'Content-Type': 'application/json', apikey: cfg.key };
    if (/^eyJ/.test(cfg.key)) headers.Authorization = `Bearer ${cfg.key}`; // 旧形式（anon）キー
    let res;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 20000) : null;
    try {
      res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
    } catch (e) {
      throw new Error('ネットワークにつながりません');
    } finally {
      if (timer) clearTimeout(timer);
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }
    if (!res.ok) {
      const msg = (json && (json.message || json.hint)) || text || res.statusText;
      if (/invalid secret/.test(msg)) throw new Error('合言葉が違います');
      if (/secret too short/.test(msg)) throw new Error('合言葉は8文字以上にしてください');
      if (res.status === 404 || /Could not find the function|PGRST202/.test(msg)) throw new Error('Supabaseで setup.sql（最新版）を実行してください');
      if (res.status === 401 || /Invalid API key|No API key/i.test(msg)) throw new Error('URLまたはキーが正しくありません');
      throw new Error(`同期できませんでした（${res.status}）`);
    }
    return json;
  }

  /* ---------- 端末内の記録 ---------- */
  async function load() {
    if (loaded) return;
    stamps = (await raw.getMeta('sync-stamps')) || {};
    outbox = (await raw.getMeta('sync-outbox')) || {};
    tombs = (await raw.getMeta('sync-tombs')) || {};
    lastSync = (await raw.getMeta('sync-last')) || 0;
    loaded = true;
  }
  const saveState = () => Promise.all([
    raw.setMeta('sync-stamps', stamps), raw.setMeta('sync-outbox', outbox), raw.setMeta('sync-tombs', tombs),
  ]);

  async function mark(kind, id, ts) {
    await load();
    const key = `${kind}:${id}`;
    const t = ts || Math.max(Date.now(), (stamps[key] || 0) + 1);
    stamps[key] = t;
    outbox[key] = t;
    await saveState();
    schedulePush();
  }

  /* ---------- 献立（端末内は meta 'plans' に { 日付: { items } } で保存） ---------- */
  async function getPlans() { return (await raw.getMeta('plans')) || {}; }
  async function writePlan(date, items) {
    const plans = await getPlans();
    if (items && items.length) plans[date] = { items };
    else delete plans[date];
    await raw.setMeta('plans', plans);
  }

  /* ---------- RecipeDB を包む ---------- */
  // opts.imported：同梱レシピ・サンプルの取り込み。クラウドに同じもの（や削除済みの記録）があればクラウドを優先する
  RecipeDB.put = async (recipe, opts = {}) => {
    await raw.put(recipe);
    if (!applying) {
      await load();
      if (!opts.imported) delete tombs[recipe.id];
      await mark('recipe', recipe.id, opts.imported ? 1 : undefined);
    }
  };
  RecipeDB.remove = async id => {
    const old = applying ? null : await raw.get(id);
    await raw.remove(id);
    if (!applying) {
      await load();
      tombs[id] = (old && old.title) || '?';
      await mark('recipe', id);
    }
  };
  RecipeDB.setMeta = async (k, v) => {
    await raw.setMeta(k, v);
    if (!applying && SYNCED_META.has(k)) await mark('meta', k);
  };
  RecipeDB.getPlans = getPlans;
  RecipeDB.setPlan = async (date, items) => {
    await writePlan(date, items);
    await mark('plan', date);
  };
  RecipeDB.isDeleted = id => !!tombs[id];

  /* ---------- 送信 ---------- */
  async function buildItem(key, ts) {
    const i = key.indexOf(':');
    const kind = key.slice(0, i), id = key.slice(i + 1);
    if (kind === 'recipe') {
      const rec = await raw.get(id);
      if (rec) return { kind, id, data: rec, deleted: false, updated_at: ts };
      return { kind, id, data: { title: tombs[id] || '' }, deleted: true, updated_at: ts };
    }
    let data = null;
    if (kind === 'meta') { const v = await raw.getMeta(id); data = v === undefined || v === null ? null : { value: v }; }
    else if (kind === 'plan') { const p = (await getPlans())[id]; data = p && p.items && p.items.length ? { items: p.items } : null; }
    return { kind, id, data, deleted: data === null, updated_at: ts };
  }

  async function push() {
    const keys = Object.keys(outbox);
    if (!keys.length) return 0;
    const items = [];
    for (const k of keys) items.push(await buildItem(k, outbox[k]));
    // 写真入りのレシピもあるので、1回の送信を約1MBまでに分ける
    let batch = [], size = 0, sent = 0;
    const flush = async () => {
      if (!batch.length) return;
      await rpc('rn_push', { p_secret: readConfig().secret, p_items: batch });
      for (const it of batch) {
        const key = `${it.kind}:${it.id}`;
        if (outbox[key] === it.updated_at) delete outbox[key];
      }
      sent += batch.length;
      batch = []; size = 0;
      await saveState();
    };
    for (const it of items) {
      const s = JSON.stringify(it).length;
      if (batch.length && size + s > 1000000) await flush();
      batch.push(it); size += s;
    }
    await flush();
    if (sent) notifyOthers();
    return sent;
  }

  /* ---------- 受信（クラウドの1件を端末内へ反映） ---------- */
  async function applyRow(row) {
    const key = `${row.kind}:${row.id}`;
    const ts = Number(row.updated_at) || 0;
    if (outbox[key] && outbox[key] > ts) return false;   // こちらの未送信の変更のほうが新しい
    applying = true;
    try {
      if (row.kind === 'recipe') {
        if (row.deleted || !row.data) { await raw.remove(row.id); tombs[row.id] = (row.data && row.data.title) || '?'; }
        else { await raw.put({ ...row.data, id: row.id }); delete tombs[row.id]; }
      } else if (row.kind === 'meta') {
        if (!row.deleted && row.data && SYNCED_META.has(row.id)) await raw.setMeta(row.id, row.data.value);
      } else if (row.kind === 'plan') {
        await writePlan(row.id, row.deleted || !row.data ? [] : row.data.items || []);
      }
    } finally {
      applying = false;
    }
    stamps[key] = ts;
    if (outbox[key] && outbox[key] <= ts) delete outbox[key];
    return true;
  }

  /* ---------- 照合：端末内をクラウドと同じ状態にそろえる ---------- */
  async function refresh() {
    const secret = readConfig().secret;
    const manifest = (await rpc('rn_manifest', { p_secret: secret })) || [];
    const localRecipes = new Set((await raw.all()).map(r => r.id));
    const localPlans = await getPlans();
    const cloudKeys = new Set();
    const need = [];
    for (const m of manifest) {
      const key = `${m.kind}:${m.id}`;
      cloudKeys.add(key);
      const ts = Number(m.updated_at) || 0;
      if (outbox[key] && outbox[key] > ts) continue;
      // 端末内の状態がクラウドと食い違っていたら（ないはずのものがある／あるはずのものがない）取り寄せ直す
      const missing = m.kind === 'recipe' ? (!m.deleted) !== localRecipes.has(m.id)
        : m.kind === 'plan' ? (!m.deleted) !== !!localPlans[m.id] : false;
      if ((stamps[key] || 0) !== ts || missing) need.push({ kind: m.kind, id: m.id });
    }
    let changed = 0;
    for (let i = 0; i < need.length; i += 8) {
      const rows = (await rpc('rn_get', { p_secret: secret, p_keys: need.slice(i, i + 8) })) || [];
      for (const row of rows) if (await applyRow(row)) changed++;
    }
    // クラウドにないもの（未送信を除く）は端末内からも消す
    applying = true;
    try {
      for (const id of localRecipes) {
        const key = `recipe:${id}`;
        if (cloudKeys.has(key) || outbox[key]) continue;
        await raw.remove(id);
        delete stamps[key];
        changed++;
      }
      const plansNow = await getPlans();
      let plansChanged = false;
      for (const d of Object.keys(plansNow)) {
        const key = `plan:${d}`;
        if (cloudKeys.has(key) || outbox[key]) continue;
        delete plansNow[d];
        delete stamps[key];
        plansChanged = true;
      }
      if (plansChanged) { await raw.setMeta('plans', plansNow); changed++; }
    } finally {
      applying = false;
    }
    // クラウドにまだカテゴリ一覧がなければ、この端末のものを送る
    if (!cloudKeys.has('meta:categories') && !outbox['meta:categories'] && Array.isArray(await raw.getMeta('categories'))) {
      outbox['meta:categories'] = stamps['meta:categories'] = Date.now();
    }
    await saveState();
    cloudCount = {
      recipes: manifest.filter(m => m.kind === 'recipe' && !m.deleted).length,
      plans: manifest.filter(m => m.kind === 'plan' && !m.deleted).length,
    };
    return changed;
  }

  /* ---------- この端末を初めてクラウドにつなぐとき（既存データの移行） ---------- */
  const norm = t => String(t || '').replace(/[\s　]/g, '');
  async function pullAll(onRow) {
    let since = 0;
    for (;;) {
      const rows = (await rpc('rn_pull', { p_secret: readConfig().secret, p_since: since, p_limit: 200 })) || [];
      for (const row of rows) {
        onRow(row);
        await applyRow(row);
        since = Math.max(since, Number(row.rev) || 0);
      }
      if (rows.length < 200) break;
    }
  }

  async function join() {
    const cfg = readConfig();
    const local = await raw.all();
    const localCats = await raw.getMeta('categories');
    const localPlans = await getPlans();
    // つなぐ前の記録は、この端末で削除したレシピだけを残す（それ以外は下で付け直す）
    const keepDeleted = {};
    for (const [k, t] of Object.entries(outbox)) if (k.startsWith('recipe:') && tombs[k.slice(7)]) keepDeleted[k] = t;
    outbox = { ...keepDeleted };
    stamps = { ...keepDeleted };
    // この端末で一度も編集していないもの（取り込んだだけの同梱レシピなど）はクラウド側を優先する
    for (const r of local) {
      const key = `recipe:${r.id}`;
      const edited = Number(r.updatedAt) > Number(r.createdAt);
      outbox[key] = stamps[key] = edited ? Number(r.updatedAt) : 1;
    }
    for (const d of Object.keys(localPlans)) outbox[`plan:${d}`] = stamps[`plan:${d}`] = 1;
    if (Array.isArray(localCats)) outbox['meta:categories'] = stamps['meta:categories'] = 1;

    const cloudRecipes = new Map();
    const cloudDeleted = new Map();
    let cloudCats = null;
    const cloudPlans = {};
    await pullAll(row => {
      if (row.kind === 'recipe' && !row.deleted && row.data) { cloudRecipes.set(row.id, row.data); cloudDeleted.delete(row.id); }
      if (row.kind === 'recipe' && row.deleted) { cloudDeleted.set(row.id, row.data && row.data.title); cloudRecipes.delete(row.id); }
      if (row.kind === 'meta' && row.id === 'categories' && row.data) cloudCats = row.data.value;
      if (row.kind === 'plan' && !row.deleted && row.data) cloudPlans[row.id] = row.data.items || [];
    });

    // ・別の端末で削除済みのレシピは、この端末からも消す
    // ・別の端末で入った初期サンプルなど、IDが違うだけの同じ料理は1つにまとめる（クラウド側を残す）
    const cloudTitles = new Set([...cloudRecipes.values()].map(r => norm(r.title)));
    const deletedTitles = new Set([...cloudDeleted.values()].filter(Boolean).map(norm));
    for (const r of local) {
      const dropDeleted = cloudDeleted.has(r.id);
      const dropDuplicate = !cloudRecipes.has(r.id) && (cloudTitles.has(norm(r.title)) || deletedTitles.has(norm(r.title)));
      if (!dropDeleted && !dropDuplicate) continue;
      if (!(await raw.get(r.id))) continue;
      await raw.remove(r.id);
      if (dropDeleted) tombs[r.id] = r.title || '?';
      delete outbox[`recipe:${r.id}`];
      if (!dropDeleted) delete stamps[`recipe:${r.id}`];
    }
    // カテゴリはクラウドの並び順に、こちらにしかないものを後ろに足す
    if (Array.isArray(cloudCats) && Array.isArray(localCats)) {
      const extra = localCats.filter(c => !cloudCats.includes(c));
      if (extra.length) { await raw.setMeta('categories', cloudCats.concat(extra)); outbox['meta:categories'] = stamps['meta:categories'] = Date.now(); }
      else delete outbox['meta:categories'];
    }
    // 献立は同じ日付なら両方の料理を合わせる
    for (const d of Object.keys(localPlans)) {
      if (!cloudPlans[d]) continue;
      const have = new Set(cloudPlans[d].map(x => x.recipeId));
      const extra = (localPlans[d].items || []).filter(x => !have.has(x.recipeId));
      if (extra.length) { await writePlan(d, cloudPlans[d].concat(extra)); outbox[`plan:${d}`] = stamps[`plan:${d}`] = Date.now(); }
      else delete outbox[`plan:${d}`];
    }
    await saveState();
    await push();
    await raw.setMeta('sync-joined', cfg.url);
  }

  /* ---------- 同期の実行 ---------- */
  function emit(info) { listeners.forEach(fn => { try { fn(info); } catch (e) { console.error(e); } }); }

  // 送信 → 照合。実行中にもう一度呼ばれたら、終わったあとにもう1回だけ実行する
  async function syncNow() {
    if (!configured()) return { changed: 0 };
    if (busy) { again = true; return busy; }
    busy = (async () => {
      await load();
      let changed = 0;
      try {
        do {
          again = false;
          if ((await raw.getMeta('sync-joined')) !== readConfig().url) { await join(); changed++; }
          await push();
          changed += await refresh();
          if (Object.keys(outbox).length) await push();
        } while (again);
        lastSync = Date.now();
        lastError = '';
        await raw.setMeta('sync-last', lastSync);
      } catch (e) {
        lastError = e.message || String(e);
        throw e;
      } finally {
        emit({ changed, error: lastError });
      }
      return { changed };
    })();
    try { return await busy; } finally { busy = null; }
  }

  function schedulePush() {
    if (!configured()) { emit({ changed: 0 }); return; }
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { syncNow().catch(() => {}); }, 150);
  }
  function scheduleRefresh(ms) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { syncNow().catch(() => {}); }, ms);
  }

  function startPolling() {
    clearInterval(pollTimer);
    if (!configured()) return;
    pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') syncNow().catch(() => {});
    }, 10000);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && configured()) syncNow().catch(() => {});
  });
  window.addEventListener('focus', () => { if (configured()) scheduleRefresh(100); });
  window.addEventListener('online', () => { if (configured()) syncNow().catch(() => {}); });

  /* ---------- リアルタイム通知（Supabase Realtime の Broadcast） ---------- */
  // 合言葉から作った名前のチャンネルに「変わった」とだけ送る（データ自体は流さない）
  function channelName() {
    const c = readConfig();
    let h = 2166136261;
    for (const ch of `${c.url}|${c.secret}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return `recipe-note-${h.toString(36)}`;
  }
  function loadRealtimeLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = REALTIME_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('realtime library'));
      document.head.appendChild(s);
    });
  }
  async function startRealtime() {
    stopRealtime();
    if (!configured()) return;
    realtime.state = 'connecting';
    try {
      await loadRealtimeLib();
      const c = readConfig();
      realtime.client = window.supabase.createClient(c.url, c.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      realtime.channel = realtime.client.channel(channelName(), { config: { broadcast: { self: false } } });
      realtime.channel.on('broadcast', { event: 'changed' }, () => scheduleRefresh(200));
      realtime.channel.subscribe(status => {
        realtime.state = status === 'SUBSCRIBED' ? 'on' : status === 'CLOSED' ? 'off' : 'error';
        if (status === 'SUBSCRIBED') scheduleRefresh(100);
        emit({ changed: 0 });
      });
    } catch (e) {
      realtime.state = 'error';
      emit({ changed: 0 });
    }
  }
  function stopRealtime() {
    try { if (realtime.client && realtime.channel) realtime.client.removeChannel(realtime.channel); } catch (e) { /* 無視 */ }
    realtime.client = null; realtime.channel = null; realtime.state = 'off';
  }
  function notifyOthers() {
    if (realtime.channel && realtime.state === 'on') {
      try { realtime.channel.send({ type: 'broadcast', event: 'changed', payload: { at: Date.now() } }); } catch (e) { /* 定期確認で拾う */ }
    }
  }

  /* ---------- 接続・切断 ---------- */
  async function connect(cfg) {
    // 合言葉を空欄のまま「更新」したときは、保存済みの合言葉を使う
    const c = { url: extractUrl(cfg.url), key: extractKey(cfg.key), secret: String(cfg.secret === undefined ? readConfig().secret : cfg.secret) };
    draft = { url: c.url, key: c.key };
    raw.setMeta('cloud-draft', draft).catch(() => {});
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(c.url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(c.url)) {
      throw new Error('Project URL は「https://（英数字）.supabase.co」の形です。Supabase の画面からコピーし直してください');
    }
    const kp = keyProblem(c.key);
    if (kp) throw new Error(kp);
    if (c.secret.length < 8) throw new Error('合言葉は8文字以上にしてください');
    const result = await rpc('rn_setup', { p_secret: c.secret }, c);
    await rpc('rn_manifest', { p_secret: c.secret }, c); // 最新の setup.sql が実行済みか確認
    writeConfig(c);
    shareToServer(c);
    await syncNow();
    startPolling();
    startRealtime();
    return result; // 'created'（合言葉を新しく登録）／'ok'
  }

  // PC（start.bat）で配信しているときは、URLとキーを js/cloud-config.js に保存してもらう
  // → iPhone・iPad では URL・キーが最初から入り、合言葉だけで接続できる（合言葉は送らない）
  function shareToServer(c) {
    fetch('__cloud-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: c.url, key: c.key }) }).catch(() => {});
  }

  /* ---------- 接続診断（どこで止まっているかを1つずつ確かめる） ---------- */
  async function diagnose(form = {}) {
    // 画面の入力欄に入っている値（まだ接続していなくても）で確かめる
    const saved = readConfig();
    const c = { url: form.url !== undefined ? extractUrl(form.url) : saved.url, key: form.key !== undefined ? extractKey(form.key) : saved.key, secret: saved.secret };
    const steps = [];
    const add = (name, ok, detail) => steps.push({ name, ok, detail });
    add('この画面のアドレス', true, location.origin);
    const urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(c.url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(c.url);
    add('Project URL', urlOk, c.url || '未入力');
    const kp = keyProblem(c.key);
    add('Publishable key', !kp, kp || `${c.key.slice(0, 18)}…`);
    add('合言葉', c.secret.length >= 8, c.secret ? `この端末に保存済み（${c.secret.length}文字）` : 'この端末には未保存（接続が完了していません）');
    if (urlOk && !kp) {
      try {
        await rpc('rn_manifest', { p_secret: '__connection_check__' }, c);
        add('Supabase の関数（setup.sql）', false, '想定外の応答です');
      } catch (e) {
        if (e.message === '合言葉が違います') add('Supabase への接続・setup.sql', true, 'つながりました（関数も見つかりました）');
        else add('Supabase への接続', false, e.message);
      }
    }
    if (configured()) {
      try {
        const man = (await rpc('rn_manifest', { p_secret: c.secret })) || [];
        add('合言葉の確認', true, 'クラウドと一致しました');
        add('クラウドのデータ', true, `レシピ ${man.filter(m => m.kind === 'recipe' && !m.deleted).length}件・献立 ${man.filter(m => m.kind === 'plan' && !m.deleted).length}日分`);
      } catch (e) {
        add('合言葉の確認', false, e.message);
      }
    }
    add('この端末のデータ', true, `レシピ ${(await raw.all()).length}件・献立 ${Object.keys(await getPlans()).length}日分`);
    add('最後に同期できた時刻', !!lastSync && !lastError, lastSync ? new Date(lastSync).toLocaleString('ja-JP') : 'まだ一度も同期していません');
    if (lastError) add('直近のエラー', false, lastError);
    add('未送信の変更', !Object.keys(outbox).length || !configured(), `${Object.keys(outbox).length}件`);
    add('リアルタイム通知', realtime.state === 'on', { on: 'オン', connecting: '接続中', error: '使えません（10秒ごとの確認で反映）', off: 'オフ' }[realtime.state] || realtime.state);
    return steps;
  }

  async function disconnect() {
    clearInterval(pollTimer);
    stopRealtime();
    const c = readConfig();
    writeConfig({ url: c.url, key: c.key, secret: '' });
    await raw.setMeta('sync-joined', null);
  }

  window.CloudSync = {
    configured,
    config: () => { const c = readConfig(); return { url: c.url, key: c.key, hasSecret: !!c.secret }; },
    status: () => ({ lastSync, lastError, pending: Object.keys(outbox).length, cloud: cloudCount, realtime: realtime.state }),
    init: async () => {
      await load();
      idbConfig = (await raw.getMeta('cloud-config')) || null;
      draft = (await raw.getMeta('cloud-draft')) || {};
      // localStorage だけ消えていたら IndexedDB 側から戻す
      if (idbConfig && idbConfig.secret) { try { if (!localStorage.getItem(LS_KEY)) localStorage.setItem(LS_KEY, JSON.stringify(idbConfig)); } catch (e) { /* 無視 */ } }
      if (configured()) { startPolling(); startRealtime(); }
    },
    diagnose,
    parseUrl: extractUrl,
    parseKey: extractKey,
    syncNow,
    connect,
    disconnect,
    onChange: fn => listeners.push(fn),
  };
})();
