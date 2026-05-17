# 🎓 学习通作业助手

一键查作业 · AI智能答题 · 跳转提交

纯前端 + 浏览器扩展方案，无需后端服务器。

## 项目结构

```
xuexitong-helper/
├── extension/          # 浏览器扩展源码 (v1.1.0)
│   ├── manifest.json   # 扩展配置
│   ├── background.js   # Service Worker（Cookie获取 + API代理）
│   ├── content.js      # 内容脚本（消息桥接）
│   ├── injected.js     # 页面注入脚本
│   ├── popup.html      # 扩展弹窗
│   └── popup.js        # 弹窗逻辑
├── frontend/           # 前端页面（部署到 GitHub Pages）
│   ├── index.html      # 激活页面
│   └── app.html        # 主应用（作业列表 + AI答案）
└── README.md
```

## 快速开始

### 1. 安装浏览器扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `extension/` 文件夹

### 2. 部署前端（GitHub Pages）

将 `frontend/` 文件夹内容推送到 GitHub 仓库，启用 GitHub Pages。

## 使用流程

1. 浏览器打开 https://mooc1.chaoxing.com 登录学习通
2. 点击扩展图标 → 「刷新 Cookie」→ 「打开应用」
3. 在助手网页设置 Moonshot API Key
4. 点击「一键获取作业」查看作业列表
5. 点击「查看题目」获取 AI 答案

## 技术栈

- **前端**：原生 HTML5 + CSS3 + JavaScript
- **扩展**：Chrome Extension Manifest V3
- **AI**：Moonshot API (Kimi K2.5)
- **部署**：GitHub Pages

## 注意事项

⚠️ Cookie 包含登录凭证，请妥善保管
⚠️ 请合理控制 API 调用频率
⚠️ 仅供学习交流使用
