from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

class CORSRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

if __name__ == '__main__':
    httpd = ThreadingHTTPServer(('localhost', 8080), CORSRequestHandler)
    print("Serving with CORS on port 8080...")
    httpd.serve_forever()