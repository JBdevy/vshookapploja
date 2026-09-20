export interface VSHookLocalNetworkPlugin {
  getAddresses(): Promise<{
    addresses: string[];
    networks: { address: string; prefixLength: number; interfaceName: string }[];
  }>;
  getFirebaseConfiguration(): Promise<{
    projectId: string;
    senderId: string;
    applicationId: string;
    packageName: string;
  }>;
  renewFirebasePushToken(): Promise<{ token: string }>;
  discoverApplePeers(options?: { timeoutMs?: number }): Promise<{
    peers: { id: string; name: string }[];
  }>;
  connectApplePeer(options: { peerId: string }): Promise<{
    directorUrl: string;
    musiciansUrl: string;
    peerName: string;
    transport: 'apple-peer';
  }>;
  stopApplePeerBridge(): Promise<{ stopped: boolean }>;
}

export declare const VSHookLocalNetwork: VSHookLocalNetworkPlugin;
