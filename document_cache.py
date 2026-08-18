from collections import defaultdict
import hashlib
import time

class DocumentCache:
    """Cache for processed PDF documents"""
    
    def __init__(self, ttl=3600):
        self.cache = defaultdict(dict)
        self.ttl = ttl  # 1 hour expiration

    def _get_key(self, file_path):
        return hashlib.md5(file_path.encode()).hexdigest()

    def add_document(self, file_path, contents):
        key = self._get_key(file_path)
        self.cache[key] = {
            'contents': contents,
            'timestamp': time.time()
        }

    def get_document(self, file_path):
        key = self._get_key(file_path)
        entry = self.cache.get(key)
        if entry and (time.time() - entry['timestamp']) < self.ttl:
            return entry['contents']
        return None

    def clear_expired(self):
        now = time.time()
        expired = [k for k, v in self.cache.items() if (now - v['timestamp']) > self.ttl]
        for k in expired:
            del self.cache[k]