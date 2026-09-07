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
    assert.equal(local.siteRules['bilibili.com'].title, '视频'); assert.equal(session.assignments[2].manual, true);
    const popupSender = { id: 'unit-test', url: 'chrome-extension://unit-test/popup.html' };
    const popupSend = message => new Promise(resolve => f.api.runtime.onMessage.listeners[0](message, popupSender, resolve));
    const bulkContext = await popupSend({ type: 'popup-context', windowId: 1 });
    assert.equal(bulkContext.eligibleCount, 2);
    const organized = await popupSend({ type: 'organize', ids: bulkContext.ids });
    assert.deepEqual(organized.errors, []); assert.equal(organized.count, 2);
    assert.equal(f.tabs[0].groupId, f.tabs[1].groupId);
    assert.equal(f.groups.find(g => g.id === f.tabs[0].groupId).title, '视频');
    let answered = false;
    f.api.runtime.onMessage.listeners[0]({ type: 'pet-assign' }, { ...sender, id: 'foreign-extension' }, () => { answered = true; });
    assert.equal(answered, false);
  } finally { globalThis.chrome = previousChrome; }
});
