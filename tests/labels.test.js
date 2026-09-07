import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../core.js';
import { labelFor, autoGroupTab, assignLabel } from '../labels.js';
import { organize } from '../organizer.js';

function fixture(initial = [], initialGroups = []) {
  const tabs = initial.map((tab, index) => ({ windowId: 1, index, pinned: false, groupId: -1, ...tab }));
  const groups = initialGroups.map(g => ({ windowId: 1, color: 'green', collapsed: false, ...g }));
  let next = 100;
  const moves = [], joins = [];
  function get(id) { const tab = tabs.find(t => t.id === id); if (!tab) throw new Error('No tab'); return tab; }
  const api = {
    tabs: {
      get: async id => ({ ...get(id) }),
      query: async q => tabs.filter(t => q.windowId === undefined || t.windowId === q.windowId).map(t => ({ ...t })),
      move: async id => { moves.push(id); const t = get(id); t.index = tabs.length; },
      group: async options => {
        joins.push(options);
        let group = groups.find(g => g.id === options.groupId);
        if (!group && options.groupId !== undefined) throw new Error('No group');
        if (!group) { group = { id: next++, windowId: options.createProperties.windowId, title: '', color: 'grey' }; groups.push(group); }
        for (const id of options.tabIds) { const t = get(id); assert.equal(t.pinned, false); assert.equal(t.windowId, group.windowId); t.groupId = group.id; }
        return group.id;
      }
    },
    tabGroups: {
      query: async q => groups.filter(g => q.windowId === undefined || g.windowId === q.windowId).map(g => ({ ...g })),
      get: async id => { const group = groups.find(g => g.id === id); if (!group) throw new Error('No group'); return { ...group }; },
      update: async (id, data) => { const group = groups.find(g => g.id === id); if (!group) throw new Error('No group'); Object.assign(group, data); return { ...group }; }
    },
    windows: { get: async () => ({ type: 'normal' }) }
  };
  return { api, tabs, groups, moves, joins };
}
test('new subdomain tabs reuse a site group with a short title; repeated events are idempotent', async () => {
  const f = fixture([{ id: 1, url: 'https://www.bilibili.com' }, { id: 2, url: 'https://search.bilibili.com' }]);
  const state = {};
  await autoGroupTab(f.api, 1, defaults, {}, state);
  await autoGroupTab(f.api, 2, defaults, {}, state);
  await autoGroupTab(f.api, 2, defaults, {}, JSON.parse(JSON.stringify(state)));
  assert.equal(f.groups.length, 1); assert.equal(f.groups[0].title, 'BILIBILI');
  assert.equal(f.tabs[0].groupId, f.tabs[1].groupId); assert.equal(f.joins.length, 2);
});
test('same display name on different domains never merges', async () => {
  const f = fixture([{ id: 1, url: 'https://example.com' }, { id: 2, url: 'https://example.net' }]);
  await autoGroupTab(f.api, 1, defaults); await autoGroupTab(f.api, 2, defaults);
  assert.equal(f.groups.length, 2); assert.ok(f.groups.every(g => g.title === 'EXAMPLE'));
  assert.notEqual(f.tabs[0].groupId, f.tabs[1].groupId);
});

for (const remember of [false, true]) test(`adding APIDANCE to X preserves the destination for new X tabs (remember=${remember})`, async () => {
  const f = fixture([{ id: 1, url: 'https://x.com/home' }, { id: 2, url: 'https://alphapro.apidance.pro/commonfollow' }, { id: 3, url: 'https://x.com/explore' }]);
  const rules = {}, state = {};
  await autoGroupTab(f.api, 1, defaults, rules, state);
  const originalGroupId = f.tabs[0].groupId;
  await assignLabel(f.api, 2, { mode: 'existing', groupId: originalGroupId, remember }, defaults, rules, state);
  // Restoring session data must not lose a mixed group's website identity.
  const restoredState = JSON.parse(JSON.stringify(state));
  await autoGroupTab(f.api, 3, defaults, rules, restoredState);
  await autoGroupTab(f.api, 1, defaults, rules, restoredState);
  await autoGroupTab(f.api, 2, defaults, rules, restoredState);
  assert.equal(f.groups.length, 1);
  assert.ok(f.tabs.every(tab => tab.groupId === originalGroupId));
  assert.equal(f.groups[0].title, 'X');
  assert.equal(restoredState[2].manual, !remember);
});

test('mixed groups do not attract unrelated websites with the same display name', async () => {
  const f = fixture([{ id: 1, url: 'https://example.net', groupId: 8 }, { id: 2, url: 'https://x.com', groupId: 8 }, { id: 3, url: 'https://example.com' }], [{ id: 8, title: 'EXAMPLE' }]);
  await autoGroupTab(f.api, 3, defaults);
  assert.equal(f.groups.length, 2);
  assert.notEqual(f.tabs[2].groupId, 8);
});

test('bulk organizing reuses a mixed site group and keeps its manually added members', async () => {
  const f = fixture([{ id: 1, url: 'https://x.com/home', groupId: 8 }, { id: 2, url: 'https://apidance.pro', groupId: 8 }, { id: 3, url: 'https://x.com/explore' }], [{ id: 8, title: 'X' }]);
  const result = await organize(f.api, [1, 3], defaults);
  assert.deepEqual(result.errors, []);
  assert.equal(result.grouped, 1);
  assert.equal(f.groups.length, 1);
  assert.ok(f.tabs.every(tab => tab.groupId === 8));
});
test('legacy domain titles are reused and renamed to short website names', async () => {
  const f = fixture([{ id: 1, url: 'https://search.bilibili.com', groupId: 8 }, { id: 2, url: 'https://bilibili.com' }], [{ id: 8, title: 'search.bilibili.com' }]);
  await autoGroupTab(f.api, 2, defaults);
  assert.equal(f.groups.length, 1); assert.equal(f.groups[0].title, 'BILIBILI'); assert.equal(f.tabs[1].groupId, 8);
});
test('automatic groups remain inside the tab window', async () => {
  const f = fixture([{ id: 1, url: 'https://x.com', groupId: 9 }, { id: 2, url: 'https://x.com', windowId: 2 }], [{ id: 9, title: 'X' }]);
  await autoGroupTab(f.api, 2, defaults);
  assert.notEqual(f.tabs[1].groupId, 9); assert.equal(f.groups.at(-1).windowId, 2);
});
test('new blank tab is grouped when its URL arrives, while pinned and closed tabs are skipped', async () => {
  const f = fixture([{ id: 1, url: 'chrome://newtab/' }, { id: 2, url: 'https://x.com', pinned: true }]);
  for (const id of [1, 2, 99]) assert.equal((await autoGroupTab(f.api, id, defaults)).skipped, true);
  f.tabs[0].url = 'https://x.com/home'; await autoGroupTab(f.api, 1, defaults);
  assert.equal(f.groups[0].title, 'X'); assert.equal(f.tabs[1].groupId, -1);
});
test('disabled automation has no mutation; active new tabs are never collapsed', async () => {
  const f = fixture([{ id: 1, url: 'https://x.com', active: true }]);
  await autoGroupTab(f.api, 1, { ...defaults, autoGroup: false }); assert.equal(f.joins.length, 0);
  await autoGroupTab(f.api, 1, { ...defaults, collapse: true }); assert.equal(f.groups[0].collapsed, false);
});
test('managed tabs follow cross-site navigation but preserve manual groups and manual ungrouping', async () => {
  const f = fixture([{ id: 1, url: 'https://x.com' }]), state = {};
  await autoGroupTab(f.api, 1, defaults, {}, state);
  f.tabs[0].url = 'https://bilibili.com'; await autoGroupTab(f.api, 1, defaults, {}, state);
  assert.equal(f.groups.find(g => g.id === f.tabs[0].groupId).title, 'BILIBILI');
  f.tabs[0].groupId = -1;
  await autoGroupTab(f.api, 1, defaults, {}, state); await autoGroupTab(f.api, 1, defaults, {}, state);
  assert.equal(f.tabs[0].groupId, -1);
  f.groups.push({ id: 8, windowId: 1, title: '稍后看' }); f.tabs[0].groupId = 8;
  await autoGroupTab(f.api, 1, defaults, {}, state); assert.equal(f.tabs[0].groupId, 8);
});
test('create label remembers the site; future tabs reuse custom label and restore it after closing', async () => {
  const f = fixture([{ id: 1, url: 'https://search.bilibili.com' }, { id: 2, url: 'https://www.bilibili.com' }]), rules = {}, state = {};
  await assignLabel(f.api, 1, { mode: 'create', title: '视频', color: 'purple', remember: true }, defaults, rules, state);
  assert.deepEqual(rules['bilibili.com'], { title: '视频', color: 'purple' });
  await autoGroupTab(f.api, 2, defaults, rules, state); assert.equal(f.groups.length, 1);
  f.groups.length = 0; f.tabs[1].groupId = -1;
  await autoGroupTab(f.api, 2, defaults, JSON.parse(JSON.stringify(rules)), {});
  assert.equal(f.groups[0].title, '视频'); assert.equal(f.groups[0].color, 'purple');
});
test('manual label selection without remember persists for that tab and does not create a site rule', async () => {
  const f = fixture([{ id: 1, url: 'https://x.com' }], [{ id: 7, title: '阅读' }]), rules = {}, state = {};
  await assignLabel(f.api, 1, { mode: 'existing', groupId: 7, remember: false }, defaults, rules, state);
  await autoGroupTab(f.api, 1, defaults, rules, state);
  assert.equal(f.tabs[0].groupId, 7); assert.deepEqual(rules, {});
});
test('manual assignment validates name, pinned state, cross-window destination and navigation races', async () => {
  const f = fixture([{ id: 1, url: 'https://x.com' }], [{ id: 7, title: '工作', windowId: 2 }]);
  for (const request of [{ mode: 'create', title: '  ' }, { mode: 'create', title: 'a'.repeat(61) }, { mode: 'existing', groupId: 7 }, { mode: 'create', title: '工作', expectedDomain: 'bilibili.com' }]) await assert.rejects(() => assignLabel(f.api, 1, request, defaults, {}, {}));
  f.tabs[0].pinned = true;
  await assert.rejects(() => assignLabel(f.api, 1, { mode: 'create', title: '工作' }, defaults, {}, {}));
  assert.equal(f.joins.length, 0);
});
test('bulk organizing merges subdomains and honors remembered custom labels', async () => {
  const f = fixture([{ id: 1, url: 'https://search.bilibili.com' }, { id: 2, url: 'https://www.bilibili.com' }]);
  const result = await organize(f.api, [1, 2], defaults, { 'bilibili.com': { title: '视频', color: 'pink' } });
  assert.deepEqual(result.errors, []); assert.equal(result.grouped, 1); assert.equal(result.count, 2); assert.equal(f.groups[0].title, '视频');
  assert.deepEqual(labelFor('x.com').title, 'X');
});

test('multiple websites sharing a remembered label count as one native group', async () => {
  const f = fixture([{ id: 1, url: 'https://x.com' }, { id: 2, url: 'https://bilibili.com' }]);
  const result = await organize(f.api, [1, 2], defaults, { 'x.com': { title: '娱乐' }, 'bilibili.com': { title: '娱乐' } });
  assert.equal(result.grouped, 1); assert.equal(f.groups.length, 1);
});

test('active tab joining an existing collapsed label expands it', async () => {
  const f = fixture([{ id: 1, url: 'https://x.com', groupId: 8 }, { id: 2, url: 'https://x.com/home', active: true }], [{ id: 8, title: 'X', collapsed: true }]);
  await autoGroupTab(f.api, 2, defaults); assert.equal(f.groups[0].collapsed, false);
});

test('background serializes simultaneous new-tab events and routes pet requests to sender tab', async () => {
  const f = fixture([{ id: 1, url: 'https://www.bilibili.com' }, { id: 2, url: 'https://search.bilibili.com' }]);
  const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });
  for (const name of ['onCreated', 'onUpdated', 'onAttached', 'onRemoved', 'onReplaced']) f.api.tabs[name] = event();
  const session = {}, local = {};
  const storage = data => ({ get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, structuredClone(data[k])])), set: async patch => { Object.assign(data, structuredClone(patch)); } });
  f.api.storage = { local: storage(local), session: storage(session), onChanged: event() };
  f.api.runtime = { id: 'unit-test', getURL: path => `chrome-extension://unit-test/${path}`, onMessage: event(), onInstalled: event() };
  f.api.action = { onClicked: event() };
  const previousChrome = globalThis.chrome;
  globalThis.chrome = f.api;
  try {
    await import('../background.js');
    f.api.tabs.onCreated.listeners[0]({ id: 1 }); f.api.tabs.onCreated.listeners[0]({ id: 2 });
    const sender = { id: 'unit-test', frameId: 0, tab: { id: 2, windowId: 1 }, url: 'https://search.bilibili.com/' };
    const send = message => new Promise(resolve => f.api.runtime.onMessage.listeners[0](message, sender, resolve));
    const context = await send({ type: 'pet-context' });
    assert.equal(f.groups.length, 1); assert.equal(context.siteName, 'BILIBILI');
    assert.equal(context.groups[0].title, 'BILIBILI');
    const result = await send({ type: 'pet-assign', mode: 'create', title: '视频', remember: true, color: 'pink', tabId: 1 });
    assert.equal(result.title, '视频'); assert.notEqual(f.tabs[0].groupId, f.tabs[1].groupId);
    assert.equal(local.siteRules['bilibili.com'].title, '视频'); assert.equal(session.assignments[2].manual, false);
    const popupSender = { id: 'unit-test', url: 'chrome-extension://unit-test/popup.html' };
    const popupSend = message => new Promise(resolve => f.api.runtime.onMessage.listeners[0](message, popupSender, resolve));
    const bulkContext = await popupSend({ type: 'popup-context', windowId: 1 });
    assert.equal(bulkContext.eligibleCount, 2);
    const organized = await popupSend({ type: 'organize', ids: bulkContext.ids });
    assert.deepEqual(organized.errors, []); assert.equal(organized.count, 2);
    assert.equal(f.tabs[0].groupId, f.tabs[1].groupId);
    assert.equal(f.groups.find(g => g.id === f.tabs[0].groupId).title, '视频');
    const selectedTabs = f.tabs.map(tab => ({ id: tab.id, url: tab.url }));
    const savedHosts = await popupSend({ type: 'save-rules', tabs: selectedTabs, ruleScope: 'host', title: '接口', color: 'blue' });
    assert.equal(savedHosts.saved, 2); assert.equal(savedHosts.count, 2);
    assert.equal(local.siteRules['host:search.bilibili.com'].title, '接口');
    const savedPage = await popupSend({ type: 'save-rules', tabs: [selectedTabs[1]], ruleScope: 'page', title: '收藏', color: 'pink' });
    assert.equal(savedPage.saved, 1);
    await popupSend({ type: 'save-rules', tabs: selectedTabs, ruleScope: 'domain', title: '通用', color: 'green' });
    assert.equal(f.groups.find(g => g.id === f.tabs[0].groupId).title, '接口');
    assert.equal(f.groups.find(g => g.id === f.tabs[1].groupId).title, '收藏');
    const rulesBeforeRace = structuredClone(local.siteRules);
    const stale = await popupSend({ type: 'save-rules', tabs: [selectedTabs[0], { id: 2, url: 'https://search.bilibili.com/old' }], ruleScope: 'domain', title: '不应保存' });
    assert.ok(stale.error); assert.deepEqual(local.siteRules, rulesBeforeRace);
    await popupSend({ type: 'update-rule', key: 'host:www.bilibili.com', title: '新接口', color: 'blue' });
    assert.equal(local.siteRules['host:www.bilibili.com'].title, '新接口');
    await popupSend({ type: 'delete-rule', domain: 'page:https://search.bilibili.com/' });
    assert.equal(local.siteRules['page:https://search.bilibili.com/'], undefined);
    await popupSend({ type: 'organize', ids: [1, 2] });
    assert.equal(f.groups.find(g => g.id === f.tabs[0].groupId).title, '新接口');
    assert.equal(f.groups.find(g => g.id === f.tabs[1].groupId).title, '接口');
    let answered = false;
    f.api.runtime.onMessage.listeners[0]({ type: 'pet-assign' }, { ...sender, id: 'foreign-extension' }, () => { answered = true; });
    assert.equal(answered, false);
  } finally { globalThis.chrome = previousChrome; }
});


test('navigation within one root follows host and page rules even after manual assignment', async () => {
  const f = fixture([{ id: 1, url: 'https://x.com/home' }]), rules = {}, state = {};
  await assignLabel(f.api, 1, { mode: 'create', title: '社交', remember: true, ruleScope: 'domain' }, defaults, rules, state);
  rules['host:api.x.com'] = { title: '接口', color: 'blue' };
  rules['page:https://api.x.com/saved'] = { title: '收藏', color: 'pink' };
  for (const [url, title] of [['https://api.x.com/search', '接口'], ['https://api.x.com/saved', '收藏'], ['https://x.com/home', '社交']]) {
    f.tabs[0].url = url; await autoGroupTab(f.api, 1, defaults, rules, state);
    assert.equal(f.groups.find(g => g.id === f.tabs[0].groupId).title, title);
  }
});

test('saving a less specific rule preserves the more specific winning destination', async () => {
  const f = fixture([{ id: 1, url: 'https://api.x.com/saved' }]);
  const rules = { 'page:https://api.x.com/saved': { title: '收藏' } };
  const result = await assignLabel(f.api, 1, { mode: 'create', title: '社交', remember: true, ruleScope: 'domain' }, defaults, rules, {});
  assert.equal(rules['x.com'].title, '社交');
  assert.equal(result.title, '收藏'); assert.equal(result.overridden, true);
  assert.equal(f.groups.length, 1);
});

test('exact page saves reject same-domain navigation since the pet context was read', async () => {
  const f = fixture([{ id: 1, url: 'https://x.com/changed' }]), rules = {};
  await assert.rejects(() => assignLabel(f.api, 1, { mode: 'create', title: '收藏', remember: true, ruleScope: 'page', expectedUrl: 'https://x.com/original' }, defaults, rules, {}));
  assert.deepEqual(rules, {}); assert.equal(f.joins.length, 0);
});

test('bulk organization splits a root by winning rules and shares labels across roots', async () => {
  const f = fixture([{ id: 1, url: 'https://x.com/home' }, { id: 2, url: 'https://api-dance.com/home' }, { id: 3, url: 'https://api.x.com/search' }, { id: 4, url: 'https://search.api-dance.com/search' }, { id: 5, url: 'https://x.com/1234/lalala' }, { id: 6, url: 'https://x.com/home', windowId: 2 }]);
  const rules = { 'x.com': { title: '社交' }, 'api-dance.com': { title: '社交' }, 'host:api.x.com': { title: '接口' }, 'host:search.api-dance.com': { title: '接口' }, 'page:https://x.com/1234/lalala': { title: '收藏' } };
  const result = await organize(f.api, f.tabs.map(t => t.id), defaults, rules);
  assert.deepEqual(result.errors, []); assert.equal(result.count, 6); assert.equal(result.grouped, 4);
  assert.equal(f.tabs[0].groupId, f.tabs[1].groupId); assert.equal(f.tabs[2].groupId, f.tabs[3].groupId);
  assert.notEqual(f.tabs[0].groupId, f.tabs[2].groupId); assert.notEqual(f.tabs[0].groupId, f.tabs[5].groupId);
  assert.equal(f.groups.find(g => g.id === f.tabs[4].groupId).title, '收藏');
});


test('a same-root navigation during automatic grouping cannot use the previous page rule', async () => {
  const f = fixture([{ id: 1, url: 'https://x.com/saved' }]);
  const get = f.api.tabs.get; let reads = 0;
  f.api.tabs.get = async id => { if (++reads === 2) f.tabs[0].url = 'https://x.com/other'; return get(id); };
  const result = await autoGroupTab(f.api, 1, defaults, { 'page:https://x.com/saved': { title: '收藏' } });
  assert.equal(result.skipped, true); assert.equal(f.joins.length, 0);
});

test('bulk grouping rechecks URL rules after moving tabs', async () => {
  const f = fixture([{ id: 1, url: 'https://x.com/saved' }]);
  f.api.tabs.move = async () => { f.tabs[0].url = 'https://x.com/other'; };
  const result = await organize(f.api, [1], defaults, { 'page:https://x.com/saved': { title: '收藏' } });
  assert.equal(result.count, 0); assert.equal(f.joins.length, 0);
});
