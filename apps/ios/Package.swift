// swift-tools-version: 6.0
// App do Clima Escritório para iPhone (SwiftUI). Projeto xtool: um pacote SwiftPM com UM produto de biblioteca que é o
// app. Compilar e instalar no iPhone: `xtool dev` (depois de `xtool setup` com o Apple ID). Gerar o .ipa: `xtool dev build --ipa`.
import PackageDescription

let package = Package(
    name: "ClimaEscritorio",
    defaultLocalization: "pt",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "ClimaEscritorio", targets: ["ClimaEscritorio"])],
    targets: [
        .target(name: "ClimaEscritorio", path: "Sources/ClimaEscritorio", swiftSettings: [.swiftLanguageMode(.v5)]),
    ]
)
