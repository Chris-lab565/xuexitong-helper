// 学习通助手 - 内容脚本 v1.1.0
// 注入到所有匹配页面，桥接网页 ↔ 扩展后台

(function() {
    'use strict';

    console.log('[学习通助手] 内容脚本已加载:', location.href);

    const hostname = location.hostname;
    const isXuexitongPage = hostname.includes('chaoxing.com') || hostname.includes('xuexitong.com');
    const isAppPage = hostname.includes('github.io');

    // 注入 injected.js 到页面上下文
    function injectScript() {
        if (document.getElementById('xuexitong-injected')) return;

        const script = document.createElement('script');
        script.id = 'xuexitong-injected';
        script.src = chrome.runtime.getURL('injected.js');
        script.onload = function() {
            console.log('[学习通助手] injected.js 加载成功');
            this.remove();
        };
        script.onerror = function(e) {
            console.error('[学习通助手] injected.js 加载失败:', e);
        };
        (document.head || document.documentElement).appendChild(script);
    }
    injectScript();

    // 监听来自 injected.js 的消息，转发给 background
    window.addEventListener('message', function(event) {
        if (event.source !== window) return;

        const type = event.data.type;

        // Ping
        if (type === 'XUEXITONG_HELPER_PING') {
            window.postMessage({ type: 'XUEXITONG_HELPER_PONG' }, '*');
            return;
        }

        // 获取 Cookie（转发给 background，由 background 用 chrome.cookies.getAll 获取完整 Cookie）
        if (type === 'XUEXITONG_GET_COOKIE_FROM_BG') {
            chrome.runtime.sendMessage({ action: 'getCookie' }, function(response) {
                if (chrome.runtime.lastError) {
                    window.postMessage({
                        type: 'XUEXITONG_COOKIE_FROM_BG_RESPONSE',
                        cookie: null,
                        uid: null
                    }, '*');
                    return;
                }
                window.postMessage({
                    type: 'XUEXITONG_COOKIE_FROM_BG_RESPONSE',
                    cookie: response?.cookie || null,
                    uid: response?.uid || null,
                    count: response?.count || 0
                }, '*');
            });
            return;
        }

        // 获取作业（带 Cookie 转发给 background）
        if (type === 'XUEXITONG_FETCH_HOMEWORK_BG') {
            chrome.runtime.sendMessage({
                action: 'fetchHomework',
                cookie: event.data.cookie || ''
            }, function(response) {
                if (chrome.runtime.lastError) {
                    window.postMessage({
                        type: 'XUEXITONG_HOMEWORK_BG_RESPONSE',
                        success: false,
                        error: chrome.runtime.lastError.message
                    }, '*');
                    return;
                }
                window.postMessage({
                    type: 'XUEXITONG_HOMEWORK_BG_RESPONSE',
                    success: response?.success || false,
                    data: response?.data || null,
                    error: response?.error || null
                }, '*');
            });
            return;
        }

        // 获取题目（带 Cookie 转发给 background）
        if (type === 'XUEXITONG_FETCH_QUESTIONS_BG') {
            chrome.runtime.sendMessage({
                action: 'fetchQuestions',
                cookie: event.data.cookie || '',
                url: event.data.url || ''
            }, function(response) {
                if (chrome.runtime.lastError) {
                    window.postMessage({
                        type: 'XUEXITONG_QUESTIONS_BG_RESPONSE',
                        success: false,
                        error: chrome.runtime.lastError.message
                    }, '*');
                    return;
                }
                window.postMessage({
                    type: 'XUEXITONG_QUESTIONS_BG_RESPONSE',
                    success: response?.success || false,
                    data: response?.data || null,
                    error: response?.error || null
                }, '*');
            });
            return;
        }
    });

    // 监听来自 popup 的消息
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === 'checkStatus') {
            const cookies = document.cookie;
            const hasCookie = cookies.includes('UID') || cookies.includes('_uid') || cookies.includes('fid');
            let uid = null;
            const uidMatch = cookies.match(/UID=(\d+)/) || cookies.match(/_uid=(\d+)/);
            if (uidMatch) uid = uidMatch[1];

            sendResponse({ hasCookie, uid, url: location.href });
            return true;
        }

        if (request.action === 'refreshCookie') {
            // 触发 background 刷新 Cookie
            chrome.runtime.sendMessage({ action: 'refreshCookie' }, function() {
                sendResponse({ success: true });
            });
            return true;
        }
    });
})();
