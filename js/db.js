/* 端末内保存。写真も含めて保存するため IndexedDB を使い、
   使えない環境（一部ブラウザの file:// やプライベートモード）では localStorage → メモリの順に切り替える */
(function () {
  const DB_NAME = 'recipe-note';
  const DB_VERSION = 1;
  const STORE = 'recipes';
  const META = 'meta';

  function openIDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window) || !window.indexedDB) { reject(new Error('no indexedDB')); return; }
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
      const timer = setTimeout(() => reject(new Error('indexedDB timeout')), 4000);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      req.onsuccess = () => { clearTimeout(timer); resolve(req.result); };
      req.onerror = () => { clearTimeout(timer); reject(req.error); };
      req.onblocked = () => { clearTimeout(timer); reject(new Error('indexedDB blocked')); };
    });
  }

  function idbBackend(db) {
    const tx = (storeName, mode, fn) => new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      let result;
      const r = fn(t.objectStore(storeName));
      if (r) r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
    return {
      mode: 'indexeddb',
      all: () => tx(STORE, 'readonly', s => s.getAll()).then(list => list || []),
      get: id => tx(STORE, 'readonly', s => s.get(id)),
      put: recipe => tx(STORE, 'readwrite', s => s.put(recipe)),
      remove: id => tx(STORE, 'readwrite', s => s.delete(id)),
      getMeta: key => tx(META, 'readonly', s => s.get(key)),
      setMeta: (key, value) => tx(META, 'readwrite', s => s.put(value, key)),
    };
  }

  /* localStorage が使えればそこへ、だめならメモリだけ（閉じると消える） */
  function simpleBackend() {
    const KEY = 'recipe-note-data';
    let ls = null;
    try { localStorage.setItem('__rn', '1'); localStorage.removeItem('__rn'); ls = localStorage; } catch (e) { ls = null; }
    let data = { recipes: {}, meta: {} };
    try { if (ls) data = JSON.parse(ls.getItem(KEY)) || data; } catch (e) { /* 壊れていたら空から */ }
    const save = () => {
      if (!ls) return;
      try { ls.setItem(KEY, JSON.stringify(data)); }
      catch (e) { throw new Error('保存容量がいっぱいです'); }
    };
    const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
    return {
      mode: ls ? 'localstorage' : 'memory',
      all: async () => Object.values(data.recipes).map(clone),
      get: async id => clone(data.recipes[id]),
      put: async r => { data.recipes[r.id] = clone(r); save(); },
      remove: async id => { delete data.recipes[id]; save(); },
      getMeta: async k => data.meta[k],
      setMeta: async (k, v) => { data.meta[k] = v; save(); },
    };
  }

  let backend = null;
  const ready = openIDB().then(idbBackend).catch(() => simpleBackend()).then(b => { backend = b; return b; });
  const call = name => (...args) => ready.then(b => b[name](...args));

  window.RecipeDB = {
    ready,
    get mode() { return backend ? backend.mode : 'loading'; },
    all: call('all'),
    get: call('get'),
    put: call('put'),
    remove: call('remove'),
    getMeta: call('getMeta'),
    setMeta: call('setMeta'),
  };
})();
