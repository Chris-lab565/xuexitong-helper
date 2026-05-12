// 学习通助手 - 弹出窗口脚本 v1.1.2

document.addEventListener('DOMContentLoaded', function() {
    const statusEl = document.getElementById('status');
    const refreshBtn = document.getElementById('refreshBtn');
    const openAppBtn = document.getElementById('openAppBtn');
    const cookiePreviewEl = document.getElementById('cookiePreview');

    // 检查 Cookie 状态
    function checkStatus() {
        // 从 storage 检查持久化的 Cookie
        chrome.storage.local.get(['xuexitongCookie', 'xuexitongTime', 'xuexitongUid'], function(result) {
            if (result.xuexitongCookie && result.xuexitongTime) {
                const age = Date.now() - result.xuexitongTime;
                if (age < 30 * 60 * 1000) {
                    statusEl.className = 'status success';
                    statusEl.textContent = '✅ Cookie 已就绪（' + Math.floor(age / 60000) + '分钟前刷新）';
                    cookiePreviewEl.style.display = 'block';
                    cookiePreviewEl.textContent = 'UID: ' + (result.xuexitongUid || '未知');
                    return;
                }
            }

            // 回退：检查 background
            chrome.runtime.sendMessage({ action: 'getCookie' }, function(bgResponse) {
                if (chrome.runtime.lastError) {
                    statusEl.className = 'status error';
                    statusEl.textContent = '❌ 扩展未就绪，请刷新页面';
                    return;
                }
                if (bgResponse && bgResponse.cookie) {
                    statusEl.className = 'status success';
                    statusEl.textContent = '✅ Cookie 已获取（' + (bgResponse.count || '?') + '项）';
                    cookiePreviewEl.style.display = 'block';
                    cookiePreviewEl.textContent = 'UID: ' + (bgResponse.uid || '未知');
                } else {
                    statusEl.className = 'status warning';
                    statusEl.textContent = '⚠️ 请先登录学习通官网';
                }
            });
        });

        // 同时验证当前页面
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            const url = tabs[0]?.url || '';
            if (url.includes('chaoxing.com') || url.includes('xuexitong.com')) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'checkStatus' }, function(response) {
                    if (chrome.runtime.lastError) return;
                    if (response && response.hasCookie) {
                        statusEl.className = 'status success';
                        statusEl.textContent = '✅ 已登录（当前页面）';
                        cookiePreviewEl.style.display = 'block';
                        cookiePreviewEl.textContent = 'UID: ' + (response.uid || '未知');
                    }
                });
            }
        });
    }

    checkStatus();

    // 刷新 Cookie
    refreshBtn.addEventListener('click', function() {
        statusEl.className = 'status warning';
        statusEl.textContent = '🔄 刷新中...';

        chrome.runtime.sendMessage({ action: 'refreshCookie' }, function(response) {
            if (chrome.runtime.lastError) {
                statusEl.className = 'status error';
                statusEl.textContent = '❌ 刷新失败: ' + chrome.runtime.lastError.message;
                return;
            }
            if (response && response.success) {
                statusEl.className = 'status success';
                statusEl.textContent = '✅ 已刷新（获取 ' + (response.count || 0) + ' 项 Cookie）';
                cookiePreviewEl.style.display = 'block';
                cookiePreviewEl.textContent = 'UID: ' + (response.uid || '未知');
            } else {
                statusEl.className = 'status error';
                statusEl.textContent = '❌ 刷新失败，请确认已登录学习通';
            }
        });
    });

    // 打开应用：先保存 Cookie 到 storage.local，再打开助手网页
    openAppBtn.addEventListener('click', function() {
        statusEl.textContent = '⏳ 获取 Cookie...';

        chrome.runtime.sendMessage({ action: 'getCookie' }, function(response) {
            // 保存到 storage.local，供助手网页 api.js 读取
            chrome.storage.local.set({
                xuexitongCookie: response?.cookie || '',
                xuexitongUid: response?.uid || '',
                xuexitongTime: Date.now()
            }, function() {
                // 打开助手网页
                chrome.tabs.create({
                    url: 'https://chris-lab565.github.io/xuexitong-helper/app.html',
                    active: true
                });
            });
        });
    });
});
