// 学习通助手 v1.2.10 — content.js | ShadowDOM 常驻浮窗 | 注入 inject.js
(function() {
    'use strict';

    // 防止重复创建浮窗
    if (window.__xxtInjected) return;
    window.__xxtInjected = true;

    // 稳定注入 inject.js 到页面主上下文
    function injectHookScript() {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('inject.js');
      script.onload = function() {
        this.remove();
        console.log('[Content] inject.js 已成功注入');
      };
      script.onerror = function() {
        console.error('[Content] inject.js 注入失败');
      };
      // 插入到 head 最前，避免被页面 DOM 操作移除
      document.head.prepend(script);
    }

    // 确保 DOM 就绪后再注入
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectHookScript);
    } else {
      injectHookScript();
    }

    // ==================== userEditing 状态锁 ====================
    let userEditing = false;
    let lastQuestions = [];

    // ==================== Shadow DOM 浮窗 ====================
    const panel = document.createElement('div');
    panel.id = '__xxt_ai_panel';
    panel.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;width:380px;transition:transform 0.2s,opacity 0.2s;';

    const root = panel.attachShadow({ mode: 'open' });

    // 拖拽状态
    let isDragging = false, dragStartX = 0, dragStartY = 0, panelStartX = 0, panelStartY = 0;
    let isMinimized = false, isCollapsed = false;

    root.innerHTML = `
        <style>
            :host { --primary: #007bff; --bg: #fff; --border: #e0e0e0; --text: #222; font-family: system-ui, sans-serif; }
            .box { background: var(--bg); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.18); overflow: hidden; }
            .header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px;
                background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; cursor: move; user-select: none;
                font-size: 14px; font-weight: 600; }
            .header-btns { display: flex; gap: 4px; }
            .header-btns button { width: 26px; height: 26px; border: none; border-radius: 6px;
                background: rgba(255,255,255,0.2); color: #fff; cursor: pointer; font-size: 14px; line-height: 1;
                display: flex; align-items: center; justify-content: center; transition: background 0.15s; }
            .header-btns button:hover { background: rgba(255,255,255,0.35); }
            .body { padding: 12px 14px; transition: max-height 0.3s, padding 0.3s; overflow: hidden; }
            .body.collapsed { max-height: 0; padding: 0 14px; }
            textarea { width: 100%; height: 140px; box-sizing: border-box; border: 1px solid var(--border);
                border-radius: 8px; padding: 10px; font-size: 13px; resize: vertical; outline: none;
                transition: border-color 0.2s; font-family: inherit; color: var(--text); }
            textarea:focus { border-color: var(--primary); }
            .btns { display: flex; gap: 8px; margin-top: 10px; }
            .btns button { flex: 1; padding: 10px 0; border: none; border-radius: 8px; font-size: 14px;
                font-weight: 500; cursor: pointer; transition: opacity 0.15s; }
            .btns button:hover { opacity: 0.85; }
            #genBtn { background: var(--primary); color: #fff; }
            #copyBtn { background: #e9ecef; color: #333; }
            #answer { margin-top: 10px; font-size: 13px; white-space: pre-wrap; max-height: 220px;
                overflow-y: auto; color: var(--text); line-height: 1.6; }
            .minimized .body { display: none; }
            .minimized .box { border-radius: 12px; }
        </style>
        <div class="box" id="box">
            <div class="header" id="header">
                <span>🤖 AI 答题助手</span>
                <div class="header-btns">
                    <button id="minBtn" title="最小化">━</button>
                    <button id="colBtn" title="折叠">▲</button>
                </div>
            </div>
            <div class="body" id="body">
                <textarea id="qInput" placeholder="题目自动显示在这里，可直接编辑…"></textarea>
                <div class="btns">
                    <button id="genBtn">⚡ 生成答案</button>
                    <button id="copyBtn">📋 复制</button>
                </div>
                <div id="answer"></div>
            </div>
        </div>
    `;

    document.body.appendChild(panel);

    // DOM 引用
    const headerEl = root.getElementById('header');
    const bodyEl = root.getElementById('body');
    const textarea = root.getElementById('qInput');
    const answerEl = root.getElementById('answer');
    const boxEl = root.getElementById('box');

    // ==================== 拖拽 ====================
    headerEl.addEventListener('mousedown', function(e) {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = panel.getBoundingClientRect();
        panelStartX = rect.left;
        panelStartY = rect.top;
        panel.style.transition = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = (panelStartX + dx) + 'px';
        panel.style.top = (panelStartY + dy) + 'px';
    });

    document.addEventListener('mouseup', function() {
        if (!isDragging) return;
        isDragging = false;
        panel.style.transition = 'transform 0.2s, opacity 0.2s';
    });

    // ==================== 最小化/折叠 ====================
    root.getElementById('minBtn').addEventListener('click', function() {
        isMinimized = !isMinimized;
        boxEl.classList.toggle('minimized', isMinimized);
        this.textContent = isMinimized ? '□' : '━';
    });

    root.getElementById('colBtn').addEventListener('click', function() {
        isCollapsed = !isCollapsed;
        bodyEl.classList.toggle('collapsed', isCollapsed);
        this.textContent = isCollapsed ? '▼' : '▲';
    });

    // ==================== userEditing 锁 ====================
    textarea.addEventListener('focus', function() {
        userEditing = true;
    });
    textarea.addEventListener('blur', function() {
        setTimeout(function() { userEditing = false; }, 2000);
    });

    // ==================== AI 生成/复制 ====================
    root.getElementById('genBtn').addEventListener('click', async function() {
        const text = textarea.value.trim();
        if (!text) { alert('请输入题目内容'); return; }
        answerEl.textContent = 'AI 思考中…';
        try {
            const apiKey = await getApiKey();
            if (!apiKey) { answerEl.textContent = '请先在应用页面设置 Moonshot API Key'; return; }
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
            answerEl.textContent = data.choices?.[0]?.message?.content || '未获取到答案';
        } catch(e) {
            answerEl.textContent = '生成失败: ' + e.message;
        }
    });

    root.getElementById('copyBtn').addEventListener('click', function() {
        const ans = answerEl.textContent;
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
            lastQuestions = qs;
            if (!userEditing) syncToAIInput(qs);
            chrome.runtime.sendMessage({ action: 'questionsUpdated', questions: qs }).catch(function(){});
        }
    });

    function syncToAIInput(questions) {
        if (!textarea || userEditing) return;
        const text = questions.map(function(q, i) {
            return (i + 1) + '. ' + q.title + '\n' + (q.options || []).join('\n');
        }).join('\n\n');
        if (text.trim()) textarea.value = text;
    }

    // ==================== 后台指令 ====================
    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
        if (msg.action === 'fetchQuestions') {
            sendResponse({ success: true, questions: lastQuestions || [] });
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

    console.log('[Content] v1.2.10 已加载, inject.js 已注入');

    // ==================== GitHub Pages 应用页 Cookie 桥接（向后兼容） ====================
    const hostname = location.hostname;
    const isXuexitongPage = hostname.includes('chaoxing.com') || hostname.includes('xuexitong.com');
    const isAppPage = hostname.includes('github.io');

    if (isAppPage) {
        // Cookie 写入 DOM + postMessage
        function setDomCookie(cookie, uid) {
            const ready = function() {
                if (!document.body) return;
                document.body.dataset.xuexitongCookie = cookie;
                document.body.dataset.xuexitongUid = uid || '';
                document.body.dataset.xuexitongCookieReady = '1';
                window.postMessage({ type: 'XUEXITONG_HELPER_COOKIE_READY', cookie: cookie, uid: uid || '' }, location.origin);
            };
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
})();
