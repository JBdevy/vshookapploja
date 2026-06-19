from pathlib import Path

path = Path('android/app/build.gradle')
if not path.exists():
    raise SystemExit('android/app/build.gradle não encontrado')

text = path.read_text()

prefix = """def keystoreProperties = new Properties()\ndef keystorePropertiesFile = rootProject.file('keystore.properties')\nif (keystorePropertiesFile.exists()) {\n    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))\n}\n\n"""
if 'def keystoreProperties = new Properties()' not in text:
    text = prefix + text

signing = """\n    signingConfigs {\n        release {\n            keyAlias keystoreProperties['keyAlias']\n            keyPassword keystoreProperties['keyPassword']\n            storeFile file(keystoreProperties['storeFile'])\n            storePassword keystoreProperties['storePassword']\n        }\n    }\n"""
if 'signingConfigs {' not in text:
    marker = '    defaultConfig {'
    if marker in text:
        text = text.replace(marker, signing + '\n' + marker, 1)
    else:
        text = text.replace('android {', 'android {' + signing, 1)

if 'signingConfig signingConfigs.release' not in text:
    if 'release {' in text:
        text = text.replace('release {', 'release {\n            signingConfig signingConfigs.release', 1)
    else:
        # Insere buildTypes antes do fechamento do bloco android principal.
        idx = text.rfind('\n}')
        build_types = """\n    buildTypes {\n        release {\n            signingConfig signingConfigs.release\n        }\n    }\n"""
        if idx >= 0:
            text = text[:idx] + build_types + text[idx:]
        else:
            text += build_types

path.write_text(text)
print('Signing Android release configurado.')
