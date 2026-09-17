from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re

class RangeHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path.split('?', 1)[0])
        if not Path(path).is_file():
            return super().send_head()
        size = Path(path).stat().st_size
        range_header = self.headers.get('Range')
        if not range_header:
            self.send_response(200)
            self.send_header('Content-Length', str(size))
            self.send_header('Content-Type', self.guess_type(path))
            self.send_header('Accept-Ranges', 'bytes')
            self.end_headers()
            return open(path, 'rb')
        match = re.match(r'bytes=(\d*)-(\d*)', range_header)
        if not match:
            self.send_error(416, 'Invalid range')
            return None
        start = int(match.group(1) or 0)
        end = int(match.group(2) or size - 1)
        start = min(start, size - 1)
        end = min(end, size - 1)
        if start > end:
            self.send_error(416, 'Invalid range')
            return None
        self.range_start = start
        self.range_length = end - start + 1
        self.send_response(206)
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(self.range_length))
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        file_obj = open(path, 'rb')
        file_obj.seek(start)
        return file_obj

    def copyfile(self, source, outputfile):
        if not hasattr(self, 'range_length'):
            return super().copyfile(source, outputfile)
        remaining = self.range_length
        while remaining:
            chunk = source.read(min(64 * 1024, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)
        del self.range_length

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 4173), RangeHandler).serve_forever()
