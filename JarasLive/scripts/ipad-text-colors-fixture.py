from pathlib import Path
import plistlib, sys
r=Path(__file__).resolve().parent.parent
s=(r/'Apple/Shared/TextItemEditor.swift').read_text();model=(r/'Application/Project/ProjectModels.swift').read_text();a=model.index('public enum ItemTextColors');model=model[a:]
# ItemTextColors is the final top-level declaration in the model.
palette=s[s.index('struct ItemTextColorPalette:'):s.index('extension ItemTextColors {')]
ios=s[s.index('#if os(iOS)\nimport UIKit'):]
keyboard=(r/'Apple/Shared/IpadTextKeyboard.swift').read_text()
stubs='''import SwiftUI
import UIKit
struct JarasTheme { static let text=Color.white, background=Color.black, panel=Color(white:0.12), green=Color.green }
extension Font { static let jarasHeadline=Font.headline }
extension Color { init(hex: UInt32) { self.init(red:Double(hex>>16&255)/255,green:Double(hex>>8&255)/255,blue:Double(hex&255)/255) } }
'''
tests='''
@main class EditorFixtureApp: UIResponder, UIApplicationDelegate {
 var window: UIWindow?
 func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey:Any]?) -> Bool {
  let w=UIWindow(frame:UIScreen.main.bounds); let vc=UIViewController();w.rootViewController=vc;w.makeKeyAndVisible();window=w
  let editor=IpadColoredTextView(frame:CGRect(x:50,y:100,width:600,height:180));vc.view.addSubview(editor)
  editor.load("A 🎵 B Am")
  let source=editor.textStorage.string as NSString
  let notes=source.range(of:"🎵 B")
  editor.applyColor(0xff0000,range:notes)
  let encoded=editor.encodedText
  precondition(ItemTextColors.plain(encoded)=="A 🎵 B Am")
  precondition(ItemTextColors.runs(encoded).contains { $0.text=="🎵 B" && $0.color==0xff0000 })
  let fresh=IpadColoredTextView();fresh.load(encoded)
  precondition(fresh.encodedText==encoded)
  let chord=(editor.textStorage.string as NSString).range(of:"Am")
  editor.applyColor(0x00ff00,range:chord)
  precondition(ItemTextColors.runs(editor.encodedText).contains {$0.text=="Am" && $0.color==0x00ff00})
  precondition(ItemTextColors.palette.count==8)
  let colored=editor.encodedText
  let typing=IpadColoredTextView()
  typing.load(ItemTextColors.encode([.init(text:"Am",color:0xff0000)]))
  typing.selectedRange=NSRange(location:2,length:0)
  typing.insertText("7")
  precondition(ItemTextColors.runs(typing.encodedText)==[.init(text:"Am",color:0xff0000),.init(text:"7")],"Typing after a colored selection must use the default color")
  typing.selectedRange=NSRange(location:0,length:2)
  typing.insertText("Dm")
  precondition(ItemTextColors.runs(typing.encodedText)==[.init(text:"Dm7")],"Typing over a colored selection must use the default color")
  guard let undo=editor.undoManager else { fatalError("Editor has no undo manager") }
  DispatchQueue.main.asyncAfter(deadline:.now()+0.2) {
  precondition(editor.isFirstResponder, "Text editor must request focus on opening")
  precondition(editor.inputView is IpadTextKeyboardView, "Text editor must use the native custom keyboard")
  editor.resignFirstResponder()
  precondition(editor.becomeFirstResponder(), "Text editor must reopen the keyboard after dismissal")
  undo.undo()
  precondition(editor.encodedText=="A 🎵 B Am", "Undo must restore uncolored text")
  undo.redo()
  precondition(editor.encodedText==colored, "Redo must restore exact selected colors")
  var draft=editor.encodedText
  let coordinator=IpadTextItemNotepad.Coordinator(IpadTextItemNotepad(text:Binding(get:{draft},set:{draft=$0})))
  editor.delegate=coordinator
  editor.selectedRange=notes
  let systemAction=UIAction(title:"Translate") {_ in fatalError("System menu must not replace color palette")}
  let emptyMenu=coordinator.textView(editor,editMenuForTextIn:NSRange(location:0,length:0),suggestedActions:[systemAction])
  precondition(emptyMenu?.children.count==1,"Keep editing actions when no text is selected")
  let menu=coordinator.textView(editor,editMenuForTextIn:notes,suggestedActions:[systemAction])
  precondition(menu?.children.isEmpty==true,"Selection menu must directly open colors without system actions")
  DispatchQueue.main.asyncAfter(deadline:.now()+1) {
   _ = coordinator
   precondition(vc.presentedViewController != nil,"Selection context menu must open the color palette")
   precondition(editor.selectedRange==notes,"Palette must preserve the selected Unicode range")
   let url=FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0].appendingPathComponent("result.txt")
   try! "IPAD_TEXT_COLORS_SELECTION_MENU_KEYBOARD_UNICODE_CHORDS_UNDO_REDO_PALETTE_OK".write(to:url,atomically:true,encoding:.utf8)
  }
  }
  return true
 }
}
'''
tests=tests.replace('@main class EditorFixtureApp: UIResponder, UIApplicationDelegate {', 'class EditorFixtureScene: UIResponder, UIWindowSceneDelegate {').replace('func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey:Any]?) -> Bool {','func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {').replace('UIWindow(frame:UIScreen.main.bounds)', 'UIWindow(windowScene: scene as! UIWindowScene)').replace('  return true', '')
tests += '\n@main class EditorFixtureApp: UIResponder, UIApplicationDelegate {\n func application(_ app: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {\n let c=UISceneConfiguration(name:nil,sessionRole:session.role);c.delegateClass=EditorFixtureScene.self;return c\n }\n}\n'
b=Path(sys.argv[1]);b.mkdir(exist_ok=True)
(b/'main.swift').write_text(stubs+keyboard+'\n'+model+'\n'+palette+'\n'+ios+'\n'+tests)
a=b/'EditorFixture.app';a.mkdir(exist_ok=True)
(a/'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier':'com.catlive.tests.editorcolors','CFBundleName':'EditorFixture','CFBundleExecutable':'EditorFixture','CFBundlePackageType':'APPL','CFBundleVersion':'1','CFBundleShortVersionString':'1','MinimumOSVersion':'16.0','UIDeviceFamily':[2],'UILaunchScreen':{},'UIApplicationSceneManifest':{'UIApplicationSupportsMultipleScenes':False}}))
