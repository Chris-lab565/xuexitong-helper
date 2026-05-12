/**
 * 学习通作业助手 - 前端 API 封装 v1.1.2
 * 通过浏览器扩展获取 Cookie 并代理 API 请求
 */

// 调试日志
function debugLog(msg, data) {
    console.log('[api.js] ' + msg, data || '');
    // 更新页面状态指示器
    const debugEl = document.getElementById('debugStatus');
    if (debugEl) {
        debugEl.textContent = msg;
        debugEl.style.display = 'block';
    }
    // 同步更新步骤指示器
    const stepMap = { '扩展': 'stepExtension', 'Cookie': 'stepCookie', '作业': 'stepHomework' };
    for (const [key, stepId] of Object.entries(stepMap)) {
        if (msg.includes(key)) {
            const stepEl = document.getElementById(stepId);
            if (stepEl) {
                stepEl.textContent = msg;
                stepEl.className = 'debug-step ' + (msg.startsWith('✅') ? 'success' : msg.startsWith('❌') ? 'error' : 'pending');
            }
        }
    }
}

// 检查扩展是否安装
function checkExtension() {
    return new Promise((resolve) => {
        if (window.xuexitongExtensionInstalled) {
            debugLog('✅ 扩展已安装（缓存）');
            resolve(true);
            return;
        }

        // 先检查 DOM 标记（由 content.js 设置）
        if (document.body && document.body.dataset.xuexitongCookieReady === '1') {
            debugLog('✅ 扩展已安装（DOM 标记）');
            window.xuexitongExtensionInstalled = true;
            resolve(true);
            return;
        }

        debugLog('⏳ 检测扩展安装状态...');
        window.postMessage({ type: 'XUEXITONG_HELPER_PING' }, '*');

        const timeout = setTimeout(() => {
            debugLog('❌ 扩展未响应 PING（2秒超时）');
            resolve(false);
        }, 2000);

        window.addEventListener('message', function handler(event) {
            if (event.data.type === 'XUEXITONG_HELPER_PONG' ||
                event.data.type === 'XUEXITONG_HELPER_EXTENSION_INSTALLED') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                window.xuexitongExtensionInstalled = true;
                debugLog('✅ 扩展 PING 响应成功');
                resolve(true);
            }
        });
    });
}

// 监听扩展安装信号
window.addEventListener('message', (event) => {
    if (event.data.type === 'XUEXITONG_HELPER_EXTENSION_INSTALLED') {
        debugLog('✅ 扩展已安装（主动通知）');
        window.xuexitongExtensionInstalled = true;
    }
    if (event.data.type === 'XUEXITONG_HELPER_COOKIE_READY') {
        debugLog('✅ Cookie 就绪（content.js 主动推送）');
        document.body.dataset.xuexitongCookie = event.data.cookie || '';
        document.body.dataset.xuexitongCookieReady = '1';
    }
});

// 从扩展 storage 读取持久化的 Cookie（仅扩展上下文可用）
function getCookieFromStorage() {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            resolve(null);
            return;
        }

        try {
            chrome.storage.local.get(['xuexitongCookie', 'xuexitongTime'], (result) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                    return;
                }
                if (result && result.xuexitongCookie && result.xuexitongTime) {
                    const age = Date.now() - result.xuexitongTime;
                    if (age < 30 * 60 * 1000) {
                        resolve(result.xuexitongCookie);
                        return;
                    }
                }
                resolve(null);
            });
        } catch (e) {
            resolve(null);
        }
    });
}

// 获取学习通 Cookie（四层回退：DOM轮询 → DOM监听 → storage → postMessage）
async function getXuexitongCookie() {
    // 方案0：轮询等待 DOM Cookie（content.js 异步获取，可能需要几百毫秒）
    debugLog('⏳ 等待 DOM Cookie 就绪...');
    for (let i = 0; i < 25; i++) {
        if (document.body && document.body.dataset.xuexitongCookieReady === '1') {
            const cookie = document.body.dataset.xuexitongCookie;
            if (cookie) {
                debugLog('✅ Cookie 从 DOM 读取成功 (长度=' + cookie.length + ')');
                return cookie;
            }
            // DOM 标记就绪但 cookie 为空，content.js 获取失败 → 跳出轮询
            const domErr = document.body.dataset.xuexitongCookieError;
            debugLog('⚠️ DOM Cookie 就绪但为空' + (domErr ? ' (错误: ' + domErr + ')' : ''));
            break;
        }
        await new Promise(r => setTimeout(r, 200));
    }

    // 方案0b：如果还没就绪，监听 COOKIE_READY 事件（content.js 主动推送）
    if (document.body && document.body.dataset.xuexitongCookieReady !== '1') {
        debugLog('⏳ DOM Cookie 未就绪，等待推送事件...');
        const cookieFromEvent = await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(null), 3000);
            window.addEventListener('message', function handler(event) {
                if (event.data.type === 'XUEXITONG_HELPER_COOKIE_READY') {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    resolve(event.data.cookie || null);
                }
            });
        });
        if (cookieFromEvent) {
            debugLog('✅ Cookie 从推送事件获取成功 (长度=' + cookieFromEvent.length + ')');
            return cookieFromEvent;
        }
    }

    // 方案1：chrome.storage.local（popup "打开应用"时写入，仅扩展上下文有效）
    const cookieFromStorage = await getCookieFromStorage();
    if (cookieFromStorage) {
        debugLog('✅ Cookie 从 storage 读取成功');
        return cookieFromStorage;
    }

    // 方案2：postMessage → injected.js → content.js → background.js
    debugLog('⏳ 通过 postMessage 获取 Cookie...');
    return new Promise((resolve) => {
        window.postMessage({ type: 'XUEXITONG_HELPER_GET_COOKIE' }, '*');

        const timeout = setTimeout(() => {
            debugLog('❌ Cookie 获取超时（5秒）');
            resolve(null);
        }, 5000);

        window.addEventListener('message', function handler(event) {
            if (event.data.type === 'XUEXITONG_HELPER_COOKIE_RESPONSE') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                const cookie = event.data.cookie;
                if (cookie) {
                    debugLog('✅ Cookie postMessage 获取成功 (长度=' + cookie.length + ')');
                } else {
                    debugLog('❌ Cookie postMessage 返回空');
                }
                resolve(cookie);
            }
        });
    });
}

// 获取作业列表（通过扩展代理）
async function getHomeworkViaExtension() {
    const cookie = await getXuexitongCookie();
    if (!cookie) {
        throw new Error(
            '无法获取学习通 Cookie。\n\n' +
            '请按以下步骤操作：\n' +
            '1. 打开 https://mooc1.chaoxing.com 并登录\n' +
            '2. 点击浏览器右上角扩展图标\n' +
            '3. 点击「刷新 Cookie」\n' +
            '4. 再点击「打开应用」进入此页面\n' +
            '5. 点击「一键获取作业」'
        );
    }

    debugLog('⏳ 获取作业列表...');
    return new Promise((resolve, reject) => {
        window.postMessage({
            type: 'XUEXITONG_HELPER_FETCH_HOMEWORK',
            cookie
        }, '*');

        const timeout = setTimeout(() => {
            debugLog('❌ 作业请求超时（15秒）');
            reject(new Error('请求超时（15秒）。请检查扩展是否正常运行，点击扩展图标确认 Cookie 状态。'));
        }, 15000);

        window.addEventListener('message', function handler(event) {
            if (event.data.type === 'XUEXITONG_HELPER_HOMEWORK_RESPONSE') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);

                if (event.data.success) {
                    debugLog('✅ 作业列表获取成功');
                    resolve(event.data.data);
                } else {
                    debugLog('❌ 作业获取失败: ' + (event.data.error || '未知错误'));
                    reject(new Error(event.data.error || '获取作业失败'));
                }
            }
        });
    });
}

// 获取题目（通过扩展代理）
async function getQuestionsViaExtension(url) {
    const cookie = await getXuexitongCookie();
    if (!cookie) {
        throw new Error('无法获取学习通 Cookie');
    }

    debugLog('⏳ 获取题目...');
    return new Promise((resolve, reject) => {
        window.postMessage({
            type: 'XUEXITONG_HELPER_FETCH_QUESTIONS',
            cookie,
            url
        }, '*');

        const timeout = setTimeout(() => reject(new Error('获取题目超时')), 15000);

        window.addEventListener('message', function handler(event) {
            if (event.data.type === 'XUEXITONG_HELPER_QUESTIONS_RESPONSE') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);

                if (event.data.success) {
                    resolve(event.data.data);
                } else {
                    reject(new Error(event.data.error || '获取题目失败'));
                }
            }
        });
    });
}

// Moonshot AI 生成答案
async function generateAnswerWithMoonshot(question, apiKey) {
    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'kimi-k2.5',
            messages: [
                {
                    role: 'system',
                    content: '你是一个学习助手，请根据题目给出简洁准确的答案。直接给出答案，不要解释。'
                },
                { role: 'user', content: question }
            ],
            temperature: 0.3
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'AI 请求失败');
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// 对外暴露的 API
const api = {
    checkExtension,

    async getHomework() {
        return getHomeworkViaExtension();
    },

    async getQuestions(workId, doUrl) {
        return getQuestionsViaExtension(doUrl);
    },

    async generateAnswer(question, apiKey) {
        return generateAnswerWithMoonshot(question, apiKey);
    },
};

window.api = api;
debugLog('✅ api.js v1.1.2 已加载');
