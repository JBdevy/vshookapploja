import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
if (process.platform !== 'darwin') { console.log('NATIVE_LIBRARY_REMOVAL_SKIP: Swift execution runs on macOS'); process.exit(0); }
const source=fs.readFileSync(new URL('../ios/App/App/BronzeNativeAppModel.swift',import.meta.url),'utf8');
const session=fs.readFileSync(new URL('../ios/App/App/BronzeNativeSession.swift',import.meta.url),'utf8');
const methods=source.slice(source.indexOf('    func removeCatalogSounds('),source.indexOf('    func cancelCatalogDownload('));
const start=session.indexOf('    static func validateSoundFontKey(');
const validator=session.slice(start,session.indexOf('\n    }',start)+6);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bronze-remove-'));
const swift=`import Foundation
struct Font: Equatable { var id: String }
typealias UserSoundFont = Font
struct BronzeCatalogSound { var id: String }
struct Module { var soundFontKey: String?; var enabled = true }
struct Preset { var modules: [Module]? }
struct Workspace { var catalogDownloads: [String:String]?; var catalogInstalls: [String:String]? }
enum BronzeSessionError: Error { case invalid }
struct BronzeSessionStore { ${validator} }
final class Model {
 static var directory = URL(fileURLWithPath: CommandLine.arguments[1])
 static func soundFontDirectory() throws -> URL { directory }
 var backupBusy=false, isApplyingSnapshot=false, updatingEffects=false
 var loadingSoundFontModule: Int?; var catalogDownloadTask: Int?
 var catalogDownloadError: String?; var controlError: String?; var downloadedSoundID: String?
 var userSoundFonts: [Font]=[]; var moduleSoundFonts: [Font?]=[]; var presets: [Preset]=[]
 var workspace=Workspace(); var saves=0
 var userOnlySoundFonts: [Font] { userSoundFonts.filter { !(workspace.catalogDownloads ?? [:]).values.contains($0.id) } }
 func clearSoundFont(_ index: Int) { moduleSoundFonts[index]=nil }
 func saveSessionNow() { saves += 1 }
 func catalogFont(_ id: String)->Font? { userSoundFonts.first { $0.id == workspace.catalogDownloads?[id] } }
 ${methods}
}
func check(_ condition: @autoclosure ()->Bool,_ label: String) { if !condition() { fatalError(label) } }
let root=Model.directory
let key=UUID().uuidString+"/catalog.sf2", other=UUID().uuidString+"/user.sf2"
for name in [key,other] { let file=root.appendingPathComponent(name); try FileManager.default.createDirectory(at:file.deletingLastPathComponent(),withIntermediateDirectories:true); try Data([1,2,3]).write(to:file) }
let m=Model(); let fixed=Font(id:key), user=Font(id:other)
m.userSoundFonts=[fixed,user]; m.moduleSoundFonts=[fixed,user,fixed];m.presets=[Preset(modules:[Module(soundFontKey:key),Module(soundFontKey:other)]),Preset(modules:nil)]
m.workspace=Workspace(catalogDownloads:["sound":key],catalogInstalls:["sound":"1"]);m.downloadedSoundID="sound"
m.catalogDownloadTask=1;m.removeCatalogSounds([BronzeCatalogSound(id:"sound")]);check(m.saves==0,"download blocks delete");m.catalogDownloadTask=nil
m.removeUserSoundFont(fixed);check(m.saves==0,"User deletion cannot bypass official catalog")
m.removeCatalogSounds([BronzeCatalogSound(id:"sound")])
check(!FileManager.default.fileExists(atPath:root.appendingPathComponent(key).path),"SF2 removed")
check(FileManager.default.fileExists(atPath:root.appendingPathComponent(other).path),"unrelated User SF2 retained")
check(m.moduleSoundFonts[0]==nil && m.moduleSoundFonts[2]==nil && m.moduleSoundFonts[1]==user,"active modules unload only removed sound")
check(m.presets[0].modules![0].soundFontKey==nil && !m.presets[0].modules![0].enabled,"preset references cleared")
check(m.presets[0].modules![1].soundFontKey==other && m.presets[1].modules==nil,"other presets unchanged")
check(m.workspace.catalogDownloads?["sound"]==nil && m.workspace.catalogInstalls?["sound"]==nil && m.downloadedSoundID==nil,"download status cleared")
check(m.saves==1,"persist deletion")
m.removeUserSoundFont(user);check(m.userSoundFonts.isEmpty && m.saves==2,"User removal uses same persistence path")
let bad=Font(id:"../outside.sf2");m.userSoundFonts=[bad];m.workspace.catalogDownloads=["bad":bad.id]
m.removeCatalogSounds([BronzeCatalogSound(id:"bad")]);check(m.catalogDownloadError != nil && m.userSoundFonts==[bad],"invalid path rejected without losing metadata")
print("NATIVE_LIBRARY_REMOVAL_OK")
`;
try {
 fs.writeFileSync(path.join(temp,'main.swift'),swift);
 const result=spawnSync('swift',[path.join(temp,'main.swift'),temp],{encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
 console.log(result.stdout.trim());
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
