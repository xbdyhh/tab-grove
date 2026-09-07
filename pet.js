(() => {
  const live = !!globalThis.chrome?.runtime?.id;
  const demo = !live && document.documentElement.hasAttribute('data-tab-grove-pet-demo');
  if ((!live && !demo) || (live && !/^https?:$/.test(location.protocol)) || window.top !== window || globalThis.__tabGrovePetVersion === '1.3.0') return;
  globalThis.__tabGrovePetVersion = '1.3.0';
  const host = document.createElement('div');
  host.id = 'tab-grove-pet';
  document.getElementById(host.id)?.remove();
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host{all:initial!important;position:fixed!important;left:var(--tg-x,calc(100vw - 76px))!important;top:var(--tg-y,calc(80vh - 64px))!important;z-index:2147483647!important;display:block!important;width:64px!important;height:64px!important;color-scheme:light!important;pointer-events:auto!important}
      :host([data-hidden]){display:none!important}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}button:disabled{opacity:.5;cursor:wait}[hidden]{display:none!important}
      .pet{position:relative;width:64px;height:64px;border:1px solid #c6d5bd;background:linear-gradient(150deg,#f9fbed,#deebd7);border-radius:24px;box-shadow:0 5px 24px #1f442b26;padding:4px;touch-action:none;user-select:none;transition:box-shadow .2s;display:grid;place-items:center}
      .pet:hover{box-shadow:0 7px 28px #1f442b40}.pet svg{width:54px;height:54px;pointer-events:none}.pet .dot{position:absolute;width:9px;height:9px;background:#648a4f;border:2px solid #f7f8f0;border-radius:50%;right:4px;bottom:5px}
      .pet .eye{transform-origin:center;animation:blink 6s infinite}@keyframes blink{0%,44%,48%,100%{transform:scaleY(1)}46%{transform:scaleY(.1)}}@media(prefers-reduced-motion:reduce){.pet .eye{animation:none}}
      .panel{position:fixed;width:310px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow-y:auto;border:1px solid #dce5d7;border-radius:18px;background:#fcfdf9;color:#344c3c;box-shadow:0 14px 60px #193d3326;padding:19px;font:12px/1.6 "Segoe UI","Microsoft YaHei",sans-serif;text-align:left;letter-spacing:normal}
      .head{display:flex;align-items:center;gap:8px}.head strong{font-size:16px;font-weight:650}.head span{font-size:9px;color:#8c9b83;letter-spacing:1px}.close{margin-left:auto;background:none;border:0;font-size:23px;color:#83937c;padding:0 4px}
      .intro{margin:7px 0 15px;color:#8b9883;font-size:11px}
      .divider{display:flex;align-items:center;gap:10px;font-size:10px;color:#99a18e;margin:17px 0 11px}.divider:after{content:"";height:1px;background:#e4eadc;flex:1}
      .row{display:flex;gap:7px}select,input[type=text]{min-width:0;background:white;border:1px solid #dae3d3;border-radius:7px;color:#45613f;padding:9px 10px;width:100%;outline:none;font-size:12px}.row select,.row input{flex:1}.secondary{background:#38694b;color:#fff;border:1px solid #38694b;border-radius:7px;padding:8px 12px;white-space:nowrap;font-size:11px}.secondary:hover{background:#2d583e;border-color:#2d583e}
      .scope-label{display:block;font-size:11px;color:#607c50;margin-bottom:6px}.rule-target{font-size:11px;overflow-wrap:anywhere;background:#f0f4eb;padding:7px;border-radius:6px;max-height:58px;overflow:auto;margin:7px 0}.match-info{font-size:10px;color:#74866a;line-height:1.7;margin:7px 0}.colors{display:flex;gap:8px;margin-top:9px}.color{width:19px;height:19px;border:3px solid white;outline:1px solid #e5eadf;background:var(--color);border-radius:50%;padding:0}.color[aria-pressed=true]{outline:2px solid #678358}
      .status{font-size:11px;color:#607c50;line-height:1.7;white-space:pre-line;overflow-wrap:anywhere;margin:12px 0 0}.status.error{color:#ab594e}.foot{display:flex;align-items:center;justify-content:space-between;margin-top:15px;padding-top:12px;border-top:1px solid #e5eadf}.link{background:none;border:0;padding:0;color:#839476;font-size:10px}.link:hover{color:#315b38}.demo{font-size:10px;color:#a38b5c;margin:8px 0 0}
      button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #8ca781;outline-offset:3px}
    </style>
    <button class="pet" id="pet-button" aria-label="打开网页整理小助手，可拖动" aria-expanded="false" title="小叶 · 点我整理当前网页，拖动可换位置">
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M13 29 12 12c0-2 2-3 4-1l11 9h10l11-9c2-2 4-1 4 1l-1 17c6 15-3 25-19 25S7 44 13 29Z" fill="#739565"/><path d="m16 17 1 11 7-5-8-6ZM48 17l-1 11-7-5 8-6Z" fill="#c4d2a7"/><ellipse cx="32" cy="40" rx="19" ry="13" fill="#e9edcc"/><g class="eye" fill="#355637"><ellipse cx="23" cy="34" rx="2.3" ry="3"/><ellipse cx="41" cy="34" rx="2.3" ry="3"/></g><path d="m30 40 2 2 2-2M27 45q3 3 5-1 2 4 5 1" stroke="#54724b" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="18" cy="41" rx="3.5" ry="2" fill="#d8b39e"/><ellipse cx="46" cy="41" rx="3.5" ry="2" fill="#d8b39e"/><path d="M32 20c-4-8-2-12 6-13 0 7-1 10-6 13Z" fill="#8dab60"/></svg><span class="dot"></span>
    </button>
    <section class="panel" id="panel" hidden role="dialog" aria-label="小叶网页整理助手">
      <div class="head"><strong>小叶</strong><span>TAB GROVE</span><button class="close" id="close" aria-label="收起小助手">×</button></div>
      <p class="intro">选择规则范围，再加入或创建 label。</p><label class="scope-label" for="rule-scope">将分组规则用于</label><select id="rule-scope" aria-label="规则范围"><option value="domain">2 · 根域名（包含所有子域名）</option><option value="host">3 · 域名前缀（完整主机名）</option><option value="page">4 · 具体网页（完整网址）</option></select><p class="rule-target" id="rule-target"></p><p class="match-info" id="match-info"></p>
      <div class="divider">选择已有 label</div>
      <div class="row"><select id="labels" aria-label="当前窗口的 label"></select><button class="secondary" id="join">加入</button></div>
      <div class="divider">或者，新建一个</div>
      <form id="create-form"><div class="row"><input id="new-label" type="text" maxlength="60" placeholder="例如：工作、灵感、稍后看" aria-label="新 label 名称" required><button class="secondary" id="create" type="submit">创建</button></div><div class="colors" id="colors" aria-label="label 颜色"></div></form>
      <p class="match-info">加入或创建时保存规则。具体网页 ＞ 域名前缀 ＞ 根域名 ＞ 默认归组。</p>
      <p class="status" id="status" role="status"></p><p class="demo" id="demo-note" hidden>界面演示 · 以下操作仅修改示例标签组</p>
      <div class="foot"><button class="link" id="manager">打开整理面板 ↗</button><button class="link" id="hide">本页暂时隐藏</button></div>
    </section>`;
  document.documentElement.append(host);
  const $ = id => root.getElementById(id);
  const colors = { green: ['#719468', '绿色'], blue: ['#668abb', '蓝色'], purple: ['#9981b5', '紫色'], cyan: ['#62a19d', '青色'], orange: ['#c29966', '橙色'], pink: ['#bf859b', '粉色'] };
  let color = 'green', context, busy = false, hiddenHere = false, position = { x: 1, y: 0.8 }, dragged = false, drag;
  let demoGroups = [{ id: 1, title: 'BILIBILI', color: 'pink' }, { id: 2, title: '工作', color: 'green' }, { id: 3, title: '灵感', color: 'purple' }], demoGroupId = 1;

  async function request(message) {
    if (live) {
      let result;
      try { result = await chrome.runtime.sendMessage(message); }
      catch { throw new Error('扩展已更新或连接中断，请刷新当前网页后重试。'); }
      if (!result) throw new Error('扩展未响应，请刷新网页后重试。');
      if (result.error) throw new Error(result.error);
      return result;
    }
    const { ruleTarget, matchRule, setRule } = await import('./rules.js');
    const rules = JSON.parse(localStorage.getItem('tab-grove-demo-rules') || '{}');
    const url = 'https://search.bilibili.com/all?keyword=摄影';
    if (message.type === 'pet-context') return { url, domain: 'bilibili.com', siteName: 'BILIBILI', groups: demoGroups, groupId: demoGroupId, rule: matchRule(url, rules), targets: Object.fromEntries(['domain', 'host', 'page'].map(scope => [scope, ruleTarget(url, scope).target])), autoGroup: JSON.parse(localStorage.getItem('tab-grove-settings') || '{}').autoGroup !== false };
    if (message.type === 'pet-open-manager') return { ok: true };
    const desired = message.mode === 'existing' ? demoGroups.find(g => g.id === message.groupId) : { title: message.title.trim(), color: message.color };
    if (!desired) throw new Error('请选择 label。');
    const savedRule = setRule(rules, url, message.ruleScope, desired), effective = matchRule(url, rules);
    let group = demoGroups.find(g => g.title === effective.title);
    if (!group) { group = { id: Math.max(0, ...demoGroups.map(g => g.id)) + 1, title: effective.title, color: effective.color }; demoGroups.push(group); }
    demoGroupId = group.id;
    localStorage.setItem('tab-grove-demo-rules', JSON.stringify(rules)); window.dispatchEvent(new Event('tab-grove-demo-settings'));
    return { title: group.title, savedTitle: desired.title, remembered: true, overridden: effective.key !== savedRule.key };
  }

  function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
  function layout() {
    const width = document.documentElement.clientWidth, height = innerHeight;
    const x = 12 + position.x * Math.max(0, width - 88), y = 12 + position.y * Math.max(0, height - 88);
    host.style.setProperty('--tg-x', `${x}px`); host.style.setProperty('--tg-y', `${y}px`);
    if (!$('panel').hidden) {
      const panel = $('panel'), box = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(12, Math.min(x + 64 - box.width, width - box.width - 12))}px`;
      panel.style.top = `${Math.max(12, Math.min(y - box.height - 12, innerHeight - box.height - 12))}px`;
    }
  }
  function setBusy(value) {
    busy = value;
    for (const id of ['join', 'create', 'labels', 'new-label', 'rule-scope']) $(id).disabled = value || !!context?.pinned;
    if (!value && !context?.groups.length) { $('join').disabled = true; $('labels').disabled = true; }
  }
  async function refresh() {
    context = await request({ type: 'pet-context' });
    const selected = $('labels').value;
    $('labels').replaceChildren(...context.groups.map(group => { const option = document.createElement('option'); option.value = group.id; option.textContent = group.title || '未命名标签组'; return option; }));
    if (context.groups.some(g => String(g.id) === selected)) $('labels').value = selected;
    else if (context.groups.some(g => g.id === context.groupId)) $('labels').value = context.groupId;
    if (!context.groups.length) { const option = document.createElement('option'); option.textContent = '还没有 label，请在下方创建'; $('labels').append(option); }
    setBusy(busy);
    if (context.pinned) status('这是固定标签页，请先取消固定，再加入 label。');
    $('match-info').textContent = context.rule ? `当前生效：${scopeNames[context.rule.scope]} → ${context.rule.title}` : '当前生效：1 · 默认按根域名分组';
    updateTarget();
    layout();
  }
  const scopeNames = { domain: '2 · 根域名', host: '3 · 域名前缀', page: '4 · 具体网页' };
  function updateTarget() { $('rule-target').textContent = context?.targets?.[$('rule-scope').value] || '正在读取…'; layout(); }
  $('rule-scope').onchange = updateTarget;
  function close() { $('panel').hidden = true; $('pet-button').setAttribute('aria-expanded', 'false'); }
  $('pet-button').onclick = async () => {
    if (dragged) { dragged = false; return; }
    if (!$('panel').hidden) { close(); return; }
    $('panel').hidden = false; $('pet-button').setAttribute('aria-expanded', 'true'); status(''); layout(); setBusy(true);
    try { await refresh(); } catch (error) { status(error.message, true); } finally { setBusy(false); }
  };
  $('close').onclick = () => { close(); $('pet-button').focus(); };
  root.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); $('pet-button').focus(); } });
  $('hide').onclick = () => { hiddenHere = true; host.setAttribute('data-hidden', ''); close(); };
  $('manager').onclick = async () => { try { await request({ type: 'pet-open-manager' }); close(); } catch (error) { status(error.message, true); } };
  async function assign(mode) {
    if (busy || !context) return;
    const title = $('new-label').value.trim();
    if (mode === 'create' && !title) { status('给新的 label 起个名字吧。', true); $('new-label').focus(); return; }
    setBusy(true); status('正在加入…');
    try {
      const result = await request({ type: 'pet-assign', mode, title, color, groupId: Number($('labels').value), remember: true, ruleScope: $('rule-scope').value, expectedUrl: context.url });
      await refresh(); $('labels').value = context.groupId;
      status(result.overridden ? `规则已保存 → ${result.savedTitle}。当前网页命中更高优先级规则，加入 ${result.title}。` : `规则已保存，已加入 ${result.title}。`);
      if (mode === 'create') $('new-label').value = '';
    } catch (error) { status(error.message, true); }
    finally { setBusy(false); layout(); }
  }
  $('join').onclick = () => assign('existing');
  $('create-form').onsubmit = event => { event.preventDefault(); assign('create'); };
  for (const [name, [hex, label]] of Object.entries(colors)) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'color'; button.style.setProperty('--color', hex); button.title = label; button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(name === color));
    button.onclick = () => { color = name; [...$('colors').children].forEach(node => node.setAttribute('aria-pressed', String(node === button))); }; $('colors').append(button);
  }
  $('pet-button').onpointerdown = event => {
    if (event.button !== 0) return;
    dragged = false; drag = { x: event.clientX, y: event.clientY, left: host.getBoundingClientRect().left, top: host.getBoundingClientRect().top };
    $('pet-button').setPointerCapture(event.pointerId);
  };
  $('pet-button').onpointermove = event => {
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) dragged = true;
    if (!dragged) return;
    position = { x: Math.max(0, Math.min(1, (drag.left + dx - 12) / Math.max(1, document.documentElement.clientWidth - 88))), y: Math.max(0, Math.min(1, (drag.top + dy - 12) / Math.max(1, innerHeight - 88))) }; layout();
  };
  async function finishDrag() {
    if (!drag) return;
    drag = null;
    if (dragged) {
      try { if (live) await chrome.storage.local.set({ petPosition: position }); else localStorage.setItem('tab-grove-pet-position', JSON.stringify(position)); }
      catch { /* Dragging still works if preferences cannot be saved. */ }
    }
  }
  $('pet-button').onpointerup = finishDrag; $('pet-button').onpointercancel = finishDrag;
  window.addEventListener('resize', layout);
  // Scrollbars can appear after the page renders without a window resize event.
  new ResizeObserver(layout).observe(document.documentElement);
  window.addEventListener('focus', () => { if (!$('panel').hidden && !busy) refresh().catch(error => status(error.message, true)); });
  function applySettings(settings) { host.toggleAttribute('data-hidden', hiddenHere || settings?.petEnabled === false); if (settings?.petEnabled === false) close(); }
  if (live) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.settings) applySettings(changes.settings.newValue);
      if (changes.siteRules && !$('panel').hidden && !busy) refresh().catch(error => status(error.message, true));
      if (changes.petPosition?.newValue && !drag) { position = changes.petPosition.newValue; layout(); }
    });
    chrome.storage.local.get(['settings', 'petPosition']).then(data => { applySettings(data.settings); position = data.petPosition || position; layout(); }).catch(() => {});
  } else {
    $('demo-note').hidden = false;
    try { position = JSON.parse(localStorage.getItem('tab-grove-pet-position')) || position; applySettings(JSON.parse(localStorage.getItem('tab-grove-settings') || '{}')); } catch { /* Use defaults. */ }
    window.addEventListener('tab-grove-demo-settings', () => { applySettings(JSON.parse(localStorage.getItem('tab-grove-settings') || '{}')); });
  }
  layout();
})();
