import { defaults } from './core.js';
import { summarizePopup } from './navigation.js';
import { demoTabs } from './demo.js';

const $ = id => document.getElementById(id);
const live = !!globalThis.chrome?.tabs?.query;
let windowId = live ? undefined : 1, context, busy = false, confirming = false;
let settings = { ...defaults }, generation = 0, pendingIds = [], refreshTimer;
let preferenceQueue = Promise.resolve(), pendingPreferences = 0;

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
  $('auto-group').checked = settings.autoGroup; $('pet-enabled').checked = settings.petEnabled;
  $('scope').value = settings.scope;
  for (const id of ['scope', 'auto-group', 'pet-enabled']) $(id).disabled = locked || !context;
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
}
async function refresh() {
  const current = ++generation;
  const next = live ? await request({ type: 'popup-context', windowId }) : summarizePopup(demoTabs, windowId, settings);
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
for (const [id, key] of [['auto-group', 'autoGroup'], ['pet-enabled', 'petEnabled'], ['scope', 'scope']]) {
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

try {
  if (live) {
    windowId = (await chrome.windows.getCurrent()).id;
    settings = { ...defaults, ...(await chrome.storage.local.get('settings')).settings };
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.settings) return;
      settings = { ...defaults, ...changes.settings.newValue };
      if (confirming && !busy) { confirming = false; pendingIds = []; }
      render(); scheduleRefresh();
    });
    for (const name of ['onCreated', 'onRemoved', 'onAttached', 'onDetached', 'onReplaced']) chrome.tabs[name].addListener(scheduleRefresh);
    chrome.tabs.onUpdated.addListener((id, info) => { if (info.url || info.pinned !== undefined) scheduleRefresh(); });
  } else {
    // Preview framing is separate from the fixed-size native popup document.
    if (!new URLSearchParams(location.search).has('native-preview')) document.documentElement.classList.add('preview-page');
    $('demo').hidden = false;
    settings = { ...defaults, ...JSON.parse(localStorage.getItem('tab-grove-settings') || '{}') };
  }
  await refresh();
} catch (error) { status(`读取失败：${error.message}`, true); }
$('open-manager').disabled = live && !Number.isInteger(windowId);
