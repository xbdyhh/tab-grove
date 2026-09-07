import { domainOf, duplicateIds, buildPlan, defaults } from './core.js';
import { matchRule, ruleTarget } from './rules.js';

export function describePage(tab, groups = [], rules = {}) {
  const url = tab?.pendingUrl || tab?.url, domain = domainOf(url);
  return { tabId: tab?.id, url, title: tab?.title || url || '没有当前网页', domain,
    pinned: !!tab?.pinned, supported: !!domain && !tab?.pinned, groupId: tab?.groupId,
    groups: groups.map(({ id, title, color }) => ({ id, title, color })), rule: matchRule(url, rules),
    targets: domain ? Object.fromEntries(['domain', 'host', 'page'].map(scope => [scope, ruleTarget(url, scope).target])) : {} };
}

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

export async function popupContext(api, windowId, settings = defaults, rules = {}) {
  if (!Number.isInteger(windowId)) throw new Error('无法确定当前窗口。');
  const allTabs = await api.tabs.query(settings.scope === 'all' ? { windowType: 'normal' } : { windowId });
  const tabs = allTabs.filter(t => !t.url?.startsWith(api.runtime.getURL('')));
  const [active] = await api.tabs.query({ windowId, active: true });
  const groups = await api.tabGroups.query({ windowId });
  return { ...summarizePopup(tabs, windowId, settings), page: describePage(active, groups, rules) };
}
