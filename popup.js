import { defaults } from './core.js';
import { summarizePopup, describePage } from './navigation.js';
import { demoTabs } from './demo.js';
import { scopeNames, matchRule, setRule } from './rules.js';

const $ = id => document.getElementById(id);
const live = !!globalThis.chrome?.tabs?.query;
let windowId = live ? undefined : 1, context, busy = false, confirming = false;
let settings = { ...defaults }, generation = 0, pendingIds = [], refreshTimer;
let preferenceQueue = Promise.resolve(), pendingPreferences = 0;
let panel = 'current', color = 'green';
const demoCurrent = { ...demoTabs[5], active: true };
const demoGroups = [{ id: 1, title: 'BILIBILI', color: 'pink' }, { id: 2, title: '工作', color: 'green' }, { id: 3, title: '灵感', color: 'purple' }];
function demoContext() {
  const rules = JSON.parse(localStorage.getItem('tab-grove-demo-rules') || '{}');
  return { ...summarizePopup(demoTabs, windowId, settings), page: describePage(demoCurrent, demoGroups, rules) };
}

function setText(id, text) { if ($(id).textContent !== String(text)) $(id).textContent = text; }
function status(text, error = false) {
  setText('status', text); $('status').hidden = !text; $('status').classList.toggle('error', error);
}
async function request(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result) throw new Error('扩展没有响应，请重载扩展后重试。');
  if (result.error) throw new Error(result.error);
  return result;
}
function render() {
  const ready = context && context.scope === settings.scope;
  const locked = busy || confirming || pendingPreferences > 0;
  $('auto-group').checked = settings.autoGroup;
  $('scope').value = settings.scope;
  for (const id of ['scope', 'auto-group']) $(id).disabled = locked || !context;
  setText('tab-count', ready ? context.tabCount : '—');
  setText('site-count', ready ? context.siteCount : '—');
  setText('duplicate-count', ready ? context.duplicateCount : '—');
  setText('organize-summary', ready ? `${context.eligibleCount} 个可整理网页 · ${context.windowCount} 个窗口` : '正在读取标签页…');
  setText('organize', busy ? '正在整理…' : '一键按域名分组');
  $('organize').disabled = locked || !ready || !context.eligibleCount;
  $('organize').hidden = confirming;
  $('confirmation').hidden = !confirming;
  setText('confirm-organize', busy ? '正在整理…' : '开始整理');
  $('confirm-organize').disabled = busy; $('cancel-organize').disabled = busy;
  $('current-panel').hidden = panel !== 'current'; $('bulk-panel').hidden = panel !== 'bulk';
  for (const name of ['current', 'bulk']) { $('show-' + name).setAttribute('aria-pressed', String(panel === name)); $('show-' + name).disabled = busy; }
  const page = context?.page;
  setText('page-title', page?.title || '正在读取当前网页…');
  setText('page-url', page?.url || ''); $('page-url').title = page?.url || '';
  $('page-controls').hidden = !page?.supported;
  $('page-unavailable').hidden = !page || page.supported;
  setText('page-unavailable', page?.pinned ? '这是固定标签页，请先取消固定。你仍可切换到一键整理或打开完整管理页。' : '此页面无法设置分组规则。请切换到普通网页后重新打开弹窗。');
  for (const id of ['rule-scope', 'labels', 'new-label', 'join', 'create']) $(id).disabled = locked || !page?.supported;
  for (const button of $('colors').children) button.disabled = locked || !page?.supported;
  const groups = page?.groups || [], signature = JSON.stringify([page?.tabId, groups]);
  if ($('labels').dataset.signature !== signature) {
    const selected = $('labels').dataset.tabId === String(page?.tabId) ? $('labels').value : '';
    $('labels').replaceChildren(...groups.map(group => { const option = document.createElement('option'); option.value = group.id; option.textContent = group.title || '未命名标签组'; return option; }));
    if (groups.some(g => String(g.id) === selected)) $('labels').value = selected;
    else if (groups.some(g => g.id === page?.groupId)) $('labels').value = page.groupId;
    if (!groups.length) { const option = document.createElement('option'); option.textContent = '暂无 label，请在下方创建'; $('labels').append(option); }
    $('labels').dataset.signature = signature; $('labels').dataset.tabId = page?.tabId;
  }
  if (!groups.length) { $('labels').disabled = true; $('join').disabled = true; }
  setText('rule-target', page?.targets?.[$('rule-scope').value] || '');
  setText('match-info', page?.rule ? '当前生效：' + scopeNames[page.rule.scope] + ' → ' + page.rule.title : '当前生效：默认按根域名分组');
}
async function refresh() {
  const current = ++generation;
  const next = live ? await request({ type: 'popup-context', windowId }) : demoContext();
  if (current !== generation) return;
  context = next; render();
}
// Tab grouping produces many events. One settled refresh is enough for the popup.
function scheduleRefresh() {
  if (busy) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh().catch(error => status(error.message, true)), 180);
}
async function changeSetting(key, value) {
  const previous = { ...settings };
  try {
    const saved = live ? (await chrome.storage.local.get('settings')).settings : JSON.parse(localStorage.getItem('tab-grove-settings') || '{}');
    settings = { ...defaults, ...saved, [key]: value };
    if (live) await chrome.storage.local.set({ settings });
    else localStorage.setItem('tab-grove-settings', JSON.stringify(settings));
    await refresh(); status('设置已保存');
  } catch (error) { settings = previous; status(`保存失败：${error.message}`, true); }
  finally { pendingPreferences--; render(); }
}
for (const [id, key] of [['auto-group', 'autoGroup'], ['scope', 'scope']]) {
  $(id).onchange = () => {
    const value = id === 'scope' ? $(id).value : $(id).checked;
    pendingPreferences++; render();
    preferenceQueue = preferenceQueue.then(() => changeSetting(key, value));
  };
}
$('organize').onclick = () => {
  if (busy || confirming || !context?.eligibleCount || context.scope !== settings.scope) return;
  pendingIds = [...context.ids]; confirming = true; status('');
  setText('confirm-description', `将整理 ${pendingIds.length} 个网页，涉及 ${context.windowCount} 个窗口、${context.categoryCount} 个网站分类。`);
  render();
};
$('cancel-organize').onclick = () => { confirming = false; pendingIds = []; render(); };
$('confirm-organize').onclick = async () => {
  if (busy || !confirming || !pendingIds.length) return;
  busy = true; render(); status(''); clearTimeout(refreshTimer);
  try {
    await preferenceQueue;
    if (!live) status('演示模式：已预览批量整理范围。加载扩展后会实际整理这些网页。');
    else {
      // Identical background entry point to the full management page.
      const result = await request({ type: 'organize', ids: pendingIds });
      if (result.errors.length) status(`已整理 ${result.count} 个网页，部分操作未完成：\n${result.errors.join('\n')}`, true);
      else status(`已将 ${result.count} 个网页整理为 ${result.grouped} 个 label。`);
    }
  } catch (error) { status(`整理未完成：${error.message}`, true); }
  finally {
    busy = false; confirming = false; pendingIds = []; render();
    try { await refresh(); } catch (error) { status(`刷新失败：${error.message}`, true); }
  }
};
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && confirming && !busy) { event.preventDefault(); confirming = false; pendingIds = []; render(); }
});
$('open-manager').onclick = async () => {
  $('open-manager').disabled = true;
  try {
    await preferenceQueue;
    if (live) { await request({ type: 'open-manager', windowId }); window.close(); }
    else location.href = 'index.html';
  } catch (error) { status(error.message, true); $('open-manager').disabled = false; }
};

for (const name of ['current', 'bulk']) $('show-' + name).onclick = () => {
  if (busy) return;
  panel = name; confirming = false; pendingIds = []; status(''); render(); document.querySelector('main').scrollTop = 0;
};
$('rule-scope').onchange = render;
async function assignCurrent(mode) {
  if (busy || confirming || !context?.page?.supported) return;
  const page = context.page, title = $('new-label').value.trim();
  if (mode === 'create' && !title) { status('请给新的 label 起个名字。', true); return; }
  const message = { type: 'popup-assign', windowId, tabId: page.tabId, expectedUrl: page.url, ruleScope: $('rule-scope').value, mode, groupId: Number($('labels').value), title, color, remember: true };
  busy = true; render(); status('正在保存规则…'); clearTimeout(refreshTimer);
  try {
    let result;
    if (live) result = await request(message);
    else {
      const rules = JSON.parse(localStorage.getItem('tab-grove-demo-rules') || '{}');
      const desired = mode === 'existing' ? demoGroups.find(g => g.id === message.groupId) : { title, color };
      if (!desired) throw new Error('请选择一个 label。');
      const saved = setRule(rules, page.url, message.ruleScope, desired), effective = matchRule(page.url, rules);
      let group = demoGroups.find(g => g.title === effective.title);
      if (!group) { group = { id: Math.max(0, ...demoGroups.map(g => g.id)) + 1, title: effective.title, color: effective.color }; demoGroups.push(group); }
      demoCurrent.groupId = group.id;
      localStorage.setItem('tab-grove-demo-rules', JSON.stringify(rules));
      result = { title: group.title, savedTitle: desired.title, overridden: saved.key !== effective.key };
    }
    await refresh(); $('labels').value = context.page.groupId;
    status(result.overridden ? '已保存规则 → ' + result.savedTitle + '。当前网页命中更具体规则，已加入 ' + result.title + '。' : '规则已保存，已加入 ' + result.title + '。');
    if (mode === 'create') $('new-label').value = '';
  } catch (error) { status(error.message, true); await refresh().catch(() => {}); }
  finally { busy = false; render(); $('status').scrollIntoView({ block: 'nearest' }); }
}
$('join').onclick = () => assignCurrent('existing');
$('create-form').onsubmit = event => { event.preventDefault(); assignCurrent('create'); };
for (const [name, hex, title] of [['green', '#719468', '绿色'], ['blue', '#668abb', '蓝色'], ['purple', '#9981b5', '紫色'], ['cyan', '#62a19d', '青色'], ['orange', '#c29966', '橙色'], ['pink', '#bf859b', '粉色']]) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'color'; button.style.setProperty('--color', hex); button.setAttribute('aria-label', title); button.setAttribute('aria-pressed', String(name === color));
  button.onclick = () => { color = name; for (const child of $('colors').children) child.setAttribute('aria-pressed', String(child === button)); }; $('colors').append(button);
}

try {
  if (live) {
    windowId = (await chrome.windows.getCurrent()).id;
    settings = { ...defaults, ...(await chrome.storage.local.get('settings')).settings };
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || (!changes.settings && !changes.siteRules)) return;
      if (changes.settings) settings = { ...defaults, ...changes.settings.newValue };
      if (confirming && !busy) { confirming = false; pendingIds = []; }
      render(); scheduleRefresh();
    });
    for (const name of ['onCreated', 'onRemoved', 'onAttached', 'onDetached', 'onReplaced', 'onActivated']) chrome.tabs[name].addListener(scheduleRefresh);
    for (const name of ['onCreated', 'onUpdated', 'onRemoved']) chrome.tabGroups[name].addListener(scheduleRefresh);
    chrome.tabs.onUpdated.addListener((id, info) => { if (info.url || info.pinned !== undefined || info.groupId !== undefined || info.title) scheduleRefresh(); });
  } else {
    // Preview framing is separate from the fixed-size native popup document.
    if (!new URLSearchParams(location.search).has('native-preview')) document.documentElement.classList.add('preview-page');
    $('demo').hidden = false;
    settings = { ...defaults, ...JSON.parse(localStorage.getItem('tab-grove-settings') || '{}') };
  }
  await refresh();
} catch (error) { status(`读取失败：${error.message}`, true); }
$('open-manager').disabled = live && !Number.isInteger(windowId);
