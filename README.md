# 学习通作业助手

纯前端 + 浏览器扩展方案，无需后端服务器。

> **v1.1.0** - 修复 Cookie 获取问题，使用 `chrome.cookies.getAll()` 获取完整 Cookie

## 使用步骤

### 1. 安装浏览器扩展

1. 下载 `extension/` 文件夹（或从 Releases 下载 zip）
2. 打开 Chrome/Edge 浏览器
3. 地址栏输入 `chrome://extensions/` 或 `edge://extensions/`
4. 开启右上角的「开发者模式」
5. 点击「加载已解压的扩展程序」
6. 选择 `extension/` 文件夹
7. 扩展安装成功！

### 2. 注册 Moonshot AI

1. 打开 https://platform.moonshot.cn
2. 用手机号注册账号
3. 进入「API Key 管理」页面
4. 创建新的 API Key（复制保存）
5. 新用户有 15 元免费额度

### 3. 使用作业助手

1. **登录学习通**：打开 https://mooc1.chaoxing.com 并登录
2. **刷新Cookie**：点击浏览器右上角扩展图标 → 点击「刷新 Cookie」
3. **打开助手网页**：点击「打开应用」→ 跳转到 https://chris-lab565.github.io/xuexitong-helper/app.html
4. **设置 API Key**：在页面中粘贴你的 Moonshot API Key → 点击保存
5. **获取作业**：点击「🚀 一键获取作业」
6. **查看答案**：点击「📝 查看题目」→ 「🤖 AI生成答案思路」

## 注意事项

- 必须安装扩展才能获取学习通数据
- API Key 只保存在浏览器本地，不会上传到任何服务器
- 请妥善保管 API Key，不要分享给他人
- 免费额度用完后需要充值才能继续使用

## 常见问题

**Q: 提示"扩展未安装"？**
A: 请确保已按步骤安装扩展，并在学习通页面登录后刷新 Cookie。

**Q: 获取作业时提示"无法获取学习通 Cookie"？**
A: 请确保：1. 已登录学习通官网 2. 点击扩展图标 → 刷新 Cookie 3. 再点击「打开应用」

**Q: 提示"API Key 无效"？**
A: 请检查 API Key 是否复制完整，或尝试在 Moonshot 平台重新生成。

**Q: 免费额度用完了怎么办？**
A: 可以在 Moonshot 平台充值，或者注册新账号获取新的免费额度。

## 更新日志

### v1.1.0
- 🔧 修复：使用 `chrome.cookies.getAll()` 获取完整Cookie（含HttpOnly关键登录凭证）
- 🔧 修复：Cookie 持久化到 `chrome.storage.local`，防止 Service Worker 休眠后丢失
- 🔧 修复：Cookie 在作业获取链路中正确传递（api.js → injected.js → content.js → background.js）
- ✨ 新增：作业列表含跳转学习通提交链接
- 🗑️ 移除：不再使用的 Flask 后端代码

### v1.0.0
- ✅ 学习通 Cookie 登录
- ✅ 自动获取作业列表
- ✅ AI 生成答案
