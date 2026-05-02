/**
 * 学习通作业助手 - 前端 API 封装
 * 使用浏览器扩展绕过 CORS
 */

// 检查扩展是否安装
function checkExtension() {
    return new Promise((resolve) => {
        // 先检查是否已经收到扩展安装信号
        if (window.xuexitongExtensionInstalled) {
            resolve(true);
            return;
        }
        
        // 发送 ping 请求
        window.postMessage({ type: 'XUEXITONG_HELPER_PING' }, '*');
        
        const timeout = setTimeout(() => {
            resolve(false);
        }, 2000);
        
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

// 获取学习通 Cookie（通过扩展）
function getXuexitongCookie() {
    return new Promise((resolve) => {
        window.postMessage({ type: 'XUEXITONG_HELPER_GET_COOKIE' }, '*');
        
        const timeout = setTimeout(() => {
            resolve(null);
        }, 3000);
        
        window.addEventListener('message', function handler(event) {
            if (event.data.type === 'XUEXITONG_HELPER_COOKIE_RESPONSE') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                resolve(event.data.cookie);
            }
        });
    });
}

// 获取作业列表（通过扩展）
async function getHomeworkViaExtension() {
    const cookie = await getXuexitongCookie();
    if (!cookie) {
        throw new Error('无法获取学习通 Cookie，请确保已安装扩展并登录学习通');
    }
    
    return new Promise((resolve, reject) => {
        window.postMessage({ 
            type: 'XUEXITONG_HELPER_FETCH_HOMEWORK',
            cookie 
        }, '*');
        
        const timeout = setTimeout(() => {
            reject(new Error('请求超时'));
        }, 10000);
        
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

// 获取题目（通过扩展）
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
        
        const timeout = setTimeout(() => {
            reject(new Error('请求超时'));
        }, 10000);
        
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

// API 方法
const api = {
    // 检查扩展
    checkExtension,
    
    // 获取作业列表
    async getHomework() {
        return getHomeworkViaExtension();
    },
    
    // 获取题目
    async getQuestions(workId, doUrl) {
        return getQuestionsViaExtension(doUrl);
    },
    
    // 生成 AI 答案
    async generateAnswer(question, apiKey) {
        return generateAnswerWithMoonshot(question, apiKey);
    },
};

// 导出
window.api = api;
