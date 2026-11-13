"""Decode a Drive `download_file_content` result into the real file.

usage: python3 -I b64file.py RESULT.json OUT_FILE
Large results (anything beyond a few hundred KB) are not shown inline: the harness saves
them as a JSON file under a `tool-results` folder and names it in the tool result. This
finds the base64 payload in that JSON (the field `content`, or the longest base64 string)
and writes the decoded bytes. For a small inline result, save the base64 text to a file
and pass that file instead.
"""
import sys, json, base64, re

raw = open(sys.argv[1], encoding='utf-8').read()
cands = []
try:
    def walk(x):
        if isinstance(x, dict):
            for k, v in x.items():
                if isinstance(v, str) and k in ('content', 'base64Content', 'data'):
                    cands.insert(0, v)
                walk(v)
        elif isinstance(x, list):
            for v in x: walk(v)
        elif isinstance(x, str):
            if len(x) > 200 and (x.lstrip().startswith('{') or x.lstrip().startswith('[')):
                try: walk(json.loads(x))
                except Exception: pass
            cands.append(x)
    walk(json.loads(raw))
except Exception:
    cands.append(raw)
cands = [c.strip() for c in cands if re.fullmatch(r'[A-Za-z0-9+/=\s]{100,}', c.strip() or '')]
if not cands:
    sys.exit('no base64 payload found')
data = base64.b64decode(max(cands, key=len))
open(sys.argv[2], 'wb').write(data)
print(sys.argv[2], len(data), 'bytes')
