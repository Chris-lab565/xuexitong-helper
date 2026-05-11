// 学习通助手 - 后台脚本 (Service Worker)
// v1.1.1 - 添加 Referer/UA 请求头，增强错误处理

const STORAGE_KEY = 'xuexitongCookie';
const STORAGE_UID_KEY = 'xuexitongUid';
const STORAGE_TIME_KEY = 'xuexitongTime';
const COOKIE_EXPIRY_MS = 30 * 60 * 1000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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
        } catch (e) {}
    }

    const cookieString = Array.from(allCookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');

    const uid = allCookies.get('UID') || allCookies.get('_uid') || '';

    return { cookie: cookieString, uid, count: allCookies.size };
}

async function persistCookie(cookie, uid) {
    await chrome.storage.local.set({
        [STORAGE_KEY]: cookie,
        [STORAGE_UID_KEY]: uid,
        [STORAGE_TIME_KEY]: Date.now()
    });
}

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

function buildHeaders(cookie, extra = {}) {
    return {
        'Cookie': cookie,
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...extra
    };
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('[Background] 收到消息:', request.action);

    if (request.action === 'getCookie') {
        getAllChaoxingCookies().then(result => {
            if (result.count > 0) {
                persistCookie(result.cookie, result.uid);
                sendResponse({ cookie: result.cookie, uid: result.uid, count: result.count, source: 'cookies_api' });
            } else {
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
        const cookie = request.cookie || '';

        (async () => {
            let effectiveCookie = cookie;
            if (!effectiveCookie) {
                const result = await getAllChaoxingCookies();
                effectiveCookie = result.cookie;
            }
            if (!effectiveCookie) {
                sendResponse({ success: false, error: '没有可用的 Cookie，请先登录学习通并刷新 Cookie' });
                return;
            }

            try {
                const data = await fetchHomeworkList(effectiveCookie);
                if (data.list.length === 0) {
                    sendResponse({ success: false, error: '未找到任何课程作业。请确认：\n1. 学习通账号已加入课程\n2. 课程中有未完成的作业' });
                } else {
                    sendResponse({ success: true, data });
                }
            } catch (err) {
                console.error('[Background] 获取作业失败:', err.message);
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
                    headers: buildHeaders(effectiveCookie),
                    redirect: 'follow'
                });
                if (!response.ok) {
                    sendResponse({ success: false, error: `获取题目失败（HTTP ${response.status}）` });
                    return;
                }
                const html = await response.text();
                sendResponse({ success: true, data: html });
            } catch (err) {
                sendResponse({ success: false, error: '网络错误: ' + err.message });
            }
        })();
        return true;
    }
});

async function fetchHomeworkList(cookie) {
    console.log('[Background] 开始获取课程列表...');

    const coursesResponse = await fetch(
        'https://mooc1-api.chaoxing.com/mooc-ans/visit/courselistdata',
        {
            method: 'POST',
            headers: buildHeaders(cookie, {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://mooc1.chaoxing.com/mooc2-ans/mycourse/index?courseType=1'
            }),
            body: 'courseType=1&page=1&pageSize=100'
        }
    );

    if (!coursesResponse.ok) {
        throw new Error(`课程列表请求失败（HTTP ${coursesResponse.status}）。请确认已登录学习通。`);
    }

    const coursesText = await coursesResponse.text();
    console.log('[Background] 课程列表响应长度:', coursesText.length, '前200字符:', coursesText.substring(0, 200));

    if (coursesText.includes('登录') && coursesText.includes('password') && coursesText.length < 5000) {
        throw new Error('Cookie 已过期，请重新登录学习通并刷新 Cookie');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(coursesText, 'text/html');
    const courseItems = doc.querySelectorAll('.course-item');

    console.log('[Background] 找到课程数量:', courseItems.length);

    if (courseItems.length === 0) {
        const altItems = doc.querySelectorAll('[class*="course"]');
        console.log('[Background] 备用选择器找到元素:', altItems.length);
    }

    const homeworkList = [];

    for (const item of courseItems) {
        const courseName = item.querySelector('.course-name')?.textContent?.trim()
                        || item.querySelector('.courseName')?.textContent?.trim()
                        || item.querySelector('[class*="course-name"]')?.textContent?.trim()
                        || '';
        const courseLink = item.querySelector('a')?.href || '';

        const match = courseLink.match(/courseId=(\d+).*?classId=(\d+)/);
        if (match) {
            const courseId = match[1];
            const classId = match[2];

            console.log('[Background] 获取课程作业:', courseName, 'courseId:', courseId);
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
                headers: buildHeaders(cookie, {
                    'Referer': `https://mooc1.chaoxing.com/mooc-ans/mycourse/stu?courseId=${courseId}&classId=${classId}`
                })
            }
        );

        if (!response.ok) {
            console.error('[Background] 课程作业请求失败:', courseName, 'HTTP', response.status);
            return [];
        }

        const data = await response.json();
        console.log('[Background] 课程', courseName, '作业数:', data?.list?.length || 0);

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
    console.log('[学习通助手] 扩展已安装 v1.1.1');
});

console.log('[学习通助手] Background Service Worker 已启动 v1.1.1');
