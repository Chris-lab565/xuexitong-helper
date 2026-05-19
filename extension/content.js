// 学习通助手 - 内容脚本 v1.2.1
// 注入到所有匹配页面，桥接网页 ↔ 扩展后台（postMessage安全传递完整Cookie）

(function() {
    'use strict';

    console.log('[学习通助手] 内容脚本已加载 v1.2.1 location:', location.href, 'readyState:', document.readyState);

    const hostname = location.hostname;
    const isXuexitongPage = hostname.includes('chaoxing.com') || hostname.includes('xuexitong.com');
    const isAppPage = hostname.includes('github.io');

    // 注入 injected.js 到页面上下文
    function injectScript() {
        if (document.getElementById('xuexitong-injected')) {
            console.log('[学习通助手] injected.js 已存在，跳过注入');
            return;
        }

        const script = document.createElement('script');
        script.id = 'xuexitong-injected';
        script.src = chrome.runtime.getURL('injected.js');
        script.onload = function() {
            console.log('[学习通助手] injected.js 加载成功');
            this.remove();
        };
        script.onerror = function(e) {
            console.error('[学习通助手] injected.js 加载失败:', e, '当前页面 CSP 可能阻止了扩展脚本');
        };
        const target = document.head || document.documentElement;
        if (target) {
            target.appendChild(script);
            console.log('[学习通助手] injected.js 已添加到', target.tagName);
        } else {
            console.error('[学习通助手] 无法注入 injected.js: document.head 和 documentElement 均不存在');
            // 等待 DOM 就绪后重试
            document.addEventListener('DOMContentLoaded', function() {
                const retryTarget = document.head || document.documentElement;
                if (retryTarget && !document.getElementById('xuexitong-injected')) {
                    retryTarget.appendChild(script);
                    console.log('[学习通助手] injected.js 重试注入到', retryTarget.tagName);
                }
            });
        }
    }
    injectScript();

    // ---- 主动获取 Cookie 并写入 DOM（仅 app 页面） ----
    function setDomCookie(cookie, uid) {
        // 确保 document.body 存在（content script 在 document_start 运行）
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', function() {
                setDomCookie(cookie, uid);
            });
            return;
        }
        document.body.dataset.xuexitongCookie = cookie;
        document.body.dataset.xuexitongUid = uid || '';
        document.body.dataset.xuexitongCookieReady = '1';

        // postMessage 安全传递完整 Cookie 到网页上下文
        window.postMessage({
            type: 'XUEXITONG_HELPER_COOKIE_READY',
            cookie: cookie,
            uid: uid || ''
        }, '*');
        console.log('[学习通助手] Cookie 已写入DOM + postMessage, len=' + cookie.length);
    }

    async function refreshDomCookie() {
        if (!isAppPage) return;
        console.log('[学习通助手] app 页面，主动获取 Cookie...');

        // 方案A：从 URL hash 读取（popup 直接传递，无需异步通信）
        const hash = window.location.hash.substring(1);
        if (hash && hash.includes('xtcookie=')) {
            const params = new URLSearchParams(hash);
            const hashCookie = params.get('xtcookie');
            const hashUid = params.get('xtuid');
            if (hashCookie) {
                console.log('[学习通助手] Cookie 从 URL hash 读取成功, len=' + hashCookie.length);
                setDomCookie(hashCookie, hashUid);
                // 清理 URL 中的敏感数据
                if (window.history && window.history.replaceState) {
                    window.history.replaceState(null, '', window.location.pathname + window.location.search);
                }
                return;
            }
        }

        // 方案B：通过 Service Worker 获取
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getCookie' });
            if (chrome.runtime.lastError) {
                console.error('[学习通助手] getCookie 失败:', chrome.runtime.lastError.message);
                document.body.dataset.xuexitongCookieError = chrome.runtime.lastError.message;
                return;
            }
            const cookie = response?.cookie || '';
            console.log('[学习通助手] Cookie 获取结果: count=' + (response?.count || 0) + ' len=' + cookie.length);
            setDomCookie(cookie, response?.uid || '');
        } catch (err) {
            console.error('[学习通助手] 获取 Cookie 异常:', err.message);
            document.body.dataset.xuexitongCookieError = err.message;
        }
    }

    // DOM 就绪后立即获取 Cookie
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refreshDomCookie);
    } else {
        refreshDomCookie();
    }

    // 监听来自 injected.js 的消息，转发给 background
    window.addEventListener('message', function(event) {
        if (event.source !== window) return;

        const type = event.data.type;
        console.log('[学习通助手] 收到 postMessage:', type);

        // Ping
        if (type === 'XUEXITONG_HELPER_PING') {
            window.postMessage({ type: 'XUEXITONG_HELPER_PONG' }, '*');
            return;
        }

        // 获取 Cookie（转发给 background，由 background 用 chrome.cookies.getAll 获取完整 Cookie）
        if (type === 'XUEXITONG_GET_COOKIE_FROM_BG') {
            console.log('[学习通助手] 转发 Cookie 请求到 background...');
            chrome.runtime.sendMessage({ action: 'getCookie' }, function(response) {
                if (chrome.runtime.lastError) {
                    console.error('[学习通助手] getCookie 失败:', chrome.runtime.lastError.message);
                    window.postMessage({
                        type: 'XUEXITONG_COOKIE_FROM_BG_RESPONSE',
                        cookie: null,
                        uid: null
                    }, '*');
                    return;
                }
                console.log('[学习通助手] getCookie 成功, count=' + (response?.count || 0));
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
            console.log('[学习通助手] 转发作业请求到 background, cookie长度=' + (event.data.cookie || '').length);
            chrome.runtime.sendMessage({
                action: 'fetchHomework',
                cookie: event.data.cookie || ''
            }, function(response) {
                if (chrome.runtime.lastError) {
                    console.error('[学习通助手] fetchHomework 失败:', chrome.runtime.lastError.message);
                    window.postMessage({
                        type: 'XUEXITONG_HOMEWORK_BG_RESPONSE',
                        success: false,
                        error: chrome.runtime.lastError.message
                    }, '*');
                    return;
                }
                console.log('[学习通助手] fetchHomework 响应: success=' + (response?.success || false));
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
            console.log('[学习通助手] 转发题目请求到 background, url=' + event.data.url);
            chrome.runtime.sendMessage({
                action: 'fetchQuestions',
                cookie: event.data.cookie || '',
                url: event.data.url || ''
            }, function(response) {
                if (chrome.runtime.lastError) {
                    console.error('[学习通助手] fetchQuestions 失败:', chrome.runtime.lastError.message);
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

    // ======================= DOM 爬题 =======================

    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === 'fetchQuestions') {
            console.log('[Content] 收到爬题请求, location:', location.href);
            const questions = parseQuestionsFromDom();
            console.log('[Content] 解析到题目数量:', questions.length);
            sendResponse({ success: true, data: questions, questions: questions });
            return true;
        }
    });

    function parseQuestionsFromDom() {
        const questions = [];
        let qid = 0;

        const questionSelectors = [
            '.TiMu',
            '.singleQ',
            '.qItem',
            '.questionLi',
            '[class*="questionLi"]',
            '[class*="TiMu"]'
        ];

        const questionElements = document.querySelectorAll(questionSelectors.join(','));

        for (const el of questionElements) {
            const titleSelectors = [
                '.clearfix',
                '.titleDiv',
                '.qTitle',
                '.stem',
                '[class*="title"]',
                '[class*="stem"]'
            ];

            let title = '';
            for (const selector of titleSelectors) {
                const titleEl = el.querySelector(selector);
                if (titleEl) {
                    title = titleEl.innerText.replace(/\s+/g, ' ').trim();
                    break;
                }
            }

            if (!title || title.length < 4) continue;

            const options = [];
            const optionSelectors = [
                '.optionDiv',
                '.qOption',
                '.option',
                '[class*="option"]'
            ];

            for (const selector of optionSelectors) {
                const optionEls = el.querySelectorAll(selector);
                for (const optEl of optionEls) {
                    const optText = optEl.innerText.replace(/\s+/g, ' ').trim();
                    if (optText) options.push(optText);
                }
            }

            questions.push({
                qid: ++qid,
                title: title,
                options: options,
                type: options.length > 0 ? '选择题' : '简答题',
                answer: ''
            });
        }

        return questions;
    }
})();
