import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRule, ruleTarget, ruleEntries, setRule } from '../rules.js';
import { labelFor } from '../labels.js';

test('page > exact host > root domain > default, including legacy saved domains', () => {
  const rules = { 'x.com': { title: '社交', color: 'blue' } };
  setRule(rules, 'https://api.x.com/search', 'host', { title: 'API' });
  setRule(rules, 'https://api.x.com/1234/lalala?a=1#part', 'page', { title: '收藏' });
  const saved = JSON.parse(JSON.stringify(rules));
  assert.equal(labelFor('https://api.x.com/1234/lalala?a=1#part', saved).title, '收藏');
  for (const url of ['https://api.x.com/1234/lalala?a=2#part', 'https://api.x.com/1234/lalala?a=1', 'http://api.x.com/1234/lalala?a=1#part', 'https://api.x.com/other']) assert.equal(labelFor(url, saved).title, 'API');
  assert.equal(labelFor('https://x.com/home', saved).title, '社交');
  assert.equal(labelFor('https://nested.api.x.com/search', saved).title, '社交');
  assert.equal(labelFor('https://notx.com/search', saved).title, 'NOTX');
  assert.equal(labelFor('https://api.x.com.evil.net/search', saved).title, 'EVIL');
  delete saved['page:https://api.x.com/1234/lalala?a=1#part'];
  assert.equal(labelFor('https://api.x.com/1234/lalala?a=1#part', saved).title, 'API');
  delete saved['host:api.x.com'];
  assert.equal(labelFor('https://api.x.com/search', saved).title, '社交');
  delete saved['x.com'];
  assert.equal(labelFor('https://api.x.com/search', saved).title, 'X');
});

test('rule targets normalize hosts, use PSL roots, deduplicate and preserve URL detail', () => {
  assert.equal(ruleTarget('https://Search.Example.co.uk/path', 'domain').target, 'example.co.uk');
  assert.equal(ruleTarget('https://Search.Example.co.uk:8443/path', 'host').target, 'search.example.co.uk');
  assert.equal(ruleTarget('https://x.com/One?q=Two#Three', 'page').target, 'https://x.com/One?q=Two#Three');
  const rules = {};
  setRule(rules, 'https://a.x.com/a', 'domain', { title: '旧名称' });
  setRule(rules, 'https://b.x.com/b', 'domain', { title: '新名称' });
  assert.equal(ruleEntries(rules).length, 1);
  assert.equal(matchRule('https://x.com', rules).title, '新名称');
  for (const url of ['chrome://settings', 'file:///a', 'invalid']) assert.throws(() => setRule(rules, url, 'page', { title: '测试' }));
  assert.throws(() => setRule(rules, 'https://x.com', 'invalid', { title: '测试' }));
  assert.throws(() => setRule(rules, 'https://x.com', 'domain', { title: ' ' }));
});
