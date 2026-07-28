export interface VSHookLocalNetworkPlugin {
  getAddresses(): Promise<{ addresses: string[] }>;
}

export declare const VSHookLocalNetwork: VSHookLocalNetworkPlugin;
