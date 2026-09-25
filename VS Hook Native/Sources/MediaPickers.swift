import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation

struct PhotoPicker: UIViewControllerRepresentable {
    var videos = false
    var multiple = false
    let completion: ([URL]) -> Void
    @Environment(\.dismiss) private var dismiss
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIViewController(context: Context) -> PHPickerViewController {
        var config = PHPickerConfiguration(photoLibrary: .shared())
        config.filter = videos ? .any(of: [.images, .videos]) : .images
        config.selectionLimit = multiple ? 0 : 1
        let picker = PHPickerViewController(configuration: config); picker.delegate = context.coordinator; return picker
    }
    func updateUIViewController(_ controller: PHPickerViewController, context: Context) {}
    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let parent: PhotoPicker
        init(_ parent: PhotoPicker) { self.parent = parent }
        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            parent.dismiss()
            Task {
                var urls: [URL] = []
                for result in results {
                    let provider = result.itemProvider
                    let type = provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) ? UTType.movie.identifier : UTType.image.identifier
                    let url: URL? = await withCheckedContinuation { continuation in
                        provider.loadFileRepresentation(forTypeIdentifier: type) { url, _ in
                            guard let url else { continuation.resume(returning: nil); return }
                            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("HookPicked-" + UUID().uuidString)
                            do {
                                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                                let output = directory.appendingPathComponent(url.lastPathComponent)
                                try FileManager.default.copyItem(at: url, to: output)
                                continuation.resume(returning: output)
                            } catch { continuation.resume(returning: nil) }
                        }
                    }
                    if let url { urls.append(url) }
                }
                await MainActor.run { parent.completion(urls) }
            }
        }
    }
}
struct CameraPicker: UIViewControllerRepresentable {
    var video = false
    let completion: (URL?) -> Void
    @Environment(\.dismiss) private var dismiss
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.mediaTypes = [video ? UTType.movie.identifier : UTType.image.identifier]
        picker.videoQuality = .typeHigh; picker.delegate = context.coordinator; return picker
    }
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss(); parent.completion(nil) }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            defer { parent.dismiss() }
            if let url = info[.mediaURL] as? URL { parent.completion(url) }
            else if let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 0.9) {
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("Foto-\(UUID().uuidString).jpg")
                do { try data.write(to: url); parent.completion(url) } catch { parent.completion(nil) }
            }
        }
    }
}
struct ShareFiles: UIViewControllerRepresentable {
    let urls: [URL]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: urls, applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
