// 学习通助手 - 后台脚本 (Service Worker)
// v1.1.6 - 多策略作业获取：课程API+主页+已结束+我的作业页面

const STORAGE_KEY = 'xuexitongCookie';
const STORAGE_UID_KEY = 'xuexitongUid';
const STORAGE_TIME_KEY = 'xuexitongTime';
const COOKIE_EXPIRY_MS = 30 * 60 * 1000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 从浏览器 Cookie 存储中获取所有学习通相关 Cookie（含 HttpOnly）
async function getAllChaoxingCookies() {
    // 方案A：按域名批量获取
    const domains = [
        'chaoxing.com',
        '.chaoxing.com',
        'passport.chaoxing.com',
        'passport2.chaoxing.com',
        'mooc1.chaoxing.com',
        'mooc1-api.chaoxing.com',
        'i.mooc.chaoxing.com',
        'mooc1-1.chaoxing.com',
        'ua.chaoxing.com',
        'sso.chaoxing.com',
        'auth.chaoxing.com',
        'xuexitong.com',
        '.xuexitong.com',
        'passport.xuexitong.com'
    ];

    const allCookies = new Map();
    const domainResults = [];

    for (const domain of domains) {
        try {
            const cookies = await chrome.cookies.getAll({ domain });
            domainResults.push({ domain, count: cookies.length, names: cookies.map(c => c.name).join(',') });
            cookies.forEach(c => allCookies.set(c.name, c.value));
        } catch (e) {
            domainResults.push({ domain, count: 0, error: e.message });
        }
    }

    console.log('[Background] Cookie 各域名查询结果:', JSON.stringify(domainResults));
    console.log('[Background] 去重后总 Cookie 数:', allCookies.size, 'keys:', Array.from(allCookies.keys()).join(','));

    // 方案B：如果方案A结果太少，用 URL 方式补充获取
    if (allCookies.size < 3) {
        console.log('[Background] 方案A获取Cookie不足，尝试方案B（URL方式）...');
        const urls = [
            'https://mooc1.chaoxing.com',
            'https://passport.chaoxing.com',
            'https://i.mooc.chaoxing.com',
            'https://www.xuexitong.com'
        ];
        for (const url of urls) {
            try {
                const cookies = await chrome.cookies.getAll({ url });
                console.log('[Background] URL方式', url, '获取到', cookies.length, '项:', cookies.map(c => c.name).join(','));
                cookies.forEach(c => allCookies.set(c.name, c.value));
            } catch (e) {
                console.log('[Background] URL方式', url, '失败:', e.message);
            }
        }
        console.log('[Background] 方案B后总 Cookie 数:', allCookies.size);
    }

    const cookieString = Array.from(allCookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');

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

// 创建标准请求头
function buildHeaders(cookie, extra = {}) {
    return {
        'Cookie': cookie,
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...extra
    };
}

// 处理消息
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

// 从 HTML 中提取 courseId/classId
function extractCourseIds(html, cookie) {
    const results = [];
    // 多种正则模式匹配 courseId 和 classId
    const patterns = [
        /courseId=(\d+).*?classId=(\d+)/g,
        /classId=(\d+).*?courseId=(\d+)/g,
        /"courseId"\s*:\s*(\d+).*?"classId"\s*:\s*(\d+)/g,
        /"classId"\s*:\s*(\d+).*?"courseId"\s*:\s*(\d+)/g,
    ];

    for (const pattern of patterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(html)) !== null) {
            const courseId = match[1];
            const classId = match[2];
            // 去重
            const key = `${courseId}_${classId}`;
            if (!results.find(r => `${r.courseId}_${r.classId}` === key)) {
                results.push({ courseId, classId });
            }
        }
    }
    return results;
}

// 获取完整作业列表（多策略）
async function fetchHomeworkList(cookie) {
    console.log('[Background] === 开始获取作业列表 ===');

    // === 策略1：课程列表 API（HTML） ===
    let courseIds = [];
    try {
        console.log('[Background] 策略1: 获取课程列表 API...');
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

        if (coursesResponse.ok) {
            const coursesText = await coursesResponse.text();
            console.log('[Background] 课程列表长度:', coursesText.length, '前300字符:', coursesText.substring(0, 300));

            if (coursesText.includes('登录') && coursesText.includes('password') && coursesText.length < 5000) {
                throw new Error('Cookie 已过期，请重新登录学习通并刷新 Cookie');
            }

            courseIds = extractCourseIds(coursesText);
            console.log('[Background] 策略1 提取到 courseId/classId:', courseIds.length, '对');
        } else {
            console.log('[Background] 策略1 失败: HTTP', coursesResponse.status);
        }
    } catch (err) {
        console.log('[Background] 策略1 异常:', err.message);
    }

    // === 策略2：我的课程主页（HTML，提取链接） ===
    if (courseIds.length === 0) {
        try {
            console.log('[Background] 策略2: 获取我的课程主页...');
            const mycourseResponse = await fetch(
                'https://mooc1.chaoxing.com/mooc2-ans/mycourse/index?courseType=1',
                {
                    headers: buildHeaders(cookie, {
                        'Referer': 'https://mooc1.chaoxing.com'
                    })
                }
            );
            if (mycourseResponse.ok) {
                const html = await mycourseResponse.text();
                console.log('[Background] 课程主页长度:', html.length, '前300字符:', html.substring(0, 300));
                courseIds = extractCourseIds(html);
                console.log('[Background] 策略2 提取到 courseId/classId:', courseIds.length, '对');
            } else {
                console.log('[Background] 策略2 失败: HTTP', mycourseResponse.status);
            }
        } catch (err) {
            console.log('[Background] 策略2 异常:', err.message);
        }
    }

    // === 策略3：已结束课程 ===
    if (courseIds.length === 0) {
        try {
            console.log('[Background] 策略3: 获取已结束课程列表...');
            const endedResponse = await fetch(
                'https://mooc1-api.chaoxing.com/mooc-ans/visit/courselistdata',
                {
                    method: 'POST',
                    headers: buildHeaders(cookie, {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': 'https://mooc1.chaoxing.com/mooc2-ans/mycourse/index?courseType=2'
                    }),
                    body: 'courseType=2&page=1&pageSize=100'
                }
            );
            if (endedResponse.ok) {
                const html = await endedResponse.text();
                courseIds = extractCourseIds(html);
                console.log('[Background] 策略3 提取到 courseId/classId:', courseIds.length, '对');
            }
        } catch (err) {
            console.log('[Background] 策略3 异常:', err.message);
        }
    }

    if (courseIds.length === 0) {
        console.log('[Background] 所有策略均未找到课程。尝试直接获取作业页面...');
        // 策略4：直接尝试"我的作业"页面，可能有不同的入口
        return await fetchHomeworkFromStuWork(cookie);
    }

    // 对每个课程获取作业
    const homeworkList = [];
    for (const { courseId, classId } of courseIds) {
        console.log('[Background] 获取课程作业: courseId=' + courseId + ' classId=' + classId);
        const hwList = await fetchCourseHomework(cookie, courseId, classId);
        homeworkList.push(...hwList);
        // 限速：每两个请求之间稍等
        await new Promise(r => setTimeout(r, 300));
    }

    console.log('[Background] 总共获取作业数量:', homeworkList.length);
    return { list: homeworkList };
}

// 策略4：从"我的作业"页面直接获取
async function fetchHomeworkFromStuWork(cookie) {
    try {
        console.log('[Background] 策略4: 访问我的作业页面...');
        const response = await fetch(
            'https://mooc1.chaoxing.com/mooc-ans/work/stu-work',
            {
                headers: buildHeaders(cookie, {
                    'Referer': 'https://mooc1.chaoxing.com'
                })
            }
        );
        if (!response.ok) {
            return { list: [] };
        }
        const html = await response.text();
        console.log('[Background] 作业页面长度:', html.length, '前500字符:', html.substring(0, 500));

        // 尝试从页面提取作业数据（可能嵌入在 JS 变量中）
        const homeworkList = [];

        // 尝试匹配 JSON 数据
        const jsonPatterns = [
            /workList\s*[:=]\s*(\[[^\]]+\])/g,
            /"workList"\s*:\s*(\[[^\]]*\])/g,
            /"list"\s*:\s*(\[[^\]]*\{[^}]*\}[^\]]*\])/g,
        ];

        for (const pattern of jsonPatterns) {
            let match;
            while ((match = pattern.exec(html)) !== null) {
                try {
                    const parsed = JSON.parse(match[1]);
                    if (Array.isArray(parsed)) {
                        parsed.forEach(hw => {
                            homeworkList.push({
                                workId: hw.workId || hw.id || '',
                                title: hw.title || hw.name || '',
                                courseName: hw.courseName || '',
                                status: hw.status === 1 ? 'done' : 'pending',
                                endTime: hw.endTime || hw.deadline || '',
                                submitUrl: hw.url || ''
                            });
                        });
                    }
                } catch (e) { /* JSON 解析失败，继续 */ }
            }
        }

        // 也尝试从页面提取 courseId/classId 然后查作业
        const courseIds = extractCourseIds(html);
        console.log('[Background] 策略4 提取到 courseId:', courseIds.length, '对');

        for (const { courseId, classId } of courseIds) {
            const hwList = await fetchCourseHomework(cookie, courseId, classId);
            homeworkList.push(...hwList);
            await new Promise(r => setTimeout(r, 200));
        }

        console.log('[Background] 策略4 总共获取作业:', homeworkList.length);
        return { list: homeworkList };
    } catch (err) {
        console.error('[Background] 策略4 失败:', err.message);
        return { list: [] };
    }
}

async function fetchCourseHomework(cookie, courseId, classId, courseName) {
    const label = courseName || `课程${courseId}`;
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
            console.error('[Background] 课程作业请求失败:', label, 'HTTP', response.status);
            return [];
        }

        const data = await response.json();
        console.log('[Background] 课程', label, '作业数:', data?.list?.length || 0);

        // 如果 data 中有课程名，优先使用
        const resolvedName = courseName || data?.courseName || data?.course?.name || '';

        if (data && data.list) {
            return data.list.map(hw => ({
                ...hw,
                courseName: resolvedName,
                courseId,
                classId,
                workId: hw.workId || hw.id,
                title: hw.title || hw.name,
                status: hw.status === 1 ? 'done' : 'pending',
                endTime: hw.endTime || hw.deadline,
                submitUrl: hw.url || hw.submitUrl || `https://mooc1.chaoxing.com/mooc-ans/work/doHomeWork?courseId=${courseId}&classId=${classId}&workId=${hw.workId || hw.id}`
            }));
        }
        return [];
    } catch (err) {
        console.error('[Background] 获取课程作业失败:', label, err.message);
        return [];
    }
}

chrome.runtime.onInstalled.addListener(function() {
    console.log('[学习通助手] 扩展已安装 v1.1.6');
});

console.log('[学习通助手] Background Service Worker 已启动 v1.1.6');
