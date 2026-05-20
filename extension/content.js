// 学习通助手 v1.2.10 — content.js | ShadowDOM 常驻浮窗 | 注入 inject.js
(function() {
    'use strict';

    // ==================== 防止重复注入 ====================
    if (window.__xxtInjected) {
        console.log('[Content] already injected');
        return;
    }
    window.__xxtInjected = true;
    console.log('[Content] content.js loaded');

    // ==================== 注入 inject.js（带重试，兼容 document_start） ====================
    const hostname = location.hostname;
    const isXuexitongPage = hostname.includes('chaoxing.com') || hostname.includes('xuexitong.com');
    const isAppPage = hostname.includes('github.io');
    const isTopWindow = (window.top === window.self);

    (function injectScript() {
        function doInject() {
            try {
                const parent = document.head || document.documentElement || document.body;
                if (!parent) {
                    setTimeout(doInject, 50);
                    return;
                }
                const s = document.createElement('script');
                s.src = chrome.runtime.getURL('inject.js');
                s.onload = function() {
                    console.log('[Content] inject.js injected');
                    s.remove();
                };
                s.onerror = function(e) {
                    console.error('[Content] inject.js load failed', e);
                };
                parent.appendChild(s);
            } catch (e) {
                console.error('[Content] inject.js 注入失败', e);
            }
        }
        doInject();
    })();

    // ==================== userEditing 状态锁 ====================
    let userEditing = false;
    let latestQuestions = [];

    // ==================== AI 面板（仅顶层窗口创建） ====================
    if (!isTopWindow) {
        console.log('[Content] iframe skip UI');
    } else if (window.__xxtUIPanelCreated) {
        console.log('[Content] UI already exists');
    } else {
        window.__xxtUIPanelCreated = true;
        createAIPanel();
    }

    function createAIPanel() {
        console.log('[Content] create AI panel');

        const panel = document.createElement('div');
        panel.id = 'xxt-ai-panel';
        panel.style.cssText = 'position:fixed;right:24px;bottom:24px;width:380px;z-index:999999;pointer-events:none;background:transparent;';

        const root = panel.attachShadow({ mode: 'open' });

        root.innerHTML = `
            <style>
                :host { font-family: system-ui, sans-serif; }
                .box {
                    pointer-events: auto;
                    background: #fff;
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
                    padding: 14px;
                    border: 1px solid #eee;
                }
                h4 { margin: 0 0 10px 0; font-size: 14px; color: #222; }
                textarea {
                    width: 100%;
                    height: 140px;
                    box-sizing: border-box;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    padding: 10px;
                    font-size: 14px;
                    resize: vertical;
                    outline: none;
                    font-family: inherit;
                }
                textarea:focus { border-color: #007bff; }
                .btns { display: flex; gap: 10px; margin-top: 10px; }
                button {
                    flex: 1;
                    padding: 10px;
                    border: none;
                    border-radius: 8px;
                    background: #007bff;
                    color: white;
                    font-size: 14px;
                    cursor: pointer;
                    transition: opacity 0.15s;
                }
                button:hover { opacity: 0.85; }
                #copyBtn { background: #6c757d; }
                #answer {
                    margin-top: 12px;
                    font-size: 14px;
                    white-space: pre-wrap;
                    max-height: 220px;
                    overflow: auto;
                    color: #222;
                    line-height: 1.6;
                }
            </style>
            <div class="box">
                <h4>AI 答题助手</h4>
                <textarea id="qInput" placeholder="题目自动显示在这里，可直接编辑…"></textarea>
                <div class="btns">
                    <button id="genBtn">⚡ 生成答案</button>
                    <button id="copyBtn">📋 复制</button>
                </div>
                <div id="answer"></div>
            </div>
        `;

        // 挂载到 documentElement，防止 body 被学习通替换导致面板消失
        document.documentElement.appendChild(panel);

        // 暴露 UI 引用
        window.__xxtUI = {
            panel,
            input: root.getElementById('qInput'),
            answer: root.getElementById('answer')
        };

        // ==================== userEditing 锁 ====================
        const textarea = window.__xxtUI.input;
        textarea.addEventListener('focus', function() {
            userEditing = true;
        });
        textarea.addEventListener('blur', function() {
            setTimeout(function() { userEditing = false; }, 2000);
        });

        // ==================== AI 生成 ====================
        root.getElementById('genBtn').addEventListener('click', async function() {
            const text = textarea.value.trim();
            if (!text) { alert('请输入题目内容'); return; }
            window.__xxtUI.answer.textContent = 'AI 思考中…';
            try {
                const apiKey = await getApiKey();
                if (!apiKey) { window.__xxtUI.answer.textContent = '请先在应用页面设置 Moonshot API Key'; return; }
                const resp = await fetch('https://api.moonshot.cn/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + apiKey
                    },
                    body: JSON.stringify({
                        model: 'moonshot-v1-8k',
                        messages: [
                            { role: 'system', content: '你是学习通答题助手，请根据题目内容给出正确答案。只输出答案，不要解释过程。' },
                            { role: 'user', content: text }
                        ],
                        temperature: 1,
                        max_tokens: 1000
                    })
                });
                const data = await resp.json();
                window.__xxtUI.answer.textContent = data.choices?.[0]?.message?.content || '未获取到答案';
            } catch(e) {
                window.__xxtUI.answer.textContent = '生成失败: ' + e.message;
            }
        });

        // ==================== 复制 ====================
        root.getElementById('copyBtn').addEventListener('click', function() {
            const ans = window.__xxtUI.answer.textContent;
            if (!ans || ans === 'AI 思考中…') { alert('请先生成答案'); return; }
            navigator.clipboard.writeText(ans).then(function() {
                alert('答案已复制到剪贴板');
            }).catch(function() {
                const ta = document.createElement('textarea');
                ta.value = ans;
                ta.style.cssText = 'position:fixed;left:-9999px;';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                alert('答案已复制到剪贴板');
            });
        });

        console.log('[Content] AI panel created');
    }

    async function getApiKey() {
        return new Promise(function(resolve) {
            chrome.storage.local.get(['moonshot_api_key'], function(result) {
                resolve(result.moonshot_api_key || null);
            });
        });
    }

    // ==================== 监听 inject.js 的题目推送 ====================
    window.addEventListener('message', function(e) {
        if (e.origin !== location.origin) return;
        if (e.data && e.data.type === 'XXT_QUESTIONS') {
            const qs = e.data.questions || [];
            latestQuestions = qs;
            if (!userEditing) syncToAIInput(qs);
            chrome.runtime.sendMessage({ action: 'questionsUpdated', questions: qs }).catch(function(){});
        }
    });

    function syncToAIInput(questions) {
        const input = window.__xxtUI && window.__xxtUI.input;
        if (!input || userEditing) return;
        const text = questions.map(function(q, i) {
            return (i + 1) + '. ' + q.title + '\n' + (q.options || []).join('\n');
        }).join('\n\n');
        if (text.trim()) input.value = text;
    }

    // ==================== 后台指令 ====================
    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
        if (msg.action === 'fetchQuestions') {
            sendResponse({ success: true, questions: latestQuestions });
            return true;
        }
        return false;
    });

    // ==================== 监听 storage 中的 API Key 变更 ====================
    chrome.storage.onChanged.addListener(function(changes) {
        if (changes.moonshot_api_key) {
            console.log('[Content] API Key 已更新');
        }
    });

    // ==================== GitHub Pages 应用页 Cookie 桥接 ====================
    if (isAppPage) {
        function setDomCookie(cookie, uid) {
            function ready() {
                if (!document.body) return;
                document.body.dataset.xuexitongCookie = cookie;
                document.body.dataset.xuexitongUid = uid || '';
                document.body.dataset.xuexitongCookieReady = '1';
                window.postMessage({ type: 'XUEXITONG_HELPER_COOKIE_READY', cookie: cookie, uid: uid || '' }, location.origin);
            }
            if (!document.body) { document.addEventListener('DOMContentLoaded', ready); }
            else { ready(); }
        }

        async function refreshDomCookie() {
            const hash = window.location.hash.substring(1);
            if (hash && hash.includes('xtcookie=')) {
                const params = new URLSearchParams(hash);
                const hashCookie = params.get('xtcookie');
                const hashUid = params.get('xtuid');
                if (hashCookie) {
                    setDomCookie(hashCookie, hashUid);
                    if (window.history && window.history.replaceState) {
                        window.history.replaceState(null, '', window.location.pathname + window.location.search);
                    }
                    return;
                }
            }
            try {
                const response = await chrome.runtime.sendMessage({ action: 'getCookie' });
                if (chrome.runtime.lastError) { document.body.dataset.xuexitongCookieError = chrome.runtime.lastError.message; return; }
                setDomCookie(response?.cookie || '', response?.uid || '');
            } catch(err) {
                document.body.dataset.xuexitongCookieError = err.message;
            }
        }

        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', refreshDomCookie); }
        else { refreshDomCookie(); }

        // 转发 postMessage → chrome.runtime
        window.addEventListener('message', function(event) {
            if (event.source !== window) return;
            const type = event.data && event.data.type;
            if (type === 'XUEXITONG_HELPER_PING') {
                window.postMessage({ type: 'XUEXITONG_HELPER_PONG' }, location.origin);
                return;
            }
            if (type === 'XUEXITONG_GET_COOKIE_FROM_BG') {
                chrome.runtime.sendMessage({ action: 'getCookie' }, function(resp) {
                    window.postMessage({ type: 'XUEXITONG_COOKIE_FROM_BG_RESPONSE', cookie: resp?.cookie || null, uid: resp?.uid || null, count: resp?.count || 0 }, location.origin);
                });
                return;
            }
            if (type === 'XUEXITONG_FETCH_HOMEWORK_BG') {
                chrome.runtime.sendMessage({ action: 'fetchHomework', cookie: event.data.cookie || '' }, function(resp) {
                    window.postMessage({ type: 'XUEXITONG_HOMEWORK_BG_RESPONSE', success: resp?.success || false, data: resp?.data || null, error: resp?.error || null }, location.origin);
                });
                return;
            }
            if (type === 'XUEXITONG_SET_API_KEY') {
                chrome.storage.local.set({ moonshot_api_key: event.data.apiKey || '' });
                return;
            }
            if (type === 'XUEXITONG_FETCH_QUESTIONS_BG') {
                chrome.runtime.sendMessage({ action: 'fetchQuestions', cookie: event.data.cookie || '', url: event.data.url || '' }, function(resp) {
                    window.postMessage({ type: 'XUEXITONG_QUESTIONS_BG_RESPONSE', success: resp?.success || false, data: resp?.data || null, error: resp?.error || null }, location.origin);
                });
                return;
            }
        });
    }

    console.log('[Content] v1.2.10 已加载');
})();
