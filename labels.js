import { colorFor, domainOf, siteName } from './core.js';
import { matchRule, ruleTarget, setRule } from './rules.js';

export const groupColors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
export function labelFor(raw, rules = {}) {
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const domain = domainOf(url), rule = matchRule(url, rules);
  return rule ? { title: rule.title, color: groupColors.includes(rule.color) ? rule.color : 'green', custom: true, rule } : { title: siteName(domain), color: colorFor(domain), custom: false };
}
export function findLabel(groups, domain, label, tabs = []) {
  if (label.custom) return groups.find(g => g.title === label.title);
  return groups.find(group => {
    const titleMatches = group.title === label.title || (/^[a-z0-9.-]+$/i.test(group.title) && domainOf(`https://${group.title}`) === domain);
    const members = tabs.filter(t => t.groupId === group.id).map(t => domainOf(t.pendingUrl || t.url)).filter(Boolean);
    // Keep mixed groups usable, but don't merge unrelated sites just because
    // example.com and example.net both have the display name EXAMPLE.
    return titleMatches && members.some(d => d === domain);
  });
}
export async function joinLabel(api, tab, domain, label, { collapse = false } = {}) {
  const groups = await api.tabGroups.query({ windowId: tab.windowId });
  const members = await api.tabs.query({ windowId: tab.windowId });
  const existing = findLabel(groups, domain, label, members);
  const fresh = await api.tabs.get(tab.id);
  if (fresh.windowId !== tab.windowId || fresh.pinned || domainOf(fresh.pendingUrl || fresh.url) !== domain || new URL(fresh.pendingUrl || fresh.url).href !== new URL(tab.pendingUrl || tab.url).href) return { skipped: true };
  let groupId = existing?.id;
  if (fresh.groupId !== groupId) groupId = await api.tabs.group(existing ? { tabIds: [tab.id], groupId } : { tabIds: [tab.id], createProperties: { windowId: tab.windowId } });
  if (!existing) await api.tabGroups.update(groupId, { title: label.title, color: label.color, collapsed: collapse && !fresh.active });
  else if (!label.custom && existing.title !== label.title) await api.tabGroups.update(groupId, { title: label.title });
  if (existing?.collapsed && fresh.active) await api.tabGroups.update(groupId, { collapsed: false });
  return { groupId, title: label.title };
}

export async function autoGroupTab(api, tabId, settings, rules = {}, state = {}) {
  if (!settings.autoGroup) return { skipped: true };
  let tab;
  try { tab = await api.tabs.get(tabId); } catch { return { skipped: true }; }
  const domain = domainOf(tab.pendingUrl || tab.url);
  if (!domain || tab.pinned || (await api.windows.get(tab.windowId)).type !== 'normal') return { skipped: true };
  const groups = await api.tabGroups.query({ windowId: tab.windowId });
  const current = groups.find(g => g.id === tab.groupId);
  const previous = state[tabId];
  const label = labelFor(tab.pendingUrl || tab.url, rules);
  if (current && !label.custom) {
    if (previous?.manual && previous.groupId === tab.groupId) return { skipped: true };
    const managed = previous && !previous.manual && previous.groupId === tab.groupId && previous.title === current.title;
    const domainTitle = current.title === siteName(domain) || (/^[a-z0-9.-]+$/i.test(current.title) && domainOf(`https://${current.title}`) === domain);
    if (!managed && !domainTitle) return { skipped: true };
  }
  if (!label.custom && !current && previous && previous.groupId !== -1) { state[tabId] = { ...previous, manual: true, groupId: -1 }; return { skipped: true }; }
  if (!label.custom && !current && previous?.manual && previous.groupId === -1) return { skipped: true };
  const result = await joinLabel(api, tab, domain, label, settings);
  if (!result.skipped) state[tabId] = { groupId: result.groupId, title: result.title, domain, manual: false };
  return result;
}

export async function assignLabel(api, tabId, request, settings, rules, state) {
  const tab = await api.tabs.get(tabId), url = tab.pendingUrl || tab.url;
  const domain = domainOf(url);
  if (!domain || tab.pinned) throw new Error('固定标签页和浏览器内部页面不能加入标签组。');
  if ((request.expectedUrl && new URL(request.expectedUrl).href !== new URL(url).href) || (request.expectedDomain && request.expectedDomain !== domain)) throw new Error('当前网页已跳转，请重新打开弹窗后操作。');
  const scope = request.ruleScope || 'domain';
  if (request.remember) ruleTarget(url, scope);
  let label, destination;
  if (request.mode === 'existing') {
    if (!Number.isInteger(request.groupId)) throw new Error('请选择一个 label。');
    destination = await api.tabGroups.get(request.groupId);
    if (destination.windowId !== tab.windowId) throw new Error('请选择当前窗口中的 label。');
    if (request.remember && !destination.title) throw new Error('请先在 Chrome 中为该标签组命名，再保存网站规则。');
    label = { title: destination.title || '未命名标签组', color: destination.color, custom: true };
  } else if (request.mode === 'create') {
    const title = typeof request.title === 'string' ? request.title.trim() : '';
    if (!title || title.length > 60) throw new Error('label 名称请输入 1–60 个字符。');
    label = { title, color: groupColors.includes(request.color) ? request.color : 'green', custom: true };
  } else if (request.mode === 'domain') label = labelFor(url, rules);
  else throw new Error('不支持的操作。');
  const updatedRules = { ...rules }, remembered = !!request.remember && request.mode !== 'domain';
  const savedRule = remembered ? setRule(updatedRules, url, scope, label) : null;
  const effective = remembered ? labelFor(url, updatedRules) : label;
  const fresh = await api.tabs.get(tabId);
  if (fresh.pinned || fresh.windowId !== tab.windowId || new URL(fresh.pendingUrl || fresh.url).href !== new URL(url).href) throw new Error('标签页状态已变化，请重新打开弹窗后操作。');
  let result;
  if (destination && effective.title === label.title) {
    await api.tabs.group({ tabIds: [tabId], groupId: destination.id });
    if (destination.collapsed && fresh.active) await api.tabGroups.update(destination.id, { collapsed: false });
    result = { groupId: destination.id, title: label.title };
  } else result = await joinLabel(api, fresh, domain, effective, settings);
  if (result.skipped) throw new Error('标签页状态已变化，请重试。');
  state[tabId] = { groupId: result.groupId, title: result.title, domain, manual: !remembered };
  if (savedRule) rules[savedRule.key] = updatedRules[savedRule.key];
  return { ...result, domain, remembered, savedRule, savedTitle: label.title, overridden: remembered && effective.rule.key !== savedRule.key };
}
