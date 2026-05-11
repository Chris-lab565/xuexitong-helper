/**
 * 学习通作业助手 - 前端 API 封装 v1.1.1
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

// 获取学习通 Cookie
async function getXuexitongCookie() {
    // 方案1：chrome.storage.local（popup "打开应用"时写入，仅扩展上下文有效）
    const cookieFromStorage = await getCookieFromStorage();
    if (cookieFromStorage) {
        return cookieFromStorage;
    }

    // 方案2：postMessage → injected.js → content.js → background.js
    return new Promise((resolve) => {
        window.postMessage({ type: 'XUEXITONG_HELPER_GET_COOKIE' }, '*');

        const timeout = setTimeout(() => {
            resolve(null);
        }, 5000);

        window.addEventListener('message', function handler(event) {
            if (event.data.type === 'XUEXITONG_HELPER_COOKIE_RESPONSE') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                resolve(event.data.cookie);
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

    return new Promise((resolve, reject) => {
        window.postMessage({
            type: 'XUEXITONG_HELPER_FETCH_HOMEWORK',
            cookie
        }, '*');

        const timeout = setTimeout(() => {
            reject(new Error('请求超时（15秒）。请检查扩展是否正常运行，点击扩展图标确认 Cookie 状态。'));
        }, 15000);

        window.addEventListener('message', function handler(event) {
            if (event.data.type === 'XUEXITONG_HELPER_HOMEWORK_RESPONSE') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);

                if (event.data.success) {
                    resolve(event.data.data);
                } else {
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
