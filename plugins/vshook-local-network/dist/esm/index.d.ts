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
}

export declare const VSHookLocalNetwork: VSHookLocalNetworkPlugin;
