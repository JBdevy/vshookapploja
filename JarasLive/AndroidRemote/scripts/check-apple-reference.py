#!/usr/bin/env python3
"""Detect when Apple Remote code changed after the Android parity review."""
from pathlib import Path
import hashlib,json,sys
root=Path(__file__).resolve().parents[1]
reference=json.loads((root/'reference.json').read_text())
changed=[]
for name,expected in reference['files'].items():
    actual=hashlib.sha256((root.parent/name).read_bytes()).hexdigest()
    if actual!=expected:changed.append(name)
if changed:
    sys.exit('Review the updated Apple Remote before refreshing the reference: '+', '.join(changed))
print('Current iPhone/iPad Remote reference matches all '+str(len(reference['files']))+' reviewed source files.')
