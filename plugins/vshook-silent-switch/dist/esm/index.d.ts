export interface SilentSwitchStatus {
  /** 'normal' toca som e vibra, 'vibrate' so vibra, 'silent' nao faz nada. */
  mode: 'normal' | 'vibrate' | 'silent';
  supported: boolean;
}

export interface VSHookSilentSwitchPlugin {
  getStatus(): Promise<SilentSwitchStatus>;
}

export declare const VSHookSilentSwitch: VSHookSilentSwitchPlugin;
