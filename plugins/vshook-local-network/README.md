# Descoberta na rede local

`getAddresses()` retorna `addresses` (compatibilidade) e `networks`, com IPv4,
`prefixLength` e `interfaceName` das interfaces LAN ativas.

- Android: Wi-Fi/Ethernet/Bluetooth pelo ConnectivityManager e interfaces locais
  UP pela enumeração do sistema. Esta segunda coleta inclui o SoftAP/bridge de
  hotspot criado pelo próprio aparelho, mesmo quando a conexão padrão é celular.
- iOS: interfaces IPv4 UP e suas máscaras via getifaddrs. Celular, VPN e links
  peer-to-peer não entram na busca.
- O app não fixa IP/sub-rede do hotspot. Usa a máscara reportada pelo sistema,
  exclui o próprio aparelho, endereço de rede e broadcast, e descarta histórico
  de outras redes. Sem LAN identificada não faz busca genérica.
- Redes mais amplas que /16 não são varridas automaticamente para evitar milhões
  de requisições. A entrada manual por IP permanece disponível.
- Navegador acessado pelo QR/bridge continua usando somente sua própria origem.

Validação na raiz de apploja:

```text
npm run test:discovery
npm run test:local-network-native
```

O segundo teste exige JDK e compila a política Java real e os métodos do coletor
com snapshots simulados das APIs Android; as guardas iOS verificam
o contrato no código, mas não substituem o build no Xcode nem teste físico.
Para validar hotspot físico, conecte os PCs ao hotspot do telefone que executa
o VS Hook, abra Hook Center/REAPER, e teste Procurar/Atualizar e a troca de rede.
