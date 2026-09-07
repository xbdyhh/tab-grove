const samples = [
  ['github.com', 'React · 用于构建用户界面的库', '/facebook/react'],
  ['github.com', '我的项目 · Issues 与开发进度', '/my-workspace/project/issues'],
  ['github.com', 'React · 用于构建用户界面的库', '/facebook/react'],
  ['github.com', '探索开源项目 · GitHub Explore', '/explore'],
  ['bilibili.com', '周末充电：从零开始学习摄影', '/video/BV1demo001'],
  ['search.bilibili.com', 'B 站搜索 · 适合专注工作的背景音乐', '/all?keyword=轻爵士'],
  ['bilibili.com', '周末充电：从零开始学习摄影', '/video/BV1demo001'],
  ['figma.com', '品牌视觉设计 · Design workspace', '/design/demo/brand'],
  ['figma.com', '灵感收集板 · 一些不错的设计', '/board/demo/inspiration'],
  ['notion.so', '本周计划与随手记', '/weekly-planner'],
  ['notion.so', '阅读清单 · 慢慢读，慢慢想', '/reading-list'],
  ['developer.chrome.com', 'Chrome 扩展程序开发指南', '/docs/extensions'],
  ['sspai.com', '少数派 · 找到适合自己的工作方式', '/post/100000'],
  ['chrome', '设置', 'chrome://settings/']
];
export const demoTabs = samples.map(([domain, title, path], i) => ({ id: i + 1, windowId: i > 10 ? 2 : 1, index: i, title, url: domain === 'chrome' ? path : `https://${domain}${path}`, pinned: i === 9, groupId: -1, audible: i === 5 }));
