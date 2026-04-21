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

# Vercel 需要这个 handler
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        from io import BytesIO
        from urllib.parse import urlparse
        
        response = app.test_client().get(self.path)
        
        self.send_response(response.status_code)
        for key, value in response.headers:
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(response.data)
    
    def do_POST(self):
        from io import BytesIO
        
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else b''
        
        response = app.test_client().post(
            self.path,
            data=body,
            content_type=self.headers.get('Content-Type', 'application/json')
        )
        
        self.send_response(response.status_code)
        for key, value in response.headers:
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(response.data)
