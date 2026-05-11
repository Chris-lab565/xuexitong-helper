/**
 * 学习通作业助手 - 前端 API 封装 v1.1.0
 * 通过浏览器扩展获取 Cookie 并代理 API 请求
 */

// 检查扩展是否安装
function checkExtension() {
    return new Promise((resolve) => {
        if (window.xuexitongExtensionInstalled) {
            resolve(true);
            return;
        }

        window.postMessage({ type: 'XUEXITONG_HELPER_PING' }, '*');

        const timeout = setTimeout(() => resolve(false), 2000);

        window.addEventListener('message', function handler(event) {
            if (event.data.type === 'XUEXITONG_HELPER_PONG' ||
                event.data.type === 'XUEXITONG_HELPER_EXTENSION_INSTALLED') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                window.xuexitongExtensionInstalled = true;
                resolve(true);
            }
        });
    });
}

// 监听扩展安装信号
window.addEventListener('message', (event) => {
    if (event.data.type === 'XUEXITONG_HELPER_EXTENSION_INSTALLED') {
        window.xuexitongExtensionInstalled = true;
    }
});

// 从扩展 storage 读取持久化的 Cookie（v1.1.0 扩展在点"打开应用"时保存）
function getCookieFromStorage() {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage) {
            console.log('[api.js] chrome.storage 不可用，使用 postMessage 方案');
            resolve(null);
            return;
        }

        chrome.storage.local.get(['xuexitongCookie', 'xuexitongTime'], (result) => {
            if (result.xuexitongCookie && result.xuexitongTime) {
                const age = Date.now() - result.xuexitongTime;
                console.log('[api.js] storage Cookie 年龄:', Math.floor(age / 1000), '秒');
                if (age < 30 * 60 * 1000) {
                    console.log('[api.js] ✅ 使用 storage 中的 Cookie');
                    resolve(result.xuexitongCookie);
                    return;
                }
                console.log('[api.js] ⚠️ storage Cookie 已过期');
            }
            resolve(null);
        });
    });
}

// 获取学习通 Cookie（优先 storage → postMessage chain → background chrome.cookies.getAll）
async function getXuexitongCookie() {
    console.log('[api.js] 开始获取 Cookie...');

    // 方案1：从 chrome.storage.local 读取（popup "打开应用"时写入）
    const cookieFromStorage = await getCookieFromStorage();
    if (cookieFromStorage) {
        console.log('[api.js] Cookie 来源: storage.local');
        return cookieFromStorage;
    }

    // 方案2：通过 postMessage → injected.js → content.js → background.js
    console.log('[api.js] 尝试通过 postMessage 获取 Cookie...');
    return new Promise((resolve) => {
        window.postMessage({ type: 'XUEXITONG_HELPER_GET_COOKIE' }, '*');

        const timeout = setTimeout(() => {
            console.log('[api.js] ❌ Cookie 获取超时');
            resolve(null);
        }, 5000);

        window.addEventListener('message', function handler(event) {
            if (event.data.type === 'XUEXITONG_HELPER_COOKIE_RESPONSE') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                const cookie = event.data.cookie;
                console.log('[api.js] Cookie 来源: postMessage, 长度:', cookie ? cookie.length : 0,
                    ', uid:', event.data.uid || '未知');
                resolve(cookie);
            }
        });
    });
}

// 获取作业列表（通过扩展代理）
async function getHomeworkViaExtension() {
    const cookie = await getXuexitongCookie();
    if (!cookie) {
        throw new Error('无法获取学习通 Cookie。\n\n请确保：\n1. 已安装最新版浏览器扩展\n2. 已登录学习通官网 (mooc1.chaoxing.com)\n3. 点击扩展图标 → "刷新 Cookie" → "打开应用"');
    }

    console.log('[api.js] 请求作业列表，Cookie 长度:', cookie.length);

    return new Promise((resolve, reject) => {
        window.postMessage({
            type: 'XUEXITONG_HELPER_FETCH_HOMEWORK',
            cookie
        }, '*');

        const timeout = setTimeout(() => {
            reject(new Error('请求超时（15秒）。请检查扩展是否正常运行，或尝试刷新页面。'));
        }, 15000);

        window.addEventListener('message', function handler(event) {
            if (event.data.type === 'XUEXITONG_HELPER_HOMEWORK_RESPONSE') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);

                if (event.data.success) {
                    console.log('[api.js] ✅ 作业获取成功，数量:', event.data.data?.list?.length || 0);
                    resolve(event.data.data);
                } else {
                    console.error('[api.js] ❌ 作业获取失败:', event.data.error);
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
console.log('[api.js] API 已加载 v1.1.0');
