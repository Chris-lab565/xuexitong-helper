// 学习通助手 v1.2.10 — 全自动抗改版 | 接口劫持+DOM双兜底 | iframe+shadowDOM全覆盖
(function() {
    'use strict';

    // 防止重复注入
    if (window.__xxtHooked) return;
    window.__xxtHooked = true;

    const questionHashes = new Set();
    const questionCache = new WeakMap();
    const observers = new Set();
    let lastQuestions = [];
    let debounceTimer = null;
    const DEBOUNCE_MS = 300;

    // ==================== 路由监听 ====================
    function watchRoute() {
        const pushState = history.pushState;
        history.pushState = function(...args) {
            pushState.apply(this, args);
            onRouteChange();
        };
        const replaceState = history.replaceState;
        history.replaceState = function(...args) {
            replaceState.apply(this, args);
            onRouteChange();
        };
        window.addEventListener('popstate', onRouteChange);
        window.addEventListener('hashchange', onRouteChange);
    }

    function onRouteChange() {
        lastQuestions = [];
        questionHashes.clear();
        destroyObservers();
        // SPA 切页后必须重新启动 Observer
        if (document.body) startObserver();
        setTimeout(() => scanAll(), 500);
    }

    // ==================== 接口劫持 ====================
    function isQuestionUrl(u) {
        if (typeof u !== 'string') return false;
        return /chaoxing\.com|xuexitong\.com/i.test(u) &&
               /work|homework|exam|test|question|paper/i.test(u);
    }

    function hookFetch() {
        const _fetch = window.fetch;
        window.fetch = async function(...args) {
            const resp = await _fetch.apply(this, args);
            const url = (args[0] && (typeof args[0] === 'string' ? args[0] : args[0].url || args[0].href)) || '';
            if (isQuestionUrl(url)) {
                // 使用 clone().text() 而非仅限于 json()
                const cloned = resp.clone();
                cloned.text().then(text => {
                    try {
                        const data = JSON.parse(text);
                        extractFromJson(data, url);
                    } catch {}
                }).catch(() => {});
            }
            return resp;
        };
        window.fetch.toString = function() { return 'function fetch() { [native code] }'; };
        defineNative('fetch');
    }

    function hookXHR() {
        const _open = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(...args) {
            const url = args[1];
            if (isQuestionUrl(url)) {
                this.addEventListener('load', function() {
                    try {
                        const data = JSON.parse(this.responseText);
                        extractFromJson(data, url);
                    } catch {}
                });
            }
            _open.apply(this, args);
        };
        XMLHttpRequest.prototype.open.toString = function() { return 'function open() { [native code] }'; };
        defineNative('xhr');
    }

    function defineNative(key) {
        if (!window.__xxtIntercept) window.__xxtIntercept = {};
        window.__xxtIntercept[key] = true;
    }

    // ==================== JSON 字段扩展提取 ====================
    function extractFromJson(data, url) {
        const qs = scanJson(data);
        if (qs.length) sendQuestions(qs);
    }

    function scanJson(obj) {
        const qs = [];
        function traverse(o) {
            if (!o || typeof o !== 'object') return;
            // 扩展字段：stem/title/question/description/content/body/topic/subject/text
            const titleFields = ['stem','title','question','description','content','body','topic','subject','text'];
            let title = '';
            for (const f of titleFields) {
                if (o[f] && typeof o[f] === 'string') {
                    title = o[f].trim().replace(/\s+/g, ' ');
                    break;
                }
            }
            if (title && title.length > 4) {
                const hash = hashCode(title);
                if (!questionHashes.has(hash)) {
                    questionHashes.add(hash);
                    const options = [];
                    if (o.options) {
                        o.options.forEach(function(x) {
                            const opt = (typeof x === 'string' ? x : (x.content || x.text || x.value || x.label || String(x))).trim();
                            if (opt) options.push(opt);
                        });
                    }
                    if (o.optionArray) {
                        o.optionArray.forEach(function(x) {
                            const opt = (typeof x === 'string' ? x : (x.content || x.text || x.value || x.label || String(x))).trim();
                            if (opt) options.push(opt);
                        });
                    }
                    qs.push({ id: hash, title, options });
                }
            }
            for (const k in o) {
                try { traverse(o[k]); } catch(e) {}
            }
        }
        traverse(obj);
        return qs;
    }

    // ==================== DOM 监听 ====================
    function startObserver() {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', startObserver, { once: true });
            return;
        }
        const mo = new MutationObserver(function(mutations) {
            let shouldScan = false;
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        shouldScan = true;
                        // 检测动态新增 iframe，自动 attach 子监听
                        if (node.tagName === 'IFRAME') {
                            handleIframe(node);
                        }
                        if (node.querySelectorAll) {
                            node.querySelectorAll('iframe').forEach(handleIframe);
                        }
                    }
                }
            }
            if (shouldScan) debounceScan();
        });
        mo.observe(document.body, { childList: true, subtree: true });
        observers.add(mo);
    }

    function handleIframe(iframe) {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            if (doc) {
                const qs = scanDocument(doc);
                if (qs.length) sendQuestions(qs);
                // 给 iframe 也加监听
                const childMo = new MutationObserver(function() {
                    const qs2 = scanDocument(doc);
                    if (qs2.length) sendQuestions(qs2);
                });
                childMo.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
                observers.add(childMo);
            }
        } catch(e) {}
    }

    function debounceScan() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(scanAll, DEBOUNCE_MS);
    }

    function scanAll() {
        const qs = scanDocument(document);
        if (qs.length) sendQuestions(qs);
    }

    // ==================== TreeWalker 扫描（禁止 querySelectorAll('*')） ====================
    function scanDocument(root) {
        const qs = [];
        try {
            const walker = document.createTreeWalker(
                root,
                NodeFilter.SHOW_ELEMENT,
                null,
                false
            );
            while (walker.nextNode()) {
                const node = walker.currentNode;
                // Shadow DOM 集成进 TreeWalker
                if (node.shadowRoot) {
                    const shadowQs = scanDocument(node.shadowRoot);
                    qs.push(...shadowQs);
                }
                // iframe 处理
                if (node.tagName === 'IFRAME') {
                    try {
                        const doc = node.contentDocument || node.contentWindow.document;
                        if (doc) {
                            const frameQs = scanDocument(doc);
                            qs.push(...frameQs);
                        }
                    } catch(e) {}
                }
                // 匹配题目容器
                if (isQuestionContainer(node)) {
                    extractQuestion(node, qs);
                }
            }
        } catch(e) {}
        return qs;
    }

    function isQuestionContainer(el) {
        if (questionCache.has(el)) return false;
        try {
            const cls = (el.className && typeof el.className === 'string') ? el.className : '';
            const cn = (el.getAttribute && el.getAttribute('class')) || '';
            const combined = cls + ' ' + cn;
            return /TiMu|singleQ|qItem|questionLi|Ques/i.test(combined);
        } catch(e) {}
        return false;
    }

    function extractQuestion(el, out) {
        questionCache.set(el, true);

        // 提取题干
        let title = '';
        const titleSels = ['[role=heading]','[aria-label]','[data-title]','.stem','.title','.qTitle','.clearfix','[class*=stem]','[class*=title]'];
        for (const sel of titleSels) {
            try {
                const tEl = el.querySelector(sel);
                if (tEl) {
                    title = tEl.innerText.replace(/\s+/g, ' ').trim();
                    break;
                }
            } catch(e) {}
        }
        if (!title || title.length < 5) {
            title = el.innerText.replace(/\s+/g, ' ').trim();
            if (title.length > 200) title = title.substring(0, 200);
        }
        if (title.length < 5) return;

        // 提取选项
        const opts = [];
        try {
            const optSels = ['.optionDiv','.qOption','.option','[class*=option]','[class*=Choice]','[class*=Answer]'];
            for (const sel of optSels) {
                el.querySelectorAll(sel).forEach(function(o) {
                    const t = o.innerText.replace(/\s+/g, ' ').trim();
                    if (t) opts.push(t);
                });
            }
        } catch(e) {}

        // 去重：WeakMap(DOM) + Set(hash)
        const hash = hashCode(title);
        if (questionHashes.has(hash)) return;
        questionHashes.add(hash);

        out.push({ id: hash, title, options: opts });
    }

    // ==================== 状态机 ====================
    function sendQuestions(incoming) {
        const qmap = {};
        lastQuestions.forEach(function(q) { qmap[q.id] = q; });

        const result = incoming.map(function(q) {
            const existing = qmap[q.id];
            return { ...q, state: existing ? 'UPDATED' : 'NEW' };
        });

        lastQuestions = incoming.slice();
        window.postMessage({ type: 'XXT_QUESTIONS', questions: result }, location.origin);
    }

    // ==================== 工具函数 ====================
    function hashCode(s) {
        let h = 0;
        for (let i = 0; i < s.length; i++) {
            h = Math.imul(31, h) + s.charCodeAt(i) | 0;
        }
        return h + '';
    }

    function destroyObservers() {
        observers.forEach(function(o) {
            try { o.disconnect(); } catch(e) {}
        });
        observers.clear();
    }

    // ==================== 生命周期 ====================
    window.addEventListener('beforeunload', function() {
        destroyObservers();
        clearTimeout(debounceTimer);
    });

    // ==================== 启动 ====================
    watchRoute();
    hookFetch();
    hookXHR();
    if (document.body) {
        startObserver();
    } else {
        document.addEventListener('DOMContentLoaded', function() { startObserver(); }, { once: true });
    }
    setTimeout(scanAll, 1000);
})();
