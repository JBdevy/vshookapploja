# Hook Keys Engine

Núcleo C++ do motor de áudio do Hook Keys. A interface pública não depende da
interface HTML, do Capacitor, do JUCE ou do FluidSynth.

## Estado atual

- 8 módulos independentes;
- fila MPSC limitada e sem mutex: interface e até 3 entradas MIDI podem produzir
  comandos simultaneamente para um único callback de áudio;
- cada módulo escolhe uma das 3 entradas MIDI ou todas as entradas ativas para notas, pitch e modulation;
- roteamento por faixa de notas e transposição de -3 a +3 oitavas;
- bloqueio individual de sustain (CC64) e modulation (CC1);
- pitch bend e demais CCs encaminhados aos módulos ativos;
- desligamento seguro das vozes ao desativar um módulo;
- comando global de `all notes off`;
- reprodução SF2 com TinySoundFont, carregada fora do callback de áudio;
- polifonia pré-alocada durante o carregamento para que novas notas não façam
  alocação de memória no callback;
- troca preparada de timbre sem leitura de arquivo, mutex ou alocação no
  callback de áudio;
- cadeia DSP individual nos 8 módulos: cutoff, equalizador de 5 bandas,
  compressor, delay e reverb;
- envelope de volume Attack, Hold, Decay e Release aplicado sem alterar o código
  da dependência TinySoundFont;
- delay livre em milissegundos ou sincronizado ao BPM geral do aplicativo;
- ganho Master atômico, incluindo silêncio real na posição −∞;
- buffers de delay e reverb pré-alocados antes de iniciar o áudio;
- roteamento mono ou estéreo de cada módulo para até 32 canais físicos;
- runtime compartilhado por AAudio/Android, AVAudioEngine/CoreMIDI/iOS e CPAL/Midir/Tauri no desktop;
- testes do caminho completo SF2 + MIDI + áudio sem depender de hardware.

## Dependências fornecidas

O motor não usa JUCE nem FluidSynth. O único renderizador SF2 compilado é o
TinySoundFont, preservado em `third_party/TinySoundFont` sob licença MIT e com
o commit de origem registrado em `HOOK_KEYS_VERSION.txt`.

`OpenAudio-master` é um catálogo de projetos de áudio, não uma biblioteca do
motor, portanto também não é compilado.
