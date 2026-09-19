export interface VSHookOrientationPlugin {
  setMode(options: { mode: 'phone' | 'tablet' }): Promise<void>;
}

export declare const VSHookOrientation: VSHookOrientationPlugin;
