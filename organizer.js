import { buildPlan, colorFor } from './core.js';
import { findLabel, labelFor } from './labels.js';

// Chrome owns window boundaries; grouping is deliberately performed per window.
export async function organize(api, ids, settings, rules = {}) {
  const rulePlan = (tabs, ids) => buildPlan(tabs, ids, settings).flatMap(item => {
    const buckets = new Map();
    for (const id of item.ids) {
      const tab = tabs.find(t => t.id === id), label = labelFor(tab.pendingUrl || tab.url, rules);
      const key = JSON.stringify([label.custom, label.title]);
      if (!buckets.has(key)) buckets.set(key, { ...item, label, key, ids: [] });
      buckets.get(key).ids.push(id);
    }
    return [...buckets.values()];
  });
  const plan = rulePlan(await api.tabs.query({ windowType: 'normal' }), ids);
  const grouped = new Set();
  let count = 0;
  const errors = [];
  for (const item of plan) {
    try {
      // Re-read immediately before mutation: pages may close, move or become pinned.
      const current = await api.tabs.query({ windowId: item.windowId });
      const fresh = rulePlan(current, item.ids).find(g => g.domain === item.domain && g.key === item.key);
      if (!fresh?.ids.length) continue;
      const label = fresh.label;
      // tabs.group does not promise to sort members by the tabIds input order.
      // Move each member to the end in URL order before creating the group.
      for (const id of fresh.ids) await api.tabs.move(id, { index: -1 });
      const members = await api.tabs.query({ windowId: item.windowId });
      const ready = rulePlan(members, fresh.ids).find(g => g.domain === item.domain && g.key === item.key)?.ids || [];
      if (!ready.length) continue;
      const existing = findLabel(await api.tabGroups.query({ windowId: item.windowId }), item.domain, label, members);
      const groupId = await api.tabs.group(existing ? { tabIds: ready, groupId: existing.id } : { tabIds: ready, createProperties: { windowId: item.windowId } });
      count += ready.length;
      grouped.add(groupId);
      await api.tabGroups.update(groupId, { title: label.title, color: existing?.color || label.color || colorFor(item.domain), collapsed: settings.collapse });
    } catch (error) {
      errors.push(`${item.domain}: ${error.message}`);
    }
  }
  return { count, grouped: grouped.size, errors };
}
