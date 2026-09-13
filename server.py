import http.server
import socketserver
import os
from functools import partial

PORT = int(os.environ.get("PORT", 8000))
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=directory or PROJECT_ROOT, **kwargs)

    def end_headers(self):
        # Enable CORS and caching headers for WASM / MediaPipe compatibility
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

if __name__ == "__main__":
    os.chdir(PROJECT_ROOT)
    handler = partial(CustomHTTPRequestHandler, directory=PROJECT_ROOT)

    with ThreadingTCPServer(("0.0.0.0", PORT), handler) as httpd:
        print(f"Staring Contest Server running at http://0.0.0.0:{PORT}")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")