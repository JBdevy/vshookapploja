#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - "${1:-}" <<'PY'
import json, os, pathlib, plistlib, shutil, subprocess, sys, tempfile, time
def command(*args): return subprocess.check_output(args, text=True).strip()
devices = [d for group in json.loads(command('xcrun','simctl','list','devices','available','-j'))['devices'].values() for d in group]
device = next((d for d in devices if d['udid'] == sys.argv[1]), None) if sys.argv[1] else next((d for d in devices if d['state'] == 'Booted'), None)
if device is None: device = next((d for d in devices if 'iPad' in d['name']), None)
if device is None: raise SystemExit('An iOS simulator is required.')
udid = device['udid']; booted_here = device['state'] != 'Booted'
bundle = 'com.catlive.tests.remoteitemvolume'
folder = pathlib.Path(tempfile.mkdtemp(prefix='catlive-remote-item-volume-'))
installed = False
try:
    source = pathlib.Path('Apple/Shared/DAWRemoteView.swift').read_text()
    presenter = source[source.index('private struct RemoteItemEditorPresentation:'):source.index('private struct RemoteItemEditorOverlay:')]
    (folder/'Fixture.swift').write_text(pathlib.Path('Tests/Apple/RemoteItemVolumeFixture.swift').read_text() + '\n' + presenter)
    app = folder/'VolumeProbe.app'; app.mkdir()
    (app/'Info.plist').write_bytes(plistlib.dumps({
        'CFBundleIdentifier':bundle, 'CFBundleName':'VolumeProbe', 'CFBundleExecutable':'VolumeProbe',
        'CFBundleVersion':'1', 'CFBundleShortVersionString':'1.0', 'CFBundlePackageType':'APPL',
        'LSRequiresIPhoneOS':True, 'MinimumOSVersion':'16.0', 'UIDeviceFamily':[1,2],
        'UILaunchScreen':{}}))
    subprocess.run(['swiftc','-swift-version','5','-target',os.uname().machine+'-apple-ios16.0-simulator',
        '-sdk',command('xcrun','--sdk','iphonesimulator','--show-sdk-path'),'-parse-as-library',
        str(folder/'Fixture.swift'),'-o',str(app/'VolumeProbe')], check=True)
    if booted_here:
        subprocess.run(['xcrun','simctl','boot',udid], check=True)
        subprocess.run(['xcrun','simctl','bootstatus',udid,'-b'], check=True)
    subprocess.run(['xcrun','simctl','install',udid,str(app)], check=True); installed = True
    container = pathlib.Path(command('xcrun','simctl','get_app_container',udid,bundle,'data'))
    result = container/'Documents/result.txt'; result.unlink(missing_ok=True)
    subprocess.run(['xcrun','simctl','launch',udid,bundle], check=True)
    deadline = time.monotonic()+45
    while not result.exists() and time.monotonic()<deadline: time.sleep(.2)
    if not result.exists(): raise SystemExit('Remote item volume fixture timed out.')
    output=result.read_text(); print(output)
    if not output.startswith('REMOTE_ITEM_VOLUME_'): raise SystemExit(1)
finally:
    if installed: subprocess.run(['xcrun','simctl','uninstall',udid,bundle], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if booted_here: subprocess.run(['xcrun','simctl','shutdown',udid], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    shutil.rmtree(folder)
PY
