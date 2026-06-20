/**
 * 学习通作业助手 - 前端 API 封装 v1.2.11
 * 通过浏览器扩展获取 Cookie 并代理 API 请求
 * v1.2.10 新增：支持图片识别（视觉模型自动切换）
 * v1.2.11 新增：对接收件箱作业自动解析数据（content.js 主动推送）
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

// 从 URL hash 读取 Cookie（弹窗直接通过 URL 传递，最可靠）
function getCookieFromHash() {
    const hash = window.location.hash.substring(1); // 去掉 #
    const params = new URLSearchParams(hash);
    const cookie = params.get('xtcookie');
    if (cookie) {
        debugLog('✅ Cookie 从 URL hash 读取成功 (长度=' + cookie.length + ')');
        // 清理 URL 中的敏感 Cookie（不刷新页面）
        if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }
    return cookie;
}

// 获取学习通 Cookie（五层回退：URL hash → DOM轮询 → DOM监听 → storage → postMessage）
async function getXuexitongCookie() {
    // 方案0：从 URL hash 读取（弹窗直接传递，绕过内容脚本）
    const cookieFromHash = getCookieFromHash();
    if (cookieFromHash) {
        return cookieFromHash;
    }

    // 方案1：轮询等待 DOM Cookie（content.js 异步获取，可能需要几百毫秒）
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

// ===== 收件箱作业数据缓存 =====
// content.js 在用户打开作业作答页面时，会自动解析题目并通过 postMessage
// 主动推送 XUEXITONG_INBOX_HOMEWORK_READY 消息，这里缓存下来供 getQuestions() 优先使用
window.xuexitongInboxHomeworkCache = window.xuexitongInboxHomeworkCache || {};

window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'XUEXITONG_INBOX_HOMEWORK_READY') {
        const data = event.data;
        debugLog('✅ 收到收件箱作业解析数据 (workId=' + data.workId + ', 题目数=' + (data.questions ? data.questions.length : 0) + ')');
        // 用 workId 作为 key 缓存，方便 getQuestions() 按需查找
        if (data.workId) {
            window.xuexitongInboxHomeworkCache[data.workId] = data;
        }
        // 同时也缓存"最新一份"，应对 workId 不一致的情况（兜底）
        window.xuexitongInboxHomeworkCache['__latest__'] = data;
    }
});

// 获取题目（通过扩展代理）
async function getQuestionsViaExtension(url, workId) {
    // 优先：检查 content.js 是否已经主动推送过这个作业的解析结果（收件箱作业场景）
    const cached = (workId && window.xuexitongInboxHomeworkCache[workId]) || window.xuexitongInboxHomeworkCache['__latest__'];
    if (cached && cached.questions && cached.questions.length > 0) {
        debugLog('✅ 使用收件箱作业缓存数据，跳过API请求');
        // 转换字段名以匹配 app.html 期望的格式：title/qid/type/options
        return cached.questions.map(q => ({
            qid: q.qid,
            type: q.type,
            title: q.content,
            options: q.options || []
        }));
    }

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

// 将图片文件转换为 base64 data URL
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// 生成 AI 答案，支持可选图片输入（自动切换到视觉模型）
// images: 可选，base64 data URL 数组
async function getAnswer(question, apiKey, model, images) {
  const hasImages = Array.isArray(images) && images.length > 0;
  // 有图片时必须用支持视觉的模型；没有图片用普通文字模型（更省钱更快）
  const useModel = hasImages ? (model || 'moonshot-v1-32k-vision-preview') : (model || 'moonshot-v1-8k');

  // 构造 content：纯文字用字符串，带图片用数组（文字+image_url 混合）
  let content;
  if (hasImages) {
      content = [];
      images.forEach(imgDataUrl => {
          content.push({ type: 'image_url', image_url: { url: imgDataUrl } });
      });
      content.push({ type: 'text', text: '你是学习通助手。请结合上面的图片内容（可能是题目截图、PPT截图等）和下面的文字题目，给出简洁的答案或解题思路：\n' + question });
  } else {
      content = "你是学习通助手，只返回简洁的答案或解题思路：" + question;
  }

  try {
    const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: useModel,
        messages: [
          { role: "user", content: content }
        ],
        temperature: 1,
        max_tokens: 1500
      })
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    return data.choices[0].message.content;
  } catch (error) {
    console.error("AI请求失败：", error);
    return "AI请求失败：" + error.message;
  }
}

// 对外暴露的 API
const api = {
    checkExtension,
    fileToBase64,

    async getHomework() {
        return getHomeworkViaExtension();
    },

    async getQuestions(workId, doUrl) {
        return getQuestionsViaExtension(doUrl, workId);
    },

    async generateAnswer(question, apiKey, model, images) {
        return getAnswer(question, apiKey, model, images);
    },
};

window.api = api;
debugLog('✅ api.js v1.2.11 已加载（支持图片识别 + 收件箱作业自动解析对接）');
