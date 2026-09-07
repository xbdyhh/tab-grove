import { defaults, domainOf, siteName } from './core.js';
import { organize } from './organizer.js';
import { assignLabel, autoGroupTab, labelFor } from './labels.js';
import { openManager, popupContext } from './navigation.js';

// Auto events, bulk operations and pet clicks share one mutation queue.
let queue = Promise.resolve();
function enqueue(action) { const task = queue.then(action); queue = task.catch(() => {}); return task; }
async function config() {
  const data = await chrome.storage.local.get(['settings', 'siteRules']);
  return { settings: { ...defaults, ...data.settings }, rules: data.siteRules || {} };
}
async function state() { return (await chrome.storage.session.get('assignments')).assignments || {}; }

async function auto(tabId) {
  const { settings, rules } = await config(), assignments = await state();
  try {
    await autoGroupTab(chrome, tabId, settings, rules, assignments);
    await chrome.storage.session.set({ assignments });
  } catch (error) {
    await chrome.storage.local.set({ autoGroupError: { message: error.message, time: Date.now() } });
  }
}
function scheduleAuto(tabId) { enqueue(() => auto(tabId)).catch(console.error); }
chrome.tabs.onCreated.addListener(tab => scheduleAuto(tab.id));
chrome.tabs.onUpdated.addListener((id, change) => { if (change.url || change.status === 'complete') scheduleAuto(id); });
chrome.tabs.onAttached.addListener(id => { enqueue(async () => { const assignments = await state(); delete assignments[id]; await chrome.storage.session.set({ assignments }); await auto(id); }).catch(console.error); });
chrome.tabs.onRemoved.addListener(id => { enqueue(async () => { const assignments = await state(); delete assignments[id]; await chrome.storage.session.set({ assignments }); }).catch(console.error); });
chrome.tabs.onReplaced.addListener((added, removed) => { enqueue(async () => { const assignments = await state(); if (assignments[removed]) assignments[added] = assignments[removed]; delete assignments[removed]; await chrome.storage.session.set({ assignments }); await auto(added); }).catch(console.error); });

async function petContext(sender) {
  const tab = await chrome.tabs.get(sender.tab.id);
  const { settings, rules } = await config();
  const domain = domainOf(tab.pendingUrl || tab.url);
  const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
  return { domain, siteName: siteName(domain), pinned: tab.pinned, groupId: tab.groupId, groups: groups.map(({ id, title, color }) => ({ id, title, color })), suggested: domain ? labelFor(domain, rules).title : '', rule: rules[domain] || null, autoGroup: settings.autoGroup };
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  const fromManager = sender.url?.startsWith(chrome.runtime.getURL(''));
  const fromPopup = sender.url === chrome.runtime.getURL('popup.html');
  const fromPet = sender.tab && sender.frameId === 0 && domainOf(sender.url);
  if (!fromManager && !fromPet) return;
  enqueue(async () => {
    if (message.type === 'popup-context' && fromPopup) {
      const { settings } = await config();
      return popupContext(chrome, message.windowId, settings);
    }
    if (message.type === 'open-manager' && fromManager) { await openManager(chrome, message.windowId); return { ok: true }; }
    if (message.type === 'organize' && fromManager) {
      if (!Array.isArray(message.ids) || !message.ids.every(Number.isInteger)) throw new Error('标签页参数无效');
      const { settings, rules } = await config();
      const result = await organize(chrome, message.ids, settings, rules);
      const assignments = await state();
      for (const id of message.ids) delete assignments[id];
      await chrome.storage.session.set({ assignments });
      return result;
    }
    if (message.type === 'pet-context' && fromPet) return petContext(sender);
    if (message.type === 'pet-assign' && fromPet) {
      const { settings, rules } = await config(), assignments = await state();
      const result = await assignLabel(chrome, sender.tab.id, message, settings, rules, assignments);
      await chrome.storage.session.set({ assignments });
      if (result.remembered) await chrome.storage.local.set({ siteRules: rules });
      return result;
    }
    if (message.type === 'pet-open-manager' && fromPet) { await openManager(chrome, sender.tab.windowId); return { ok: true }; }
    if (message.type === 'delete-rule' && fromManager && typeof message.domain === 'string') {
      const { rules } = await config(); delete rules[message.domain]; await chrome.storage.local.set({ siteRules: rules }); return { ok: true };
    }
    throw new Error('不支持的操作');
  }).then(reply, error => reply({ error: error.message }));
  return true;
});

async function injectPets() {
  const { settings } = await config();
  if (!settings.petEnabled) return;
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.allSettled(tabs.map(tab => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['pet.js'] })));
}
chrome.runtime.onInstalled.addListener(() => { injectPets().catch(console.error); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings?.newValue?.petEnabled && !changes.settings.oldValue?.petEnabled) injectPets().catch(console.error);
});
