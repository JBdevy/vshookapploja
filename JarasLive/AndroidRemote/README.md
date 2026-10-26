# CatLive Remote para Android

Aplicativo Android dedicado ao Remote. O projeto e o audio continuam no CatLive
do computador; o celular conecta pela rede local para controlar ou acompanhar a
sessao. Esta versao nao inclui a DAW nem o motor de audio do desktop.

- Modos Diretor, Observador e Recados, com as permissoes definidas pelo host.
- Transporte, setlist, mixer, grid, Parts e teleprompters.
- Descoberta dos computadores na rede local.
- Conexao criptografada compativel com o protocolo Remote do CatLive.
- Interface para celular e tablet, com suporte a retrato e paisagem.

## Compilar e testar no Windows

Requer JDK 17 ou superior, Android SDK com plataforma e Build Tools 36 e Node.js
para o teste de interoperabilidade. O script usa `ANDROID_HOME` ou, por padrao,
`%LOCALAPPDATA%\Android\Sdk`. Configure `JAVA_HOME` para o JDK.

Na pasta `AndroidRemote`, execute:

```powershell
.\scripts\build-windows.ps1
```

O comando executa os testes, o Android Lint e a compilacao. O APK de teste fica
em `app\build\outputs\apk\debug\app-debug.apk`.

## Instalar no celular conectado

Ative a depuracao USB, conecte um cabo de dados e autorize este computador no
celular. Com um unico aparelho conectado:

```powershell
.\scripts\build-windows.ps1 -Install
```

Com mais de um aparelho, informe o identificador mostrado em `adb devices`:

```powershell
.\scripts\build-windows.ps1 -Install -Device IDENTIFICADOR
```

O script instala o APK de teste e abre o CatLive Remote. A instalacao nao apaga
os dados de uma versao existente. No celular, toque em **Conectar ao PC** e
ative o Remote no CatLive do computador, com ambos na mesma rede local.

## Testes

Os testes existentes verificam os layouts de celular/tablet, as permissoes dos
modos, os comandos, a criptografia, a reconexao e a comunicacao TCP com um host
isolado em Node.js. Eles nao abrem nem alteram projetos reais do usuario.

`scripts/check-apple-reference.py` verifica se os arquivos Apple mudaram desde
a ultima revisao de compatibilidade registrada em `reference.json`; ele nao
atualiza essa referencia automaticamente.
