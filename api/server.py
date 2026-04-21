"""
学习通作业助手 - Flask 后端
"""

import os
import sys

# 自动安装依赖
try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
except ImportError:
    import subprocess
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'flask', 'flask-cors'], check=True)
    from flask import Flask, request, jsonify
    from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "message": "服务运行中"})

@app.route('/api/login', methods=['POST'])
def login():
    return jsonify({"success": True, "sessionId": "demo", "message": "登录成功"})

@app.route('/api/homework', methods=['GET'])
def get_homework():
    return jsonify({"success": True, "data": [], "message": "功能开发中"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
