import { buildPlan, colorFor } from './core.js';
import { findLabel, labelFor } from './labels.js';

// Chrome owns window boundaries; grouping is deliberately performed per window.
export async function organize(api, ids, settings, rules = {}) {
  const plan = buildPlan(await api.tabs.query({ windowType: 'normal' }), ids, settings);
  const grouped = new Set();
  let count = 0;
  const errors = [];
  for (const item of plan) {
    try {
      // Re-read immediately before mutation: pages may close, move or become pinned.
      const current = await api.tabs.query({ windowId: item.windowId });
      const fresh = buildPlan(current, item.ids, settings).find(g => g.domain === item.domain);
      if (!fresh?.ids.length) continue;
      const label = labelFor(item.domain, rules);
      // tabs.group does not promise to sort members by the tabIds input order.
      // Move each member to the end in URL order before creating the group.
      for (const id of fresh.ids) await api.tabs.move(id, { index: -1 });
      const members = await api.tabs.query({ windowId: item.windowId });
      const existing = findLabel(await api.tabGroups.query({ windowId: item.windowId }), item.domain, label, members);
      const groupId = await api.tabs.group(existing ? { tabIds: fresh.ids, groupId: existing.id } : { tabIds: fresh.ids, createProperties: { windowId: item.windowId } });
      count += fresh.ids.length;
      grouped.add(groupId);
      await api.tabGroups.update(groupId, { title: label.title, color: existing?.color || label.color || colorFor(item.domain), collapsed: settings.collapse });
    } catch (error) {
      errors.push(`${item.domain}: ${error.message}`);
    }
  }
  return { count, grouped: grouped.size, errors };
}
