import { colorFor, domainOf, siteName } from './core.js';

export const groupColors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
export function labelFor(domain, rules = {}) {
  const rule = rules[domain];
  return rule?.title ? { title: rule.title, color: groupColors.includes(rule.color) ? rule.color : 'green', custom: true } : { title: siteName(domain), color: colorFor(domain), custom: false };
}
export function findLabel(groups, domain, label, tabs = []) {
  if (label.custom) return groups.find(g => g.title === label.title);
  return groups.find(group => {
    const titleMatches = group.title === label.title || (/^[a-z0-9.-]+$/i.test(group.title) && domainOf(`https://${group.title}`) === domain);
    const members = tabs.filter(t => t.groupId === group.id).map(t => domainOf(t.pendingUrl || t.url)).filter(Boolean);
    // Example.com and example.net can both be called EXAMPLE, but stay separate.
    return titleMatches && members.length > 0 && members.every(d => d === domain);
  });
}
export async function joinLabel(api, tab, domain, label, { collapse = false } = {}) {
  const groups = await api.tabGroups.query({ windowId: tab.windowId });
  const members = await api.tabs.query({ windowId: tab.windowId });
  const existing = findLabel(groups, domain, label, members);
  const fresh = await api.tabs.get(tab.id);
  if (fresh.windowId !== tab.windowId || fresh.pinned || domainOf(fresh.pendingUrl || fresh.url) !== domain) return { skipped: true };
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
  if (current) {
    if (previous?.manual && previous.groupId === tab.groupId) return { skipped: true };
    const managed = previous && !previous.manual && previous.groupId === tab.groupId && previous.title === current.title;
    const domainTitle = current.title === siteName(domain) || (/^[a-z0-9.-]+$/i.test(current.title) && domainOf(`https://${current.title}`) === domain);
    if (!managed && !domainTitle) return { skipped: true };
  }
  if (!current && previous && previous.groupId !== -1) { state[tabId] = { ...previous, manual: true, groupId: -1 }; return { skipped: true }; }
  if (!current && previous?.manual && previous.groupId === -1) return { skipped: true };
  const result = await joinLabel(api, tab, domain, labelFor(domain, rules), settings);
  if (!result.skipped) state[tabId] = { groupId: result.groupId, title: result.title, domain, manual: false };
  return result;
}

export async function assignLabel(api, tabId, request, settings, rules, state) {
  const tab = await api.tabs.get(tabId);
  const domain = domainOf(tab.pendingUrl || tab.url);
  if (!domain || tab.pinned) throw new Error('固定标签页和浏览器内部页面不能加入标签组。');
  if (request.expectedDomain && request.expectedDomain !== domain) throw new Error('当前网页已跳转，请重新打开助手后操作。');
  let result, color;
  if (request.mode === 'existing') {
    if (!Number.isInteger(request.groupId)) throw new Error('请选择一个 label。');
    const group = await api.tabGroups.get(request.groupId);
    if (group.windowId !== tab.windowId) throw new Error('请选择当前窗口中的 label。');
    if (request.remember && !group.title) throw new Error('请先在 Chrome 中为该标签组命名，再保存网站规则。');
    const fresh = await api.tabs.get(tabId);
    if (fresh.pinned || fresh.windowId !== tab.windowId || domainOf(fresh.pendingUrl || fresh.url) !== domain) throw new Error('标签页状态已变化，请重新打开助手后操作。');
    await api.tabs.group({ tabIds: [tabId], groupId: group.id });
    if (group.collapsed && fresh.active) await api.tabGroups.update(group.id, { collapsed: false });
    result = { groupId: group.id, title: group.title || '未命名标签组' };
    color = group.color;
  } else if (request.mode === 'create') {
    const title = typeof request.title === 'string' ? request.title.trim() : '';
    if (!title || title.length > 60) throw new Error('label 名称请输入 1–60 个字符。');
    color = groupColors.includes(request.color) ? request.color : 'green';
    result = await joinLabel(api, tab, domain, { title, color, custom: true }, settings);
  } else if (request.mode === 'domain') {
    result = await joinLabel(api, tab, domain, labelFor(domain, rules), settings);
    color = labelFor(domain, rules).color;
  } else throw new Error('不支持的操作。');
  if (result.skipped) throw new Error('标签页状态已变化，请重试。');
  state[tabId] = { groupId: result.groupId, title: result.title, domain, manual: true };
  if (request.remember && request.mode !== 'domain') rules[domain] = { title: result.title, color };
  return { ...result, domain, remembered: !!request.remember && request.mode !== 'domain' };
}
