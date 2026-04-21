/**
 * 学习通作业助手 - 前端 API 封装
 */

// API 基础 URL
const API_BASE_URL = 'http://localhost:5000';

// 存储 sessionId
function getSessionId() {
    return localStorage.getItem('xuexitong_session_id');
}

function setSessionId(sessionId) {
    localStorage.setItem('xuexitong_session_id', sessionId);
}

function clearSession() {
    localStorage.removeItem('xuexitong_session_id');
    localStorage.removeItem('xuexitong_loggedin');
}

// 通用请求封装
async function apiRequest(url, options = {}) {
    const sessionId = getSessionId();
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...(sessionId && { 'X-Session-Id': sessionId }),
        },
    };
    
    const response = await fetch(`${API_BASE_URL}${url}`, {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers,
        },
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.message || '请求失败');
    }
    
    return data;
}

// API 方法
const api = {
    // 健康检查
    async health() {
        return apiRequest('/api/health');
    },
    
    // 登录
    async login(cookie, email) {
        const data = await apiRequest('/api/login', {
            method: 'POST',
            body: JSON.stringify({ cookie, email }),
        });
        
        if (data.success && data.sessionId) {
            setSessionId(data.sessionId);
            localStorage.setItem('xuexitong_loggedin', 'true');
        }
        
        return data;
    },
    
    // 退出登录
    async logout() {
        try {
            await apiRequest('/api/logout', {
                method: 'POST',
            });
        } finally {
            clearSession();
        }
    },
    
    // 获取作业列表
    async getHomework() {
        return apiRequest('/api/homework');
    },
    
    // 获取题目
    async getQuestions(workId, doUrl) {
        return apiRequest(`/api/homework/${workId}/questions?doUrl=${encodeURIComponent(doUrl)}`);
    },
    
    // 提交答案
    async submitAnswer(workId, doUrl, questionId, answer, tempSave = true) {
        return apiRequest(`/api/homework/${workId}/submit`, {
            method: 'POST',
            body: JSON.stringify({
                doUrl,
                questionId,
                answer,
                tempSave,
            }),
        });
    },
    
    // 生成 AI 答案
    async generateAnswer(question) {
        return apiRequest('/api/ai/answer', {
            method: 'POST',
            body: JSON.stringify({ question }),
        });
    },
};

// 导出
window.api = api;
