import { domainOf, duplicateIds, buildPlan, defaults } from './core.js';

export async function openManager(api, windowId) {
  if (!Number.isInteger(windowId)) throw new Error('无法确定当前窗口，请重新打开扩展。');
  const url = api.runtime.getURL('index.html');
  const existing = (await api.tabs.query({ windowId })).find(t => t.url?.split('#')[0] === url);
  if (existing) await api.tabs.update(existing.id, { active: true });
  else await api.tabs.create({ windowId, url });
}

export function summarizePopup(tabs, windowId, settings = defaults) {
  const scoped = tabs.filter(t => settings.scope === 'all' || t.windowId === windowId);
  const plan = buildPlan(scoped, scoped.map(t => t.id), settings);
  const ids = plan.flatMap(group => group.ids);
  return {
    windowId, scope: settings.scope, ids,
    tabCount: scoped.length,
    siteCount: new Set(scoped.map(t => domainOf(t.pendingUrl || t.url)).filter(Boolean)).size,
    duplicateCount: duplicateIds(scoped).size,
    eligibleCount: ids.length, categoryCount: plan.length,
    windowCount: new Set(plan.map(group => group.windowId)).size
  };
}

export async function popupContext(api, windowId, settings = defaults) {
  if (!Number.isInteger(windowId)) throw new Error('无法确定当前窗口。');
  const allTabs = await api.tabs.query(settings.scope === 'all' ? { windowType: 'normal' } : { windowId });
  const tabs = allTabs.filter(t => !t.url?.startsWith(api.runtime.getURL('')));
  return summarizePopup(tabs, windowId, settings);
}
