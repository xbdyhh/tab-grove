import { domainOf } from './core.js';

export const scopeNames = { domain: '根域名', host: '域名前缀', page: '具体网页' };
export function ruleTarget(raw, scope) {
  if (!Object.hasOwn(scopeNames, scope)) throw new Error('请选择有效的规则范围。');
  if (!domainOf(raw)) throw new Error('只有普通网页可以设置分组规则。');
  const url = new URL(raw);
  const target = scope === 'domain' ? domainOf(raw) : scope === 'host' ? url.hostname.replace(/\.$/, '') : url.href;
  return { key: scope === 'domain' ? target : `${scope}:${target}`, scope, target };
}
export function ruleEntries(rules = {}) {
  return Object.entries(rules).filter(([, rule]) => rule?.title).map(([key, rule]) => {
    const scope = key.startsWith('page:') ? 'page' : key.startsWith('host:') ? 'host' : 'domain';
    return { ...rule, key, scope, target: scope === 'domain' ? key : key.slice(scope.length + 1) };
  }).sort((a, b) => ['page', 'host', 'domain'].indexOf(a.scope) - ['page', 'host', 'domain'].indexOf(b.scope) || a.target.localeCompare(b.target));
}
export function matchRule(raw, rules = {}) {
  if (!domainOf(raw)) return null;
  for (const scope of ['page', 'host', 'domain']) {
    const target = ruleTarget(raw, scope), rule = rules[target.key];
    if (rule?.title) return { ...rule, ...target };
  }
  return null;
}
export function setRule(rules, raw, scope, label) {
  const target = ruleTarget(raw, scope);
  const title = typeof label.title === 'string' ? label.title.trim() : '';
  if (!title || title.length > 60) throw new Error('label 名称请输入 1–60 个字符。');
  rules[target.key] = { title, color: label.color || 'green' };
  return target;
}
