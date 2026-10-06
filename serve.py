"""Recipe Note をこのPCから配信する簡易サーバー（Python標準ライブラリのみ・無料）

  python serve.py           … 8080番（使用中なら空いている番号）で起動
  python serve.py --open    … 起動後にブラウザを開く
  python serve.py 8000      … 番号を指定
"""
import http.server
import json
import os
import re
import socket
import sys
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
LOCAL_ADDRS = set()  # このPC自身のアドレス（起動時に設定）
args = [a for a in sys.argv[1:] if not a.startswith("--")]
OPEN = "--open" in sys.argv
FIRST_PORT = int(args[0]) if args else 8080


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # 実際には送信しない（経路の確認のみ）
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript",
        ".json": "application/json",
    }

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_POST(self):
        # PC で同期を接続したとき、Project URL と Publishable key を js/cloud-config.js に保存する
        # （iPhone・iPad では合言葉だけ入れれば接続できるようになる。合言葉は受け取らない）
        if self.path.split('?')[0].rstrip('/').endswith('__cloud-config'):
            client = self.client_address[0].replace('::ffff:', '')
            if client not in LOCAL_ADDRS:
                return self.send_error(403, 'only from this PC')
            try:
                n = int(self.headers.get('Content-Length') or 0)
                body = json.loads(self.rfile.read(min(n, 4096)) or b'{}')
                url = str(body.get('url', ''))
                key = str(body.get('key', ''))
            except Exception:
                return self.send_error(400)
            if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.(co|in)', url) or not re.fullmatch(r'(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)', key):
                return self.send_error(400, 'invalid url or key')
            path = os.path.join(ROOT, 'js', 'cloud-config.js')
            text = open(path, encoding='utf-8').read()
            text = re.sub(r"url: '[^']*'", "url: " + json.dumps(url).replace('"', "'"), text, count=1)
            text = re.sub(r"anonKey: '[^']*'", "anonKey: " + json.dumps(key).replace('"', "'"), text, count=1)
            open(path, 'w', encoding='utf-8').write(text)
            self.send_response(204)
            self.end_headers()
            return
        self.send_error(404)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *a):
        pass


class Server(http.server.ThreadingHTTPServer):
    """IPv4 と IPv6 の両方で待ち受ける（localhost が ::1 になっても遅くならない）"""
    daemon_threads = True
    allow_reuse_address = False  # Windows で使用中ポートへの二重起動を防ぐ

    def __init__(self, port):
        self.address_family = socket.AF_INET6 if socket.has_ipv6 else socket.AF_INET
        host = "::" if self.address_family == socket.AF_INET6 else "0.0.0.0"
        super().__init__((host, port), Handler)

    def server_bind(self):
        if self.address_family == socket.AF_INET6:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


def start():
    for port in range(FIRST_PORT, FIRST_PORT + 20):
        try:
            return Server(port), port
        except OSError:
            continue
    sys.exit(f"空いているポートが見つかりませんでした（{FIRST_PORT}〜{FIRST_PORT + 19}）")


if __name__ == "__main__":
    httpd, port = start()
    LOCAL_ADDRS.update({'127.0.0.1', '::1', lan_ip() or '127.0.0.1'})
    url = f"http://localhost:{port}/"
    ip = lan_ip()
    print("=" * 56)
    print(" Recipe Note を起動しました（この画面を閉じると停止します）")
    print("=" * 56)
    print(f"  このPC         : {url}")
    if ip:
        print(f"  iPhone / iPad  : http://{ip}:{port}/")
        print("                   （PCと同じWi-Fiにつないで Safari で開く）")
    print("", flush=True)
    if OPEN:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
