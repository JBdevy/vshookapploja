import Foundation
var acquired: [URL] = [], released: [URL] = []
let destination = URL(fileURLWithPath: "/tmp/External Drive/Exportação")
var picker: AudioExportURLAccess? = AudioExportURLAccess(destination, start: { acquired.append($0); return true }, stop: { released.append($0) })
precondition(picker!.url == destination)
var worker: AudioExportURLAccess? = AudioExportURLAccess(picker!.url, start: { acquired.append($0); return true }, stop: { released.append($0) })
picker = nil
precondition(acquired == [destination, destination] && released == [destination], "Dismissing the picker/form leaves the worker's scope alive")
precondition(worker!.url == destination, "The renderer retains the picker URL instead of reconstructing a sandbox-free path")
worker = nil
precondition(released == [destination, destination], "Finishing or cancelling the worker releases its own scope exactly once")
var unscoped: AudioExportURLAccess? = AudioExportURLAccess(destination, start: { _ in false }, stop: { _ in fatalError("A sandbox-local URL must not release a scope it never acquired") })
precondition(unscoped!.url == destination)
unscoped = nil
print("AUDIO_EXPORT_PICKER_WORKER_SCOPE_LIFETIME_AND_BALANCED_RELEASE_OK")
