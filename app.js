import { defaults, domainOf, siteName, duplicateIds, groupTabs, buildPlan, colorFor } from './core.js';
import { demoTabs } from './demo.js';

const $ = id => document.getElementById(id);
const live = !!globalThis.chrome?.tabs?.query;
const palette = { green: ['#719468', '#eef3e8'], blue: ['#668abb', '#eef2f9'], purple: ['#9981b5', '#f2edf8'], cyan: ['#62a19d', '#eaf6f3'], orange: ['#c29966', '#faf3e8'], pink: ['#bf859b', '#faeef3'] };
let settings = { ...defaults }, tabs = [], view = 'all', chosenDomain = null, search = '', windowId = 1, ownId;
let loading = false, refreshTimer, toastTimer, refreshGeneration = 0, saveQueue = Promise.resolve();
let pendingIds = [], collapsed = new Set(), siteRules = {}, nativeGroups = [];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 14000 : 5000);
}
async function safe(action) {
  try { await action(); }
  catch (error) { toast(`操作未完成：${error.message}`, true); }
}
function scoped() { return tabs.filter(t => settings.scope === 'all' || t.windowId === windowId); }
function visible() {
  const items = scoped(), dupes = duplicateIds(items);
  return items.filter(tab => {
    const url = tab.pendingUrl || tab.url || '';
    return (view !== 'duplicates' || dupes.has(tab.id)) && (view !== 'pinned' || tab.pinned) &&
      (!chosenDomain || (domainOf(url) || '浏览器与本地页面') === chosenDomain) &&
      (!search || `${tab.title || ''} ${url}`.toLowerCase().includes(search));
  });
}
function saveSettings() {
  const snapshot = { ...settings };
  saveQueue = saveQueue.catch(() => {}).then(() => live ? chrome.storage.local.set({ settings: snapshot }) : localStorage.setItem('tab-grove-settings', JSON.stringify(snapshot)));
  safe(() => saveQueue);
  if (!live) saveQueue.then(() => window.dispatchEvent(new Event('tab-grove-demo-settings'))).catch(() => {});
  render();
}
async function refresh() {
  const generation = ++refreshGeneration;
  if (live) {
    const own = await chrome.tabs.getCurrent();
    windowId = own.windowId;
    ownId = own.id;
    const found = await chrome.tabs.query({ windowType: 'normal' });
    if (generation !== refreshGeneration) return;
    tabs = found.filter(tab => tab.id !== ownId && !tab.url?.startsWith(chrome.runtime.getURL('')));
    nativeGroups = await chrome.tabGroups.query({});
  }
  render();
}
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => safe(refresh), 180);
}
function setView(next, domain = null) {
  view = next; chosenDomain = domain;
  render();
}
function theme(node, domain) {
  const [accent, tint] = palette[colorFor(domain)];
  node.style.setProperty('--accent', accent); node.style.setProperty('--tint', tint);
}
function render() {
  const items = scoped(), dupes = duplicateIds(items), groups = groupTabs(items, settings);
  $('stat-tabs').textContent = $('nav-all').textContent = items.length;
  $('stat-domains').textContent = groups.filter(g => g.domain !== '浏览器与本地页面').length;
  $('stat-duplicates').textContent = $('nav-duplicates').textContent = dupes.size;
  $('nav-pinned').textContent = items.filter(t => t.pinned).length;
  $('domain-count').textContent = groups.length;
  $('scope').value = settings.scope; $('sort').value = settings.sort;
  $('collapse-groups').checked = settings.collapse;
  $('auto-group').checked = settings.autoGroup; $('pet-enabled').checked = settings.petEnabled;
  $('auto-badge').textContent = settings.autoGroup ? '● 新网页自动归组' : '○ 自动归组已关闭';
  renderRules();
  document.querySelectorAll('[data-view]').forEach(node => { const active = node.dataset.view === view && !chosenDomain; node.classList.toggle('active', active); node.setAttribute('aria-current', active ? 'page' : 'false'); });
  const names = { all: '全部标签页', duplicates: '重复网址', pinned: '固定标签页' };
  $('breadcrumb-title').textContent = siteName(chosenDomain) || names[view];
  $('list-title').textContent = siteName(chosenDomain) || (view === 'all' ? '按网站浏览' : names[view]);
  $('page-subtitle').textContent = view === 'duplicates' ? '完整网址相同的页面放在一起；关闭前可以逐个查看。' : view === 'pinned' ? '常用网页留在手边，固定标签页不会参与分组。' : '按网站聚在一起，找回你的浏览节奏。';
  $('domain-nav').replaceChildren(...groups.map(group => {
    const button = el('button', `domain-button${chosenDomain === group.domain ? ' selected' : ''}`);
    theme(button, group.domain);
    button.append(el('span', 'dot'), el('span', 'domain-name', siteName(group.domain)), el('b', '', group.tabs.length));
    button.title = group.domain;
    button.onclick = () => setView('all', chosenDomain === group.domain ? null : group.domain);
    return button;
  }));
  const filtered = visible(), shown = groupTabs(filtered, settings);
  $('result-count').textContent = `${shown.length} 个分类 · ${filtered.length} 个标签页`;
  const plan = buildPlan(items, filtered.map(t => t.id), settings);
  $('organize').disabled = loading || !plan.length;
  $('organize').textContent = loading ? '正在整理…' : '▥  一键按域名分组';
  $('collapse-all').disabled = !shown.length;
  $('collapse-all').textContent = shown.length && shown.every(g => collapsed.has(g.domain)) ? '展开全部' : '收起全部';
  $('groups').replaceChildren(...shown.map(group => renderGroup(group, dupes)));
  if (!shown.length) {
    const empty = el('div', 'empty');
    empty.append(el('b', '', search ? '没有找到匹配的网页' : view === 'duplicates' ? '没有重复网址，清清爽爽。' : '这里暂时没有标签页'), el('p', '', search ? '试试更短的标题、域名，或切换到全部标签页。' : '可以切换窗口范围，或打开几个网页后再回来。'));
    $('groups').append(empty);
  }
}
function renderGroup(group, dupes) {
  const details = el('details', 'site-group');
  theme(details, group.domain); details.open = !collapsed.has(group.domain);
  const summary = el('summary');
  summary.title = group.domain;
  summary.append(el('span', 'site-icon', siteName(group.domain)[0]), el('span', 'site-title', siteName(group.domain)), el('span', 'site-count', `${group.tabs.length} 个标签`));
  if (siteRules[group.domain]?.title) summary.append(el('span', 'site-count', `→ ${siteRules[group.domain].title}`));
  const eligible = group.tabs.filter(t => !t.pinned && domainOf(t.pendingUrl || t.url));
  if (eligible.length) {
    const button = el('button', 'group-action', '整理此网站');
    button.disabled = loading;
    button.onclick = event => { event.preventDefault(); event.stopPropagation(); requestOrganize(eligible.map(t => t.id)); };
    summary.append(button);
  } else { const spacer = el('span'); spacer.style.marginLeft = 'auto'; summary.append(spacer); }
  summary.append(el('span', 'chevron', '›'));
  details.append(summary);
  details.addEventListener('toggle', () => {
    if (!details.isConnected) return;
    if (details.open) collapsed.delete(group.domain); else collapsed.add(group.domain);
    const all = groupTabs(visible(), settings).every(g => collapsed.has(g.domain));
    $('collapse-all').textContent = all ? '展开全部' : '收起全部';
  });
  for (const tab of group.tabs) {
    const row = el('div', 'tab-row');
    const link = el('button', 'tab-link');
    link.append(el('span', 'tab-title', tab.title || tab.url || '未命名网页'), el('span', 'tab-url', tab.pendingUrl || tab.url || '地址暂不可用'));
    link.title = `切换到：${tab.title || tab.url}`;
    link.onclick = () => safe(async () => {
      if (!live) return toast('演示模式：安装扩展后可切换到真实网页。');
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    });
    const meta = el('div', 'tab-meta');
    if (tab.pinned) meta.append(el('span', 'tab-tag', '⚑ 已固定'));
    if (tab.audible) meta.append(el('span', 'tab-tag', '♫ 播放中'));
    if (dupes.has(tab.id)) meta.append(el('span', 'tab-tag', '重复网址'));
    const assigned = nativeGroups.find(g => g.id === tab.groupId);
    if (assigned?.title) meta.append(el('span', 'tab-tag', assigned.title));
    if (settings.scope === 'all') meta.append(el('span', 'tab-tag', `窗口 ${[...new Set(tabs.map(t => t.windowId))].indexOf(tab.windowId) + 1}`));
    const close = el('button', 'tab-close', '×');
    close.title = `关闭：${tab.title || tab.url}`; close.setAttribute('aria-label', close.title);
    close.onclick = () => safe(async () => {
      if (!live) return toast('演示模式：安装扩展后可关闭真实标签页。');
      await chrome.tabs.remove(tab.id); await refresh(); toast('已关闭标签页，可在 Chrome 中按 Ctrl+Shift+T 重新打开。');
    });
    row.append(el('span', 'tab-letter', group.domain[0].toUpperCase()), link, meta, close); details.append(row);
  }
  return details;
}
function requestOrganize(ids) {
  const plan = buildPlan(tabs, ids, settings);
  if (!plan.length) return toast('没有可整理的网页。固定标签页和内部页面会被跳过。');
  pendingIds = plan.flatMap(g => g.ids);
  $('confirm-description').textContent = `将整理 ${pendingIds.length} 个标签页，涉及 ${new Set(plan.map(g => g.windowId)).size} 个窗口、${plan.length} 个网站分类。会复用对应 label，并应用已保存的网站规则。${live ? '' : '当前为演示模式，无法操作真实标签页。'}`;
  $('confirm-dialog').returnValue = '';
  $('confirm-dialog').showModal();
}
$('organize').onclick = () => requestOrganize(visible().map(t => t.id));
$('confirm-dialog').addEventListener('close', () => safe(async () => {
  if ($('confirm-dialog').returnValue !== 'organize') return;
  if (!live) return toast('这是界面演示。请先将本项目加载到 Chrome，再整理你的网页。');
  loading = true; render();
  try {
    await saveQueue;
    const result = await chrome.runtime.sendMessage({ type: 'organize', ids: pendingIds });
    if (!result) throw new Error('扩展后台未响应，请刷新扩展后重试。');
    if (result.error) throw new Error(result.error);
    if (result.errors.length) toast(`已处理 ${result.count} 个标签页，但部分操作未完成：\n${result.errors.join('\n')}`, true);
    else toast(`已将 ${result.count} 个标签页整理为 ${result.grouped} 个域名组。`);
  } finally { loading = false; await refresh(); }
}));
document.querySelectorAll('[data-view]').forEach(node => { node.onclick = () => setView(node.dataset.view); });
$('search').oninput = event => { search = event.target.value.trim().toLowerCase(); render(); };
$('scope').onchange = event => { settings.scope = event.target.value; saveSettings(); };
$('sort').onchange = event => { settings.sort = event.target.value; saveSettings(); };
$('auto-group').onchange = event => { settings.autoGroup = event.target.checked; saveSettings(); };
$('pet-enabled').onchange = event => { settings.petEnabled = event.target.checked; saveSettings(); };
$('collapse-groups').onchange = event => { settings.collapse = event.target.checked; saveSettings(); };
$('settings-button').onclick = () => $('settings-dialog').showModal();
$('install-help').onclick = () => $('help-dialog').showModal();
$('refresh').onclick = () => safe(async () => { await refresh(); toast('标签页已更新'); });
$('collapse-all').onclick = () => { const shown = groupTabs(visible(), settings), shouldOpen = shown.every(g => collapsed.has(g.domain)); shown.forEach(g => shouldOpen ? collapsed.delete(g.domain) : collapsed.add(g.domain)); render(); };
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); $('search').focus(); }
});

await safe(async () => {
  if (live) {
    const data = await chrome.storage.local.get(['settings', 'siteRules', 'autoGroupError']);
    settings = { ...defaults, ...data.settings }; siteRules = data.siteRules || {};
    if (data.autoGroupError) showAutoError(data.autoGroupError);
    for (const event of ['onCreated', 'onRemoved', 'onUpdated', 'onMoved', 'onAttached', 'onDetached', 'onReplaced']) chrome.tabs[event].addListener(scheduleRefresh);
    for (const event of ['onCreated', 'onUpdated', 'onRemoved']) chrome.tabGroups[event].addListener(scheduleRefresh);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.settings) settings = { ...defaults, ...changes.settings.newValue };
      if (changes.siteRules) siteRules = changes.siteRules.newValue || {};
      if (changes.autoGroupError) showAutoError(changes.autoGroupError.newValue);
      render();
    });
  } else {
    try { settings = { ...defaults, ...JSON.parse(localStorage.getItem('tab-grove-settings') || '{}') }; } catch { /* Invalid preview preferences use defaults. */ }
    tabs = demoTabs;
    $('demo-banner').hidden = false;
    $('mode-badge').textContent = '界面演示';
    siteRules = JSON.parse(localStorage.getItem('tab-grove-demo-rules') || '{}');
    window.addEventListener('tab-grove-demo-settings', () => { siteRules = JSON.parse(localStorage.getItem('tab-grove-demo-rules') || '{}'); render(); });
  }
  await refresh();
});

function renderRules() {
  $('saved-rules').replaceChildren(...Object.entries(siteRules).map(([domain, rule]) => {
    const row = el('div', 'saved-rule');
    const text = el('span', '', `${siteName(domain)} → ${rule.title}`); text.title = domain;
    const remove = el('button', 'text-button', '移除'); remove.type = 'button'; remove.setAttribute('aria-label', `移除 ${siteName(domain)} 的网站规则`);
    remove.onclick = () => safe(async () => {
      if (live) { const result = await chrome.runtime.sendMessage({ type: 'delete-rule', domain }); if (result?.error) throw new Error(result.error); }
      delete siteRules[domain];
      if (!live) { localStorage.setItem('tab-grove-demo-rules', JSON.stringify(siteRules)); window.dispatchEvent(new Event('tab-grove-demo-settings')); }
      render();
    });
    row.append(text, remove); return row;
  }));
  if (!Object.keys(siteRules).length) $('saved-rules').append(el('p', 'rules-empty', '还没有网站规则。可以在悬浮小助手中勾选「记住这个网站」。'));
}
function showAutoError(error) {
  $('auto-error').hidden = !error;
  $('auto-error').textContent = error ? `最近一次自动归组未完成（${new Date(error.time).toLocaleTimeString()}）：${error.message}。可手动整理，或等待网页下一次加载时重试。` : '';
}
