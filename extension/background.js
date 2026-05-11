// 学习通助手 - 后台脚本 (Service Worker)
// v1.1.0 - 使用 chrome.cookies.getAll() 获取完整 Cookie（含 HttpOnly）
//          存储到 chrome.storage.local 持久化，防止 Service Worker 休眠丢失

const STORAGE_KEY = 'xuexitongCookie';
const STORAGE_UID_KEY = 'xuexitongUid';
const STORAGE_TIME_KEY = 'xuexitongTime';
const COOKIE_EXPIRY_MS = 30 * 60 * 1000; // 30分钟有效期

// 从浏览器 Cookie 存储中获取所有学习通相关 Cookie（含 HttpOnly）
async function getAllChaoxingCookies() {
    const domains = [
        'chaoxing.com',
        '.chaoxing.com',
        'mooc1-api.chaoxing.com',
        'i.mooc.chaoxing.com',
        'mooc1-1.chaoxing.com',
        'xuexitong.com',
        '.xuexitong.com'
    ];

    const allCookies = new Map();

    for (const domain of domains) {
        try {
            const cookies = await chrome.cookies.getAll({ domain });
            cookies.forEach(c => allCookies.set(c.name, c.value));
        } catch (e) {
            // 某些域名可能无权访问
        }
    }

    const cookieString = Array.from(allCookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');

    // 提取 UID
    const uid = allCookies.get('UID') || allCookies.get('_uid') || '';

    return { cookie: cookieString, uid, count: allCookies.size };
}

// 持久化 Cookie 到 storage.local
async function persistCookie(cookie, uid) {
    await chrome.storage.local.set({
        [STORAGE_KEY]: cookie,
        [STORAGE_UID_KEY]: uid,
        [STORAGE_TIME_KEY]: Date.now()
    });
}

// 从 storage.local 读取持久化的 Cookie
async function getStoredCookie() {
    const result = await chrome.storage.local.get([STORAGE_KEY, STORAGE_UID_KEY, STORAGE_TIME_KEY]);
    if (result[STORAGE_KEY] && result[STORAGE_TIME_KEY]) {
        const age = Date.now() - result[STORAGE_TIME_KEY];
        if (age < COOKIE_EXPIRY_MS) {
            return { cookie: result[STORAGE_KEY], uid: result[STORAGE_UID_KEY], fresh: true };
        }
    }
    return { cookie: null, uid: null, fresh: false };
}

// 处理消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('[Background] 收到消息:', request.action);

    if (request.action === 'getCookie') {
        // 获取 Cookie：优先用 chrome.cookies.getAll()，失败则用 storage.local
        getAllChaoxingCookies().then(result => {
            if (result.count > 0) {
                persistCookie(result.cookie, result.uid);
                sendResponse({ cookie: result.cookie, uid: result.uid, count: result.count, source: 'cookies_api' });
            } else {
                // 回退到 storage 读取
                getStoredCookie().then(stored => {
                    sendResponse({ cookie: stored.cookie || '', uid: stored.uid || '', count: 0, source: 'storage' });
                });
            }
        }).catch(err => {
            getStoredCookie().then(stored => {
                sendResponse({ cookie: stored.cookie || '', uid: stored.uid || '', count: 0, source: 'storage_fallback' });
            });
        });
        return true;
    }

    if (request.action === 'refreshCookie') {
        getAllChaoxingCookies().then(result => {
            persistCookie(result.cookie, result.uid);
            sendResponse({ success: true, uid: result.uid, count: result.count });
        }).catch(err => {
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }

    if (request.action === 'fetchHomework') {
        // 代理获取作业：使用传入的 cookie 或获取最新 cookie
        const cookie = request.cookie || '';

        (async () => {
            let effectiveCookie = cookie;
            if (!effectiveCookie) {
                const result = await getAllChaoxingCookies();
                effectiveCookie = result.cookie;
            }
            if (!effectiveCookie) {
                sendResponse({ success: false, error: '没有可用的 Cookie，请先登录学习通' });
                return;
            }

            try {
                const data = await fetchHomeworkList(effectiveCookie);
                sendResponse({ success: true, data });
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (request.action === 'fetchQuestions') {
        const { cookie, url } = request;

        (async () => {
            let effectiveCookie = cookie;
            if (!effectiveCookie) {
                const result = await getAllChaoxingCookies();
                effectiveCookie = result.cookie;
            }
            if (!effectiveCookie) {
                sendResponse({ success: false, error: '没有可用的 Cookie' });
                return;
            }

            try {
                const response = await fetch(url, {
                    headers: {
                        'Cookie': effectiveCookie,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                const html = await response.text();
                sendResponse({ success: true, data: html });
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }
});

// 获取完整作业列表（课程列表 + 每门课程作业）
async function fetchHomeworkList(cookie) {
    console.log('[Background] 开始获取课程列表...');

    // 获取课程列表
    const coursesResponse = await fetch('https://mooc1-api.chaoxing.com/mooc-ans/visit/courselistdata', {
        method: 'POST',
        headers: {
            'Cookie': cookie,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'courseType=1&page=1&pageSize=100'
    });

    const coursesText = await coursesResponse.text();
    console.log('[Background] 课程列表响应长度:', coursesText.length);

    const parser = new DOMParser();
    const doc = parser.parseFromString(coursesText, 'text/html');
    const courseItems = doc.querySelectorAll('.course-item');

    console.log('[Background] 找到课程数量:', courseItems.length);

    const homeworkList = [];

    for (const item of courseItems) {
        const courseName = item.querySelector('.course-name')?.textContent?.trim() || '';
        const courseLink = item.querySelector('a')?.href || '';

        const match = courseLink.match(/courseId=(\d+).*?classId=(\d+)/);
        if (match) {
            const courseId = match[1];
            const classId = match[2];

            console.log('[Background] 获取课程作业:', courseName);
            const hwList = await fetchCourseHomework(cookie, courseId, classId, courseName);
            homeworkList.push(...hwList);
        }
    }

    console.log('[Background] 总共获取作业数量:', homeworkList.length);
    return { list: homeworkList };
}

async function fetchCourseHomework(cookie, courseId, classId, courseName) {
    try {
        const response = await fetch(
            `https://mooc1-api.chaoxing.com/mooc-ans/work/getAllWork?courseId=${courseId}&classId=${classId}&page=1&pageSize=100`,
            {
                headers: {
                    'Cookie': cookie,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        );

        const data = await response.json();

        if (data && data.list) {
            return data.list.map(hw => ({
                ...hw,
                courseName,
                courseId,
                classId,
                workId: hw.workId || hw.id,
                title: hw.title || hw.name,
                status: hw.status === 1 ? 'done' : 'pending',
                endTime: hw.endTime || hw.deadline,
                submitUrl: `https://mooc1.chaoxing.com/mooc-ans/work/doHomeWork?courseId=${courseId}&classId=${classId}&workId=${hw.workId || hw.id}`
            }));
        }
        return [];
    } catch (err) {
        console.error('[Background] 获取课程作业失败:', courseName, err.message);
        return [];
    }
}

chrome.runtime.onInstalled.addListener(function() {
    console.log('[学习通助手] 扩展已安装 v1.1.0');
});

console.log('[学习通助手] Background Service Worker 已启动');
