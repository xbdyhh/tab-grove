import { getDomain, getDomainWithoutSuffix } from './vendor/tldts.js';
export const defaults = { scope: 'current', sort: 'count', collapse: false, autoGroup: true, petEnabled: true };

export function domainOf(raw) {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const hostname = url.hostname.replace(/\.$/, '');
    return getDomain(hostname, { allowPrivateDomains: true, extractHostname: false }) || hostname;
  } catch { return null; }
}

export function siteName(domain) {
  if (!domain || domain === '浏览器与本地页面') return domain;
  return (getDomainWithoutSuffix(domain, { allowPrivateDomains: true, extractHostname: false }) || domain).toUpperCase();
}

export function duplicateIds(tabs) {
  const urls = new Map();
  for (const tab of tabs) {
    const url = tab.pendingUrl || tab.url;
    if (!domainOf(url)) continue;
    if (!urls.has(url)) urls.set(url, []);
    urls.get(url).push(tab.id);
  }
  return new Set([...urls.values()].filter(ids => ids.length > 1).flat());
}

export function groupTabs(tabs, settings = defaults) {
  const groups = new Map();
  for (const tab of tabs) {
    const domain = domainOf(tab.pendingUrl || tab.url) || '浏览器与本地页面';
    if (!groups.has(domain)) groups.set(domain, { domain, tabs: [] });
    groups.get(domain).tabs.push(tab);
  }
  for (const group of groups.values()) {
    group.tabs.sort((a, b) => (a.pendingUrl || a.url || '').localeCompare(b.pendingUrl || b.url || '') || a.index - b.index);
  }
  return [...groups.values()].sort((a, b) => (settings.sort === 'count' ? b.tabs.length - a.tabs.length : 0) || a.domain.localeCompare(b.domain));
}

export function buildPlan(tabs, ids, settings) {
  const wanted = new Set(ids);
  const windows = new Map();
  for (const tab of tabs) {
    if (!wanted.has(tab.id) || tab.pinned || !domainOf(tab.pendingUrl || tab.url)) continue;
    if (!windows.has(tab.windowId)) windows.set(tab.windowId, []);
    windows.get(tab.windowId).push(tab);
  }
  return [...windows].flatMap(([windowId, items]) => groupTabs(items, settings).map(group => ({ windowId, domain: group.domain, ids: group.tabs.map(t => t.id) })));
}

export function colorFor(domain) {
  const colors = ['green', 'blue', 'purple', 'cyan', 'orange', 'pink'];
  let hash = 0;
  for (const c of domain) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}
