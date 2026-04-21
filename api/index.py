好的，这是 `api/index.py` 的完整内容：

```python
"""
Vercel Serverless Function - 学习通作业助手后端
"""

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

# Vercel 入口
from http.server import BaseHTTPRequestHandler
from io import BytesIO

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        response = app.test_client().get(self.path)
        self.wfile.write(response.data)
    
    def do_POST(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        content_length = int(self.headers['Content-Length'])
        body = self.rfile.read(content_length)
        response = app.test_client().post(self.path, data=body, content_type='application/json')
        self.wfile.write(response.data)
```

---

**或者，我们换 PythonAnywhere？** 那个更简单：
1. 打开 https://www.pythonanywhere.com
2. 免费注册
3. 直接网页上传文件
4. 不需要改这么多配置

你想用哪个？
