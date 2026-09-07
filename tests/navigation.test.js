import test from 'node:test';
import assert from 'node:assert/strict';
import { openManager, popupContext } from '../navigation.js';
import { defaults } from '../core.js';

function fixture() {
  const tabs = [
    { id: 1, windowId: 1, url: 'https://search.bilibili.com/all', title: 'B 站搜索', active: true, groupId: 7 },
    { id: 2, windowId: 1, url: 'https://www.bilibili.com/video/1', groupId: 7 },
    { id: 3, windowId: 1, url: 'https://www.bilibili.com/video/1', groupId: 7 },
    { id: 4, windowId: 2, url: 'chrome-extension://test/index.html', active: true }
  ];
  const created = [], focused = [];
  const api = {
    runtime: { getURL: path => `chrome-extension://test/${path}` },
    tabs: {
      query: async ({ windowId, active }) => tabs.filter(t => (windowId === undefined || t.windowId === windowId) && (active === undefined || !!t.active === active)),
      create: async props => { created.push(props); tabs.push({ id: 100, ...props }); },
      update: async (id, props) => focused.push({ id, ...props })
    },
    tabGroups: { query: async () => [{ id: 7, title: 'BILIBILI' }] }
  };
  return { api, tabs, created, focused };
}
test('reading popup context never opens a page and reports only the requested window', async () => {
  const f = fixture();
  const result = await popupContext(f.api, 1);
  assert.equal(result.tabCount, 3); assert.equal(result.siteCount, 1); assert.equal(result.duplicateCount, 2);
  assert.deepEqual(new Set(result.ids), new Set([1, 2, 3])); assert.equal(result.eligibleCount, 3);
  assert.equal(result.categoryCount, 1); assert.equal(result.windowCount, 1);
  assert.equal(f.created.length, 0); assert.equal(f.focused.length, 0);
});
test('explicit manager navigation opens in the source window and reuses it on the next click', async () => {
  const f = fixture();
  await openManager(f.api, 1);
  assert.deepEqual(f.created, [{ windowId: 1, url: 'chrome-extension://test/index.html' }]);
  await openManager(f.api, 1);
  assert.equal(f.created.length, 1); assert.deepEqual(f.focused, [{ id: 100, active: true }]);
  await openManager(f.api, 2); assert.equal(f.created.length, 1); assert.equal(f.focused.at(-1).id, 4);
});
test('an empty window has no eligible tabs but management stays available', async () => {
  const f = fixture();
  const result = await popupContext(f.api, 2);
  assert.equal(result.eligibleCount, 0); assert.deepEqual(result.ids, []); assert.equal(result.tabCount, 0);
  await assert.rejects(() => openManager(f.api, undefined)); assert.equal(f.created.length, 0);
});

test('bulk popup includes inactive tabs even when the active page is internal', async () => {
  const f = fixture();
  f.tabs[0].url = 'chrome://settings';
  f.tabs[1].pinned = true;
  const result = await popupContext(f.api, 1);
  assert.equal(result.tabCount, 3); assert.equal(result.eligibleCount, 1); assert.deepEqual(result.ids, [3]);
});

test('all-window scope includes each normal window, excludes the manager and skips pins', async () => {
  const f = fixture();
  f.tabs.push({ id: 5, windowId: 2, url: 'https://x.com' }, { id: 6, windowId: 2, url: 'https://x.com/home', pinned: true });
  const current = await popupContext(f.api, 1);
  const all = await popupContext(f.api, 1, { ...defaults, scope: 'all' });
  assert.equal(current.tabCount, 3); assert.equal(all.tabCount, 5);
  assert.equal(all.eligibleCount, 4); assert.equal(all.windowCount, 2);
  assert.deepEqual(new Set(all.ids), new Set([1, 2, 3, 5]));
});


test('popup current page uses the source window and preserves rule priority under all-window scope', async () => {
  const f = fixture(), rules = { 'bilibili.com': { title: '视频' }, 'host:search.bilibili.com': { title: '搜索' }, 'page:https://search.bilibili.com/all': { title: '收藏' } };
  const context = await popupContext(f.api, 1, { ...defaults, scope: 'all' }, rules);
  assert.equal(context.page.tabId, 1); assert.equal(context.page.rule.title, '收藏');
  assert.equal(context.page.targets.host, 'search.bilibili.com'); assert.equal(context.page.supported, true);
  f.tabs[0].pinned = true;
  assert.equal((await popupContext(f.api, 1)).page.supported, false);
  f.tabs[0].pinned = false; f.tabs[0].url = 'chrome://settings';
  const internal = (await popupContext(f.api, 1)).page;
  assert.equal(internal.supported, false); assert.deepEqual(internal.targets, {});
  const empty = await popupContext(f.api, 99);
  assert.equal(empty.page.supported, false); assert.equal(empty.page.tabId, undefined);
});
