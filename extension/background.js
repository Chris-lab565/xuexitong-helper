// 学习通助手 - 后台脚本 (Service Worker)
// v1.2.9 - 固定链接转换 + realUrl/jumpUrl + 题目解析重构

const STORAGE_KEY = 'xuexitongCookie';
const STORAGE_UID_KEY = 'xuexitongUid';
const STORAGE_TIME_KEY = 'xuexitongTime';
const COOKIE_EXPIRY_MS = 30 * 60 * 1000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ======================= Cookie 管理 =======================

// 获取所有学习通Cookie — 保留全部字段，不做去重精简
async function getAllChaoxingCookies() {
    const domains = [
        'chaoxing.com',
        '.chaoxing.com',
        'passport.chaoxing.com',
        'passport2.chaoxing.com',
        'mooc1.chaoxing.com',
        'mooc1-api.chaoxing.com',
        'i.mooc.chaoxing.com',
        'mooc1-1.chaoxing.com',
        'mooc1-2.chaoxing.com',
        'ua.chaoxing.com',
        'sso.chaoxing.com',
        'auth.chaoxing.com',
        'data.xxt.aichaoxing.com',
        'mobile.chaoxing.com',
        'xuexitong.com',
        '.xuexitong.com',
        'passport.xuexitong.com'
    ];

    // 使用数组保留所有cookie（不去重，保留同名不同域的）
    const allCookies = [];
    const seen = new Set();

    for (const domain of domains) {
        try {
            const cookies = await chrome.cookies.getAll({ domain });
            for (const c of cookies) {
                const key = `${c.name}=${c.value}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    allCookies.push(c);
                }
            }
        } catch (e) { /* domain not accessible */ }
    }

    // 如果太少，URL方式补充
    if (allCookies.length < 5) {
        const urls = [
            'https://mooc1.chaoxing.com',
            'https://passport.chaoxing.com',
            'https://i.mooc.chaoxing.com',
            'https://www.xuexitong.com'
        ];
        for (const url of urls) {
            try {
                const cookies = await chrome.cookies.getAll({ url });
                for (const c of cookies) {
                    const key = `${c.name}=${c.value}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        allCookies.push(c);
                    }
                }
            } catch (e) { /* */ }
        }
    }

    // Cookie字符串 — 保留全部字段
    const cookieString = allCookies.map(c => `${c.name}=${c.value}`).join('; ');

    const uid = allCookies.find(c => c.name === 'UID' || c.name === '_uid');
    const uidValue = uid ? uid.value : '';

    console.log('[BG] Cookie总数:', allCookies.length, 'UID:', uidValue);
    console.log('[BG] Cookie keys:', allCookies.map(c => c.name).join(','));

    return { cookie: cookieString, uid: uidValue, count: allCookies.length, raw: allCookies };
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
        if (Date.now() - result[STORAGE_TIME_KEY] < COOKIE_EXPIRY_MS) {
            return { cookie: result[STORAGE_KEY], uid: result[STORAGE_UID_KEY], fresh: true };
        }
    }
    return { cookie: null, uid: null, fresh: false };
}

// ======================= 请求构造 =======================

// 根据目标URL动态生成Referer/Origin
function deriveReferer(url) {
    try {
        const u = new URL(url);
        return `${u.protocol}//${u.hostname}/`;
    } catch (e) {
        return 'https://mooc1.chaoxing.com/';
    }
}

function deriveOrigin(url) {
    try {
        const u = new URL(url);
        return `${u.protocol}//${u.hostname}`;
    } catch (e) {
        return 'https://mooc1.chaoxing.com';
    }
}

// 构建完整的浏览器模拟请求头
function buildFetchHeaders(cookie, url, extra = {}) {
    const origin = deriveOrigin(url);
    const referer = extra['Referer'] || deriveReferer(url);

    return {
        'Cookie': cookie,
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Origin': origin,
        'Referer': referer,
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        ...extra
    };
}

// isHtmlResponse — 检测响应是否为HTML而非JSON
function isHtml(text) {
    if (!text || text.length < 2) return false;
    const t = text.trimStart();
    return t[0] === '<';
}

// 安全解析JSON — 返回 {ok, data}
function safeJson(text) {
    try {
        return { ok: true, data: JSON.parse(text) };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ======================= 题目解析 =======================

async function getWorkQuestions(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://mooc1.chaoxing.com/'
      }
    });
    const html = await response.text();
    const questions = [];
    let qid = 0;
    const reg = /<div.*?(?:TiMu|singleQ|qItem)[\s\S]*?<\/div>\s*<\/div>/g;
    let match;
    while ((match = reg.exec(html)) !== null) {
      const item = match[0];
      const titleMatch = item.match(/<div.*?(?:clearfix|titleDiv|qTitle)[\s\S]*?>([\s\S]*?)<\/div>/);
      if (!titleMatch) continue;
      const title = titleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!title || title.length < 4) continue;
      const options = [];
      const optReg = /<div.*?(?:optionDiv|qOption)[\s\S]*?>([\s\S]*?)<\/div>/g;
      let optMatch;
      while ((optMatch = optReg.exec(item)) !== null) {
        const opt = optMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (opt) options.push(opt);
      }
      questions.push({ qid: ++qid, title, options, type: options.length ? '选择题' : '简答题', answer: '' });
    }
    return questions;
  } catch (e) {
    console.error(e);
    return [];
  }
}

// ======================= 消息路由 =======================

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('[BG] onMessage:', request.action);

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
        }).catch(() => {
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
        (async () => {
            let cookie = request.cookie || '';
            if (!cookie) {
                const result = await getAllChaoxingCookies();
                cookie = result.cookie;
            }
            if (!cookie) {
                sendResponse({ success: false, error: '没有可用的 Cookie，请先登录学习通并刷新 Cookie' });
                return;
            }
            try {
                const data = await fetchHomeworkList(cookie);
                if (data.list.length === 0) {
                    sendResponse({ success: false, error: '未找到任何课程作业。\n请确认：\n1. 学习通账号已加入课程\n2. 课程中有未完成的作业' });
                } else {
                    sendResponse({ success: true, data });
                }
            } catch (err) {
                console.error('[BG] 获取作业失败:', err.message);
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (request.action === 'fetchQuestions') {
        (async () => {
            const questions = await getWorkQuestions(request.url);
            sendResponse({ success: true, data: questions });
        })();
        return true;
    }
});
// ======================= 作业获取核心 =======================

// 从 backclazzdata JSON 提取 courseId/classId/courseName
function extractFromBackclazzdata(json) {
    const results = [];
    try {
        for (const ch of (json.channelList || [])) {
            const content = ch.content || {};
            const classId = content.id || '';
            for (const cd of (content.course && content.course.data) || []) {
                const courseId = cd.id || cd.courseId || '';
                if (courseId && classId) {
                    const key = `${courseId}_${classId}`;
                    if (!results.find(r => `${r.courseId}_${r.classId}` === key)) {
                        results.push({ courseId, classId, courseName: cd.name || '' });
                    }
                }
            }
        }
    } catch (e) { /* */ }
    return results;
}

// 从HTML提取 courseId/classId（备用）
function extractCourseIds(html) {
    const results = [];
    const patterns = [
        /courseId=(\d+).*?classId=(\d+)/g,
        /classId=(\d+).*?courseId=(\d+)/g,
        /"courseId"\s*:\s*(\d+).*?"classId"\s*:\s*(\d+)/g,
        /"classId"\s*:\s*(\d+).*?"courseId"\s*:\s*(\d+)/g,
    ];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            const key = `${match[1]}_${match[2]}`;
            if (!results.find(r => `${r.courseId}_${r.classId}` === key)) {
                results.push({ courseId: match[1], classId: match[2] });
            }
        }
    }
    return results;
}

// ======================= 主流程（纯HTML爬取方案 v1.2.9） =======================

async function fetchHomeworkList(cookie) {
    console.log('[BG] === v1.2.9 纯HTML爬取作业 ===');

    // --- 策略1: backclazzdata → 获取课程ID/名称映射表 ---
    let courseMap = new Map(); // key: "courseId_classId", value: { courseId, classId, courseName }
    try {
        console.log('[BG] 策略1: backclazzdata 获取课程映射...');
        const url = 'http://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1';
        const resp = await fetch(url, {
            headers: buildFetchHeaders(cookie, url, {
                'Referer': 'https://mooc1.chaoxing.com/mooc2-ans/mycourse/index?courseType=1'
            })
        });
        console.log('[BG] backclazzdata HTTP:', resp.status);
        if (resp.ok) {
            const text = await resp.text();
            if (!isHtml(text)) {
                const parsed = safeJson(text);
                if (parsed.ok) {
                    const ids = extractFromBackclazzdata(parsed.data);
                    for (const { courseId, classId, courseName } of ids) {
                        courseMap.set(`${courseId}_${classId}`, { courseId, classId, courseName });
                    }
                    console.log('[BG] 课程映射:', courseMap.size, '对');
                }
            }
        }
    } catch (err) {
        console.log('[BG] backclazzdata 异常:', err.message);
    }

    // --- 策略2: 直接爬取 stu-work HTML 页面，提取所有作业 ---
    // 多URL变体容错
    const stuWorkUrls = [
        'https://mooc1.chaoxing.com/mooc-ans/work/stu-work',
        'https://mooc1-1.chaoxing.com/mooc-ans/work/stu-work',
        'https://mooc1.chaoxing.com/mooc2-ans/work/stu-work',
        'https://mooc1-1.chaoxing.com/mooc2-ans/work/stu-work',
        'https://mooc1.chaoxing.com/work/stu-work',
    ];

    for (const pageUrl of stuWorkUrls) {
        try {
            console.log('[BG] 策略2: 爬取HTML', pageUrl);
            const resp = await fetch(pageUrl, {
                headers: buildFetchHeaders(cookie, pageUrl, {
                    'Referer': 'https://mooc1.chaoxing.com/mooc2-ans/mycourse/index?courseType=1',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                }),
                credentials: 'include',
                redirect: 'follow'
            });
            console.log('[BG] stu-work HTTP:', resp.status);

            if (!resp.ok) continue;

            const html = await resp.text();
            console.log('[BG] HTML长度:', html.length, '前500:', html.substring(0, 500));

            // 检测登录拦截
            if (html.length < 5000 && (html.includes('登录') || html.includes('password'))) {
                console.log('[BG] 被重定向到登录页，尝试下一个URL');
                continue;
            }

            // 从HTML提取作业
            const rawList = parseHomeworkFromHtml(html);
            // 补字段：submitUrl + 状态/时间标准化
            const homeworkList = rawList.map(hw => ({
                ...hw,
                endTime: '',
                status: normalizeStatus(hw.status),
                submitUrl: hw.submitUrl || (
                    hw.courseId && hw.classId && hw.workId
                        ? `https://mooc1.chaoxing.com/mooc-ans/work/doHomeWork?courseId=${hw.courseId}&classId=${hw.classId}&workId=${hw.workId}`
                        : ''
                )
            }));
            console.log('[BG] HTML提取作业:', homeworkList.length);

            if (homeworkList.length > 0) {
                // 补充课程名（如果courseMap里有）
                for (const hw of homeworkList) {
                    const key = `${hw.courseId}_${hw.classId}`;
                    const info = courseMap.get(key);
                    if (info && info.courseName && !hw.courseName) {
                        hw.courseName = info.courseName;
                    }
                }
                console.log('[BG] 最终作业列表:', homeworkList.length, '项');
                return { list: homeworkList };
            }

            console.log('[BG] 此URL未提取到作业，尝试下一个...');
        } catch (err) {
            console.log('[BG] stu-work', pageUrl, '异常:', err.message);
        }
    }

    // --- 策略3: 如果用课程ID逐个查课程页面HTML ---
    if (courseMap.size > 0) {
        console.log('[BG] 策略3: 按课程页面逐个提取...');
        const homeworkList = [];
        for (const [key, info] of courseMap) {
            const hws = await parseCoursePageHtml(cookie, info.courseId, info.classId, info.courseName);
            homeworkList.push(...hws);
            await new Promise(r => setTimeout(r, 300));
        }
        if (homeworkList.length > 0) {
            console.log('[BG] 策略3 提取作业:', homeworkList.length);
            return { list: homeworkList };
        }
    }

    console.log('[BG] 所有策略均未找到作业');
    return { list: [] };
}

// ======================= HTML 作业提取函数（2025最终版） =======================

// 状态文本标准化：中文 → frontend-key
function normalizeStatus(text) {
    if (!text) return 'pending';
    const t = text.replace(/\s/g, '');
    if (t.includes('已完成') || t.includes('已批阅') || t.includes('已提交')) return 'done';
    if (t.includes('未交') || t.includes('待提交') || t.includes('未完成')) return 'pending';
    if (t.includes('过期') || t.includes('已逾期') || t.includes('已截止')) return 'overdue';
    return 'pending';
}

// 新版学习通作业正则解析（2025最终版 — 纯正则，兼容Service Worker）
function parseHomeworkFromHtml(html) {
    try {
        const result = [];
        const liReg = /<li onclick="goTask\(this\);" data="([^"]+)">[\s\S]*?<\/li>/g;
        let match;

        while ((match = liReg.exec(html)) !== null) {
            const dataUrl = match[1];
            const titleReg = /<p aria-hidden="true">([^<]+)<\/p>/;
            const statusReg = /<span.*?class="status".*?>([^<]+)<\/span>/;
            const courseReg = /<span aria-hidden="true">《([^》]+)》<\/span>/;

            const titleMatch = match[0].match(titleReg);
            const statusMatch = match[0].match(statusReg);
            const courseMatch = match[0].match(courseReg);

            const title = titleMatch ? titleMatch[1].trim() : '无标题';
            const status = statusMatch ? statusMatch[1].trim() : '未知';
            const courseName = courseMatch ? courseMatch[1].trim() : '';

            const getParam = (url, key) => {
                const reg = new RegExp(key + '=([^&]+)');
                const m = url.match(reg);
                return m ? m[1] : '';
            };

            const courseId = getParam(dataUrl, 'courseId');
            const classId = getParam(dataUrl, 'clazzId');
            const workId = getParam(dataUrl, 'taskrefId');

            // 超星官网真实可访问链接（唯一不会404的）
            const officialUrl = `https://mooc1.chaoxing.com/mooc-ans/work/stu-work?courseId=${courseId}&classId=${classId}`;

            if (workId) {
                result.push({
                    courseId,
                    classId,
                    workId,
                    title,
                    status,
                    courseName,
                    officialUrl,
                    submitUrl: officialUrl
                });
            }
        }

        console.log('[BG] 解析作业数量:', result.length);
        return result;
    } catch (e) {
        console.warn('[BG] 解析作业失败', e);
        return [];
    }
}

// 策略3：爬取单个课程页面HTML提取作业
async function parseCoursePageHtml(cookie, courseId, classId, courseName) {
    const pageUrls = [
        `https://mooc1.chaoxing.com/mooc-ans/mycourse/stu?courseId=${courseId}&classId=${classId}`,
        `https://mooc1.chaoxing.com/mooc2-ans/mycourse/stu?courseId=${courseId}&classId=${classId}`,
        `https://mooc1-1.chaoxing.com/mooc-ans/mycourse/stu?courseId=${courseId}&classId=${classId}`,
    ];

    for (const pageUrl of pageUrls) {
        try {
            const resp = await fetch(pageUrl, {
                headers: buildFetchHeaders(cookie, pageUrl, {
                    'Referer': `https://mooc1.chaoxing.com/mooc2-ans/mycourse/index?courseType=1`,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }),
                credentials: 'include'
            });
            console.log('[BG] 课程页', pageUrl, 'HTTP:', resp.status);
            if (!resp.ok) continue;

            const html = await resp.text();
            console.log('[BG] 课程页长度:', html.length);
            if (html.length < 5000 && html.includes('登录')) continue;

            const rawList = parseHomeworkFromHtml(html);
            const homeworkList = rawList.map(hw => ({
                ...hw,
                courseId: hw.courseId || courseId,
                classId: hw.classId || classId,
                courseName: hw.courseName || courseName,
                endTime: '',
                status: normalizeStatus(hw.status),
                submitUrl: hw.submitUrl || (
                    (hw.courseId || courseId) && (hw.classId || classId) && hw.workId
                        ? `https://mooc1.chaoxing.com/mooc-ans/work/doHomeWork?courseId=${hw.courseId || courseId}&classId=${hw.classId || classId}&workId=${hw.workId}`
                        : ''
                )
            }));
            if (homeworkList.length > 0) {
                console.log('[BG] 课程', courseName, '提取到作业:', homeworkList.length);
                return homeworkList;
            }
        } catch (err) {
            console.log('[BG] 课程页', pageUrl, '异常:', err.message);
        }
    }
    return [];
}

// ======================= 初始化 =======================

chrome.runtime.onInstalled.addListener(function() {
    console.log('[学习通助手] 扩展已安装 v1.2.9');
});

console.log('[学习通助手] Background Service Worker 已启动 v1.2.9');
