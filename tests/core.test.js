import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, domainOf, siteName, duplicateIds, buildPlan, groupTabs } from '../core.js';
import { organize } from '../organizer.js';

const tab = (id, url, extra = {}) => ({ id, url, windowId: 1, index: id, pinned: false, ...extra });
test('domain matching merges subdomains using PSL, preserves IPs and excludes internal URLs', () => {
  assert.equal(domainOf('https://www.Example.com/a?q=b'), 'example.com');
  assert.equal(domainOf('https://search.bilibili.com/all'), 'bilibili.com');
  assert.equal(domainOf('https://docs.example.co.uk/a'), 'example.co.uk');
  assert.equal(domainOf('https://news.example.com.cn/a'), 'example.com.cn');
  assert.equal(domainOf('https://alice.github.io'), 'alice.github.io');
  assert.equal(domainOf('https://bob.github.io'), 'bob.github.io');
  assert.equal(domainOf('http://localhost:4173/'), 'localhost');
  assert.equal(domainOf('http://192.168.5.1/'), '192.168.5.1');
  for (const url of ['chrome://settings', 'file:///a', 'bad url', undefined]) assert.equal(domainOf(url), null);
});
test('website names omit public suffixes without changing custom names', () => {
  assert.equal(siteName('x.com'), 'X');
  assert.equal(siteName('bilibili.com'), 'BILIBILI');
  assert.equal(siteName('example.co.uk'), 'EXAMPLE');
  assert.equal(siteName('alice.github.io'), 'ALICE');
  assert.equal(siteName('192.168.5.1'), '192.168.5.1');
});
test('duplicates retain query, fragment and protocol differences', () => {
  const items = ['https://a.com/?p=1', 'https://a.com/?p=1', 'https://a.com/?p=2', 'https://a.com/?p=1#x', 'http://a.com/?p=1', 'chrome://newtab', 'chrome://newtab'].map((url, i) => tab(i, url));
  assert.deepEqual([...duplicateIds(items)], [0, 1]);
});
test('plans stay within windows and exclude pinned, internal and unselected tabs', () => {
  const items = [tab(1, 'https://a.com/z'), tab(2, 'https://a.com/a'), tab(3, 'https://a.com', { windowId: 2 }), tab(4, 'https://a.com', { pinned: true }), tab(5, 'chrome://newtab'), tab(6, 'https://b.com')];
  assert.deepEqual(buildPlan(items, [1, 2, 3, 4, 5], defaults), [{ windowId: 1, domain: 'a.com', ids: [2, 1] }, { windowId: 2, domain: 'a.com', ids: [3] }]);
});
test('pending navigation is used for classification and search data', () => {
  assert.equal(groupTabs([tab(1, 'https://old.com', { pendingUrl: 'https://new.com' })])[0].domain, 'new.com');
});
test('organizer rechecks tab state, skips newly pinned pages, reports partial failure', async () => {
  const items = [tab(1, 'https://a.com'), tab(2, 'https://b.com'), tab(3, 'https://c.com')];
  const calls = [];
  const api = {
    tabs: {
      query: async query => query.windowId ? items.map(t => ({ ...t, pinned: t.id === 1 })) : items,
      move: async () => {},
      group: async data => { calls.push(data); if (data.tabIds.includes(2)) throw new Error('Tab closed'); return 99; }
    },
    tabGroups: { query: async () => [], update: async (id, data) => calls.push({ id, ...data }) }
  };
  const result = await organize(api, [1, 2, 3], defaults);
  assert.equal(result.count, 1); assert.equal(result.grouped, 1); assert.equal(result.errors.length, 1);
  assert.ok(calls.every(call => !call.tabIds?.includes(1)));
  assert.equal(calls.at(-1).title, 'C');
});

test('organizer explicitly orders URLs before creating each native group', async () => {
  const items = [tab(1, 'https://a.com/z'), tab(2, 'https://a.com/a')], moved = [];
  const api = { tabs: { query: async () => items, move: async (id, options) => { assert.equal(options.index, -1); moved.push(id); }, group: async ({ tabIds }) => { assert.deepEqual(moved, tabIds); return 10; } }, tabGroups: { query: async () => [], update: async () => {} } };
  const result = await organize(api, [1, 2], defaults);
  assert.deepEqual(moved, [2, 1]); assert.equal(result.count, 2);
});
