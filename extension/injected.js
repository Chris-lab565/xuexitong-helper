// 学习通助手 - 注入脚本 v1.2.10
// 运行在页面上下文中，可访问 document.cookie
// 通过 postMessage 与 content.js 通信，content.js 再与 background.js 通信

(function() {
    'use strict';

    console.log('[学习通助手] 注入脚本已加载 v1.2.10 hostname:', location.hostname, 'href:', location.href);

    const hostname = location.hostname;
    const isXuexitongPage = hostname.includes('chaoxing.com') || hostname.includes('xuexitong.com');
    const isAppPage = hostname.includes('github.io');

    console.log('[学习通助手] 页面类型: isXuexitongPage=' + isXuexitongPage + ' isAppPage=' + isAppPage);

    let installedNotified = false;
    function notifyInstalledOnce() {
        if (installedNotified) return;
        installedNotified = true;
        console.log('[学习通助手] 通知页面扩展已安装');
        window.postMessage({ type: 'XUEXITONG_HELPER_EXTENSION_INSTALLED' }, '*');
        window.xuexitongExtensionInstalled = true;
    }

    // 立即通知一次（在监听器注册前就绪）
    notifyInstalledOnce();

    // 处理来自网页的消息
    window.addEventListener('message', function(event) {
        if (event.source !== window) return;

        const type = event.data.type;
        console.log('[学习通助手] 收到 postMessage:', type);

        // Ping - 检测扩展是否安装
        if (type === 'XUEXITONG_HELPER_PING') {
            console.log('[学习通助手] 响应 PING');
            notifyInstalledOnce();
            window.postMessage({ type: 'XUEXITONG_HELPER_PONG' }, '*');
            return;
        }

        // 获取 Cookie
        if (type === 'XUEXITONG_HELPER_GET_COOKIE') {
            console.log('[学习通助手] 收到获取 Cookie 请求, isAppPage=' + isAppPage + ' isXuexitongPage=' + isXuexitongPage);
            if (isXuexitongPage) {
                const cookie = document.cookie;
                console.log('[学习通助手] 学习通页面，document.cookie 长度=' + cookie.length);
                window.postMessage({
                    type: 'XUEXITONG_HELPER_COOKIE_RESPONSE',
                    cookie
                }, '*');
            } else if (isAppPage) {
                console.log('[学习通助手] app 页面，转发到 content.js → background');
                window.postMessage({
                    type: 'XUEXITONG_GET_COOKIE_FROM_BG'
                }, '*');
            } else {
                console.log('[学习通助手] 未知页面类型，返回 null');
                window.postMessage({
                    type: 'XUEXITONG_HELPER_COOKIE_RESPONSE',
                    cookie: null
                }, '*');
            }
            return;
        }

        // 获取作业列表（统一走 background.js 代理 — v1.2.10）
        if (type === 'XUEXITONG_HELPER_FETCH_HOMEWORK') {
            const cookie = event.data.cookie || '';
            console.log('[学习通助手] 收到获取作业请求, cookie长度=' + cookie.length);
            // 统一转发到 content.js → background.js（使用最新API和完整请求头）
            window.postMessage({
                type: 'XUEXITONG_FETCH_HOMEWORK_BG',
                cookie: cookie
            }, '*');
            return;
        }

        // 获取题目
        if (type === 'XUEXITONG_HELPER_FETCH_QUESTIONS') {
            const { cookie, url } = event.data;
            console.log('[学习通助手] 收到获取题目请求, url=' + url);

            if (isXuexitongPage) {
                fetchQuestionsDirect(cookie, url);
            } else if (isAppPage) {
                window.postMessage({
                    type: 'XUEXITONG_FETCH_QUESTIONS_BG',
                    cookie: cookie || '',
                    url: url || ''
                }, '*');
            } else {
                window.postMessage({
                    type: 'XUEXITONG_HELPER_QUESTIONS_RESPONSE',
                    success: false,
                    error: '当前页面不支持获取题目'
                }, '*');
            }
            return;
        }

        // 接收来自 content.js 的 Cookie 响应，转发给 api.js
        if (type === 'XUEXITONG_COOKIE_FROM_BG_RESPONSE') {
            console.log('[学习通助手] 收到 Cookie 响应, cookie=' + (event.data.cookie ? '有(' + event.data.cookie.length + '字符)' : '空'));
            window.postMessage({
                type: 'XUEXITONG_HELPER_COOKIE_RESPONSE',
                cookie: event.data.cookie,
                uid: event.data.uid
            }, '*');
            return;
        }

        // 接收来自 content.js 的作业响应，转发给 api.js
        if (type === 'XUEXITONG_HOMEWORK_BG_RESPONSE') {
            console.log('[学习通助手] 收到作业响应: success=' + event.data.success + ' error=' + event.data.error);
            window.postMessage({
                type: 'XUEXITONG_HELPER_HOMEWORK_RESPONSE',
                success: event.data.success,
                data: event.data.data,
                error: event.data.error
            }, '*');
            return;
        }

        // 接收来自 content.js 的题目响应，转发给 api.js
        if (type === 'XUEXITONG_QUESTIONS_BG_RESPONSE') {
            console.log('[学习通助手] 收到题目响应: success=' + event.data.success);
            window.postMessage({
                type: 'XUEXITONG_HELPER_QUESTIONS_RESPONSE',
                success: event.data.success,
                data: event.data.data,
                error: event.data.error
            }, '*');
            return;
        }
    });

    // 在学习通页面直接获取题目（仅题目页面使用，作业获取走background.js）
    async function fetchQuestionsDirect(cookie, url) {
        try {
            const response = await fetch(url, {
                headers: { 'Cookie': cookie }
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const html = await response.text();
            window.postMessage({
                type: 'XUEXITONG_HELPER_QUESTIONS_RESPONSE',
                success: true,
                data: html
            }, '*');
        } catch (err) {
            window.postMessage({
                type: 'XUEXITONG_HELPER_QUESTIONS_RESPONSE',
                success: false,
                error: err.message
            }, '*');
        }
    }
})();
