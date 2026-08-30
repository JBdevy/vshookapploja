#!/usr/bin/env python3
import plistlib
import re
import sys
from pathlib import Path


def main():
    ios_root = Path(sys.argv[1] if len(sys.argv) > 1 else 'ios').resolve()
    app_dir = ios_root / 'App' / 'App'
    project_file = ios_root / 'App' / 'App.xcodeproj' / 'project.pbxproj'
    if not app_dir.is_dir() or not project_file.is_file():
        raise SystemExit('Projeto iOS do Capacitor não encontrado para configurar Push Notifications.')

    entitlements = app_dir / 'App.entitlements'
    payload = {}
    if entitlements.is_file():
        try:
            with entitlements.open('rb') as stream:
                payload = plistlib.load(stream)
        except Exception:
            payload = {}
    payload['aps-environment'] = 'production'
    with entitlements.open('wb') as stream:
        plistlib.dump(payload, stream, sort_keys=True)

    text = project_file.read_text(encoding='utf-8')
    if 'CODE_SIGN_ENTITLEMENTS = App/App.entitlements;' not in text:
        pattern = r'(PRODUCT_BUNDLE_IDENTIFIER = com\.hookdeveloper\.vshook;)'
        text, count = re.subn(
            pattern,
            r'\1\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;',
            text,
        )
        if count < 1:
            raise SystemExit('Não encontrei o bundle com.hookdeveloper.vshook no projeto iOS.')
        project_file.write_text(text, encoding='utf-8')

    print(f'Push Notifications iOS configurado: {entitlements}')


if __name__ == '__main__':
    main()
