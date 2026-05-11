// 学习通助手 - 注入脚本 v1.1.0
// 运行在页面上下文中，可访问 document.cookie
// 通过 postMessage 与 content.js 通信，content.js 再与 background.js 通信

(function() {
    'use strict';

    console.log('[学习通助手] 注入脚本已加载:', location.hostname);

    const hostname = location.hostname;
    const isXuexitongPage = hostname.includes('chaoxing.com') || hostname.includes('xuexitong.com');
    const isAppPage = hostname.includes('github.io');

    let installedNotified = false;
    function notifyInstalledOnce() {
        if (installedNotified) return;
        installedNotified = true;
        window.postMessage({ type: 'XUEXITONG_HELPER_EXTENSION_INSTALLED' }, '*');
        window.xuexitongExtensionInstalled = true;
    }

    // 处理来自网页的消息
    window.addEventListener('message', function(event) {
        if (event.source !== window) return;

        const type = event.data.type;

        // Ping - 检测扩展是否安装
        if (type === 'XUEXITONG_HELPER_PING') {
            notifyInstalledOnce();
            window.postMessage({ type: 'XUEXITONG_HELPER_PONG' }, '*');
            return;
        }

        // 获取 Cookie
        if (type === 'XUEXITONG_HELPER_GET_COOKIE') {
            if (isXuexitongPage) {
                // 在学习通页面：直接用 document.cookie（快速路径）
                const cookie = document.cookie;
                window.postMessage({
                    type: 'XUEXITONG_HELPER_COOKIE_RESPONSE',
                    cookie
                }, '*');
            } else if (isAppPage) {
                // 在助手网页：通过 content.js → background.js 获取（chrome.cookies.getAll）
                window.postMessage({
                    type: 'XUEXITONG_GET_COOKIE_FROM_BG'
                }, '*');
            } else {
                window.postMessage({
                    type: 'XUEXITONG_HELPER_COOKIE_RESPONSE',
                    cookie: null
                }, '*');
            }
            return;
        }

        // 获取作业列表
        if (type === 'XUEXITONG_HELPER_FETCH_HOMEWORK') {
            const cookie = event.data.cookie || '';

            if (isXuexitongPage) {
                // 在学习通页面：直接 fetch（可以访问 API）
                fetchHomeworkDirect(cookie);
            } else if (isAppPage) {
                // 在助手网页：通过 content.js → background.js 代理请求（关键：传 Cookie！）
                window.postMessage({
                    type: 'XUEXITONG_FETCH_HOMEWORK_BG',
                    cookie: cookie
                }, '*');
            } else {
                window.postMessage({
                    type: 'XUEXITONG_HELPER_HOMEWORK_RESPONSE',
                    success: false,
                    error: '当前页面不支持获取作业'
                }, '*');
            }
            return;
        }

        // 获取题目
        if (type === 'XUEXITONG_HELPER_FETCH_QUESTIONS') {
            const { cookie, url } = event.data;

            if (isXuexitongPage) {
                fetchQuestionsDirect(cookie, url);
            } else if (isAppPage) {
                // 通过 background 代理
                window.postMessage({
                    type: 'XUEXITONG_FETCH_QUESTIONS_BG',
                    cookie: cookie || '',
                    url: url || ''
                }, '*');
            } else {
                window.postMessage({
                    type: 'XUEXITONG_HELPER_QUESTIONS_RESPONSE',
                    success: false,
                    error: '当前页面不支持获取题目'
                }, '*');
            }
            return;
        }

        // 接收来自 content.js 的 Cookie 响应，转发给 api.js
        if (type === 'XUEXITONG_COOKIE_FROM_BG_RESPONSE') {
            window.postMessage({
                type: 'XUEXITONG_HELPER_COOKIE_RESPONSE',
                cookie: event.data.cookie,
                uid: event.data.uid
            }, '*');
            return;
        }

        // 接收来自 content.js 的作业响应，转发给 api.js
        if (type === 'XUEXITONG_HOMEWORK_BG_RESPONSE') {
            window.postMessage({
                type: 'XUEXITONG_HELPER_HOMEWORK_RESPONSE',
                success: event.data.success,
                data: event.data.data,
                error: event.data.error
            }, '*');
            return;
        }

        // 接收来自 content.js 的题目响应，转发给 api.js
        if (type === 'XUEXITONG_QUESTIONS_BG_RESPONSE') {
            window.postMessage({
                type: 'XUEXITONG_HELPER_QUESTIONS_RESPONSE',
                success: event.data.success,
                data: event.data.data,
                error: event.data.error
            }, '*');
            return;
        }
    });

    // 在学习通页面直接获取作业
    async function fetchHomeworkDirect(cookie) {
        try {
            const coursesResponse = await fetch('https://mooc1-api.chaoxing.com/mooc-ans/visit/courselistdata', {
                method: 'POST',
                headers: {
                    'Cookie': cookie,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: 'courseType=1&page=1&pageSize=100'
            });

            const coursesText = await coursesResponse.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(coursesText, 'text/html');
            const courseItems = doc.querySelectorAll('.course-item');

            const homeworkList = [];

            for (const item of courseItems) {
                const courseName = item.querySelector('.course-name')?.textContent?.trim() || '';
                const courseLink = item.querySelector('a')?.href || '';
                const match = courseLink.match(/courseId=(\d+).*?classId=(\d+)/);

                if (match) {
                    const hwList = await fetchCourseHomeworkDirect(cookie, match[1], match[2], courseName);
                    homeworkList.push(...hwList);
                }
            }

            window.postMessage({
                type: 'XUEXITONG_HELPER_HOMEWORK_RESPONSE',
                success: true,
                data: { list: homeworkList }
            }, '*');
        } catch (err) {
            window.postMessage({
                type: 'XUEXITONG_HELPER_HOMEWORK_RESPONSE',
                success: false,
                error: err.message
            }, '*');
        }
    }

    async function fetchCourseHomeworkDirect(cookie, courseId, classId, courseName) {
        try {
            const response = await fetch(
                `https://mooc1-api.chaoxing.com/mooc-ans/work/getAllWork?courseId=${courseId}&classId=${classId}&page=1&pageSize=100`,
                { headers: { 'Cookie': cookie } }
            );
            const data = await response.json();

            if (data && data.list) {
                return data.list.map(hw => ({
                    ...hw,
                    courseName,
                    workId: hw.workId || hw.id,
                    title: hw.title || hw.name,
                    status: hw.status === 1 ? 'done' : 'pending',
                    endTime: hw.endTime || hw.deadline
                }));
            }
            return [];
        } catch (err) {
            console.error('[学习通助手] 获取课程作业失败:', courseName, err.message);
            return [];
        }
    }

    // 在学习通页面直接获取题目
    async function fetchQuestionsDirect(cookie, url) {
        try {
            const response = await fetch(url, {
                headers: { 'Cookie': cookie }
            });
            const html = await response.text();

            window.postMessage({
                type: 'XUEXITONG_HELPER_QUESTIONS_RESPONSE',
                success: true,
                data: html
            }, '*');
        } catch (err) {
            window.postMessage({
                type: 'XUEXITONG_HELPER_QUESTIONS_RESPONSE',
                success: false,
                error: err.message
            }, '*');
        }
    }
})();
