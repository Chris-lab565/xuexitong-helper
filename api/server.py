"""
学习通作业助手 - Flask 后端
部署到 Railway / Render / 任何支持 Python 的平台
"""

import os
import json
import uuid
import subprocess
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# 存储用户会话（内存存储，重启会丢失，生产环境建议用 Redis）
sessions = {}

# 学习通 Skill 路径
SKILL_DIR = os.path.expanduser("~/.openclaw/skills/xuexitong-homework-submit")
SCRIPT_PATH = os.path.join(SKILL_DIR, "scripts/xuexitong_submit.py")

def run_skill_command(args):
    """运行学习通 Skill 命令"""
    cmd = ["python3", SCRIPT_PATH] + args
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
            encoding='utf-8'
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "Command timeout"
    except Exception as e:
        return -1, "", str(e)

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "time": datetime.now().isoformat()})

@app.route('/api/login', methods=['POST'])
def login():
    """用户登录 - 保存 Cookie"""
    data = request.json
    cookie = data.get('cookie')
    email = data.get('email')
    
    if not cookie:
        return jsonify({"success": False, "message": "Cookie 不能为空"}), 400
    
    # 创建会话
    session_id = str(uuid.uuid4())
    
    # 保存 Cookie 到临时文件
    cookie_dir = os.path.expanduser("~/.openclaw/credentials")
    os.makedirs(cookie_dir, exist_ok=True)
    cookie_file = os.path.join(cookie_dir, f"cookie_{session_id}.txt")
    
    with open(cookie_file, 'w', encoding='utf-8') as f:
        f.write(cookie)
    
    # 测试 Cookie 是否有效
    sessions[session_id] = {
        "cookie_file": cookie_file,
        "email": email,
        "created_at": datetime.now().isoformat()
    }
    
    return jsonify({
        "success": True,
        "sessionId": session_id,
        "message": "登录成功"
    })

@app.route('/api/logout', methods=['POST'])
def logout():
    """退出登录"""
    session_id = request.headers.get('X-Session-Id')
    if session_id and session_id in sessions:
        # 删除 Cookie 文件
        cookie_file = sessions[session_id].get('cookie_file')
        if cookie_file and os.path.exists(cookie_file):
            os.remove(cookie_file)
        del sessions[session_id]
    
    return jsonify({"success": True, "message": "已退出"})

@app.route('/api/homework', methods=['GET'])
def get_homework():
    """获取作业列表"""
    session_id = request.headers.get('X-Session-Id')
    if not session_id or session_id not in sessions:
        return jsonify({"success": False, "message": "未登录"}), 401
    
    # 设置环境变量使用当前会话的 Cookie
    env = os.environ.copy()
    env['XUEXITONG_COOKIE_FILE'] = sessions[session_id]['cookie_file']
    
    # 运行 list 命令
    cmd = ["python3", SCRIPT_PATH, "list"]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
            encoding='utf-8',
            env=env
        )
        
        # 解析输出
        output = result.stdout + result.stderr
        
        # 这里需要根据实际情况解析输出
        # 暂时返回原始输出
        return jsonify({
            "success": True,
            "raw_output": output,
            "message": "获取成功"
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/homework/<work_id>/questions', methods=['GET'])
def get_questions(work_id):
    """获取题目"""
    session_id = request.headers.get('X-Session-Id')
    if not session_id or session_id not in sessions:
        return jsonify({"success": False, "message": "未登录"}), 401
    
    do_url = request.args.get('doUrl')
    if not do_url:
        return jsonify({"success": False, "message": "缺少 doUrl"}), 400
    
    # TODO: 实现 fetch 和 template 命令
    return jsonify({
        "success": True,
        "workId": work_id,
        "doUrl": do_url,
        "message": "功能开发中"
    })

@app.route('/api/homework/<work_id>/submit', methods=['POST'])
def submit_answer(work_id):
    """提交答案"""
    session_id = request.headers.get('X-Session-Id')
    if not session_id or session_id not in sessions:
        return jsonify({"success": False, "message": "未登录"}), 401
    
    data = request.json
    # TODO: 实现 save/submit 命令
    
    return jsonify({
        "success": True,
        "workId": work_id,
        "message": "功能开发中"
    })

@app.route('/api/ai/answer', methods=['POST'])
def generate_answer():
    """生成 AI 答案"""
    data = request.json
    question = data.get('question')
    
    if not question:
        return jsonify({"success": False, "message": "题目不能为空"}), 400
    
    # TODO: 集成 AI 生成答案
    # 暂时返回模拟答案
    return jsonify({
        "success": True,
        "answer": f"这是 AI 生成的答案（模拟）\n题目：{question[:50]}...",
        "message": "生成成功"
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
