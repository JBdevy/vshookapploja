import SwiftUI

struct DirectorSearchView: View {
    @ObservedObject var session: HookSession
    let close: () -> Void
    @State private var query = ""
    private var entries: [JSON] { DirectorSearch.entries(session.snapshot, query: query) }
    var body: some View {
        GeometryReader { geometry in
            VStack(spacing: 7) {
                HStack {
                    Text("LUPA").font(.custom("Arial-BoldMT", size: 20)).foregroundColor(Color(hex: "FACC15")); Spacer()
                    DirectorControl(title: "FECHAR", height: 40, action: close).frame(width: 120)
                }
                HStack(spacing: 8) {
                    Group {
                        if session.tablet { Text(query.isEmpty ? "PESQUISAR MÚSICA" : query).frame(maxWidth: .infinity, alignment: .leading) }
                        else { TextField("PESQUISAR MÚSICA", text: $query).textInputAutocapitalization(.characters).disableAutocorrection(true) }
                    }.font(.custom("Arial-BoldMT", size: 17)).padding(.horizontal, 10).frame(height: 42).background(Color(hex: "070B11")).cornerRadius(6)
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "475569")))
                    Text("\(entries.count)").font(.headline).frame(width: 48, height: 40).background(Color(hex: "172033")).cornerRadius(6)
                }
                ScrollView {
                    LazyVStack(spacing: 5) {
                        ForEach(Array(entries.enumerated()), id: \.offset) { _, item in
                            let inPlaylist = session.activePlaylist.first("songs", "items").array.contains { $0.identifier == item.identifier || $0.identifier == item["parentId"].string }
                            Button {
                                session.setPage(inPlaylist ? "playlist" : "regions")
                                session.panel = ""; session.query = ""
                                if !item["parentId"].string.isEmpty { session.openFamilies.insert(item["parentId"].string) }
                                session.select(item); close()
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(item.name.uppercased()).font(.custom("Arial-BoldMT", size: 14)).lineLimit(2)
                                        if item.isFamilyChild { Text("FILHO DE " + item["parentName"].string.uppercased()).font(.custom("Arial-BoldMT", size: 9)).foregroundColor(Color(hex: "C4B5FD")) }
                                    }.frame(maxWidth: .infinity, alignment: .leading)
                                    VStack(alignment: .trailing, spacing: 3) {
                                        Text(inPlaylist ? "REPERTÓRIO" : "MÚSICAS").font(.custom("Arial-BoldMT", size: 9)).foregroundColor(Color(hex: "93C5FD"))
                                        Text(directorTime(item.songDuration)).font(.custom("Arial-BoldMT", size: 11)).foregroundColor(Color(hex: "FACC15"))
                                    }
                                }.padding(.horizontal, 10).frame(minHeight: 48)
                            }.buttonStyle(DirectorButtonStyle(background: Color(hex: item.isFamilyChild ? "31204E" : "111827")))
                        }
                        if entries.isEmpty { Text("NENHUMA MÚSICA ENCONTRADA").font(.caption.bold()).padding(20) }
                    }
                }
                if session.tablet { keyboard(height: min(38, max(28, geometry.size.height * 0.062))) }
            }.padding(8).background(Color(hex: "0B1220"))
        }.background(Color(hex: "05070B").ignoresSafeArea()).onAppear { HookOrientation.set(tablet: session.tablet) }
    }
    private func keyboard(height: CGFloat) -> some View {
        VStack(spacing: 4) {
            ForEach(Array(["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].enumerated()), id: \.offset) { index, row in
                HStack(spacing: 4) {
                    ForEach(Array(row), id: \.self) { key in
                        DirectorControl(title: String(key), background: Color(hex: "334155"), height: height, size: 13) { if query.count < 80 { query += String(key) } }
                    }
                }.padding(.horizontal, index == 2 ? 20 : index == 3 ? 50 : 0)
            }
            HStack(spacing: 4) {
                DirectorControl(title: "LIMPAR", background: Color(hex: "991B1B"), height: height, size: 12) { query = "" }
                DirectorControl(title: "ESPAÇO", background: Color(hex: "1E40AF"), height: height, size: 12) { if !query.isEmpty && !query.hasSuffix(" ") { query += " " } }.frame(maxWidth: .infinity)
                DirectorControl(title: "⌫", background: Color(hex: "92400E"), height: height, size: 18) { if !query.isEmpty { query.removeLast() } }
            }
        }.padding(6).background(Color(hex: "111827")).cornerRadius(6).overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: "334155")))
    }
}
