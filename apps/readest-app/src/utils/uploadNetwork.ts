import { invoke } from '@tauri-apps/api/core';
import { isTauriAppPlatform } from '@/services/environment';

/** What the device is connected through. `unknown` when it cannot be told. */
export type NetworkKind = 'wifi' | 'cellular' | 'none' | 'unknown';

/** The browser's `navigator.connection.type` (Android web views and Chrome; iOS has none). */
export const kindFromConnectionType = (type: string | undefined): NetworkKind => {
  switch (type) {
    case 'wifi':
    case 'ethernet':
      return 'wifi';
    case 'cellular':
      return 'cellular';
    case 'none':
      return 'none';
    default:
      return 'unknown';
  }
};

/**
 * The connection in use. In the apps the Rust side looks at the network interfaces (iOS and
 * Android web views do not say); on the web the browser's connection type is used. A device
 * that cannot be told is `unknown`, which never blocks anything.
 */
export const getNetworkKind = async (): Promise<NetworkKind> => {
  if (isTauriAppPlatform()) {
    try {
      const kind = await invoke<string>('network_kind');
      return kind === 'wifi' || kind === 'cellular' || kind === 'none' ? kind : 'unknown';
    } catch {
      // Desktop builds and old app versions have no such command.
    }
  }
  if (typeof navigator === 'undefined') return 'unknown';
  const connection = (navigator as Navigator & { connection?: { type?: string } }).connection;
  return kindFromConnectionType(connection?.type);
};

/**
 * Should an upload wait? Automatic uploads wait for Wi-Fi when the user wants that; one the user
 * pressed themselves goes ahead on any network, mobile data included.
 */
export const shouldHoldUpload = ({
  manual,
  wifiOnly,
  kind,
}: {
  manual: boolean;
  wifiOnly: boolean;
  kind: NetworkKind;
}) => !manual && wifiOnly && (kind === 'cellular' || kind === 'none');
