// Bridge between the interface and the Rust backend (Tauri commands + events).
(() => {
  const T = window.__TAURI__;
  const call = (cmd, args) => T.core.invoke(cmd, args || {});
  window.nf = {
    get: () => call('lib_get'),
    addDialog: () => call('lib_add_dialog'),
    addPaths: (paths) => call('lib_add_paths', { paths }),
    scan: () => call('lib_scan'),
    connect: (indexes) => call('lib_connect', { indexes }),
    launch: (id) => call('game_launch', { id }),
    update: (id, patch) => call('game_update', { id, patch }),
    remove: (id) => call('game_remove', { id }),
    showFile: (id) => call('game_show_file', { id }),
    searchArt: (q) => call('art_search', { q }),
    applyArt: (id, appid, name) => call('art_apply', { id, appid, name }),
    refetchArt: (id) => call('art_refetch', { id }),
    customArt: (id, kind) => call('art_custom', { id, kind }),
    screenshots: (since) => call('stats_screenshots', { since: Math.floor(since) }),
    settings: () => call('app_settings'),
    set: (key, val) => call('app_set', { key, val }),
    testPresence: () => call('presence_test'),
    details: (id) => call('details_get', { id }),
    colCreate: (name, gameId) => call('col_create', { name, gameId: gameId || null }),
    colRename: (id, name) => call('col_rename', { id, name }),
    colDelete: (id) => call('col_delete', { id }),
    colToggle: (id, gameId) => call('col_toggle', { id, gameId }),
    owned: (force) => call('owned_get', { force: !!force }),
    openStore: (uri) => call('owned_open', { uri }),
    openLink: (url) => call('open_link', { url }),
    friends: (force) => call('friends_get', { force: !!force }),
    imageData: (src) => call('image_data', { src }),
    saveCard: (pngBase64, name) => call('save_card', { pngBase64, name }),
    checkUpdate: () => call('update_check'),
    installUpdate: () => call('update_install'),
    onChange: (cb) => T.event.listen('lib:changed', (e) => cb(e.payload)),
    onDrag: (handlers) => {
      T.event.listen('tauri://drag-enter', () => handlers.enter());
      T.event.listen('tauri://drag-leave', () => handlers.leave());
      T.event.listen('tauri://drag-drop', (e) => handlers.drop((e.payload && e.payload.paths) || []));
    },
    win: T.window.getCurrentWindow(),
  };
})();
