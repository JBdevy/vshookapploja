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

O script usa o Ninja do Homebrew por caminho absoluto, sem o wrapper Python do
depot_tools. O cache de CI inclui a revisão e o script de compilação. O teste
`test-skia-apple-build.mjs` executa a receita com ferramentas simuladas para
verificar os cinco destinos, diretórios com espaços e empacotamento. Ele não
substitui a compilação real no macOS.

## Estado da migração

A interface nativa ainda não tem paridade funcional com o app anterior.
O modo nativo está ligado para permitir testes da IPA; não remover ainda o
fallback Capacitor nem os recursos usados para empacotar SF2, FX e loops.

Implementado nesta etapa:

- ON/OFF e Solo dos oito módulos usam um comando C++ único que altera somente
  a admissão de novas notas. Mantém caudas, note-off e pedal sustain. Sair de
  Solo restaura os ON/OFF anteriores.
- Biblioteca local User nos módulos 1–6: importação pelo seletor de documentos,
  cópia privada de SF2, nome automático do arquivo e seleção sem JavaScript.
  Os arquivos permanecem no dispositivo; as atribuições aos módulos ainda não
  são restauradas ao reabrir.
- Seleção e transporte dos três Beats fixos, loop contínuo, velocidade relativa
  a 120 BPM e progresso. Cada Play parte do início. O click roda silencioso
  enquanto o loop toca; ON/OFF muda o volume sem reiniciar a fase. O início
  do loop solicita o reset do click no callback de áudio.
- Dois bancos de pads contínuos, filtros Low/High em knobs Skia e notas
  relativas menores. Os FX Church não redisparam ao mover o dedo durante um toque.

Ainda pendentes: presets completos e persistência de sessão, catálogo/conta,
edição completa de efeitos e synth, playlists do usuário, MIDI Learn na UI,
backup e host nativo macOS. A preparação do Skia macOS não cria, por si só, um
app macOS nativo. Model e controles também precisam de adaptação de plataforma.

Validação local: testes do motor C++ compilados em Windows/MSVC, testes Node
e receita Skia simulada. Compilação Swift/Objective-C++, desenho Skia real,
gestos e sincronismo audível precisam ser verificados em Xcode/IPA e iPad.
