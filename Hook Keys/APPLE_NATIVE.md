# Bronze Keys nativo para Apple

O modo nativo está ativado por padrão por `BronzeNativeUIEnabled` no
`Info.plist`. Como o root é criado no `AppDelegate`, ele não instancia
`WKWebView`. O argumento `--bronze-native-ui` continua disponível para testes
em configurações cujo `Info.plist` desative temporariamente a nova interface.

O caminho de performance já é direto:

`Core MIDI -> HookKeysNativeEngine -> NativeEngineRuntime C++ -> AVAudioSourceNode -> Core Audio`

Pads contínuos e FX aprendidos no canal MIDI 10 também entram no runtime C++.
Os FX são decodificados uma vez para PCM fora do callback e tocados pela thread
de áudio, sem `HTMLAudioElement`.

## Skia

`BronzeSkiaControlView` é a superfície usada por knobs e faders. Para gerar o
artefato Apple universal, execute num Mac:

```bash
bash scripts/build-skia-apple.sh
```

O script produz `ios/App/Vendor/Skia.xcframework` para iPhone/iPad, simulador e
macOS, além de `ios/Skia.generated.xcconfig`. A revisão fica fixada em
`scripts/skia-apple.revision` para que
uma atualização futura do Skia não altere uma build antiga. Sem esse artefato,
o desenho usa um fallback Core Graphics apenas no desenvolvimento; ao gerar o
xcconfig, `BRONZE_KEYS_REQUIRE_SKIA=1` impede uma entrega silenciosa sem Skia.

As views SwiftUI não dependem diretamente de UIKit, com exceção do adaptador da
superfície Skia. Isso permite compartilhar layout, estado e comandos com o alvo
macOS; no Mac muda apenas o host (`NSViewRepresentable`) e a camada de áudio.
