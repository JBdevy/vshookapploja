import os
import re
from pathlib import Path

PROJECT = Path('ios/App/App.xcodeproj/project.pbxproj')
BUNDLE_ID = 'com.hookdeveloper.vshook'
TARGET_NAME = 'App'

team_id = os.environ.get('IOS_TEAM_ID', '').strip()
profile_uuid = os.environ.get('PROFILE_UUID', '').strip()
profile_name = os.environ.get('PROFILE_NAME', '').strip()

if not team_id:
    raise SystemExit('Falta IOS_TEAM_ID')
if not profile_uuid:
    raise SystemExit('Falta PROFILE_UUID')
if not profile_name:
    raise SystemExit('Falta PROFILE_NAME')
if not PROJECT.exists():
    raise SystemExit(f'{PROJECT} não encontrado')

text = PROJECT.read_text()

native_section = re.search(r'/\* Begin PBXNativeTarget section \*/(?P<body>.*?)/\* End PBXNativeTarget section \*/', text, re.S)
if not native_section:
    raise SystemExit('Seção PBXNativeTarget não encontrada')

body = native_section.group('body')
target_match = re.search(
    r'(?P<id>[A-F0-9]{24}) /\* ' + re.escape(TARGET_NAME) + r' \*/ = \{(?P<block>.*?)\n\s*\};',
    body,
    re.S,
)
if not target_match:
    raise SystemExit(f'Target {TARGET_NAME} não encontrado')

build_list_match = re.search(r'buildConfigurationList = (?P<id>[A-F0-9]{24}) /\*', target_match.group('block'))
if not build_list_match:
    raise SystemExit('buildConfigurationList do target App não encontrado')

config_list_id = build_list_match.group('id')
config_list_match = re.search(
    re.escape(config_list_id) + r' /\* .*? \*/ = \{(?P<block>.*?)\n\s*\};',
    text,
    re.S,
)
if not config_list_match:
    raise SystemExit('XCConfigurationList do target App não encontrada')

config_ids = re.findall(r'([A-F0-9]{24}) /\* (Debug|Release) \*/', config_list_match.group('block'))
if not config_ids:
    raise SystemExit('Build configurations Debug/Release do App não encontradas')

settings = {
    'CODE_SIGN_STYLE': 'Manual',
    'DEVELOPMENT_TEAM': team_id,
    'PRODUCT_BUNDLE_IDENTIFIER': BUNDLE_ID,
    'CODE_SIGN_IDENTITY': '"Apple Distribution"',
    '"CODE_SIGN_IDENTITY[sdk=iphoneos*]"': '"Apple Distribution"',
    'PROVISIONING_PROFILE': profile_uuid,
    'PROVISIONING_PROFILE_SPECIFIER': f'"{profile_name}"',
}

def apply_settings_to_config(text_in: str, config_id: str) -> str:
    # Localiza o bloco completo da build configuration.
    pattern = re.compile(re.escape(config_id) + r' /\* .*? \*/ = \{(?P<block>.*?)\n\s*\};', re.S)
    m = pattern.search(text_in)
    if not m:
        raise SystemExit(f'XCBuildConfiguration {config_id} não encontrada')

    full = m.group(0)
    block = m.group('block')
    bm = re.search(r'buildSettings = \{(?P<settings>.*?)\n\s*\};', block, re.S)
    if not bm:
        raise SystemExit(f'buildSettings não encontrado em {config_id}')

    settings_text = bm.group('settings')
    for key, value in settings.items():
        line = f'\t\t\t\t{key} = {value};'
        key_re = re.escape(key).replace('\\"', '"')
        existing = re.compile(r'^\s*' + re.escape(key) + r'\s*=\s*.*?;\s*$', re.M)
        if existing.search(settings_text):
            settings_text = existing.sub(line, settings_text)
        else:
            settings_text = settings_text.rstrip() + '\n' + line

    new_block = block[:bm.start('settings')] + settings_text + block[bm.end('settings'):]
    new_full = full.replace(block, new_block)
    return text_in[:m.start()] + new_full + text_in[m.end():]

for config_id, config_name in config_ids:
    text = apply_settings_to_config(text, config_id)

PROJECT.write_text(text)
print(f'iOS signing configurado no target App: {profile_name} ({profile_uuid})')
