import { io, type Socket } from 'socket.io-client';
import Constants from 'expo-constants';
import type { ClientToServerEvents, ServerToClientEvents } from '@deeper/shared';

function getServerUrl(): string {
  // 1. Explicit env var always wins (use this for EAS/production builds)
  const envUrl = process.env.EXPO_PUBLIC_SOCKET_URL;
  if (envUrl && envUrl.length > 0) return envUrl;

  // 2. Dev: derive from the machine Metro is running on. The Socket.IO
  //    backend always runs on that same machine, so this keeps working
  //    across Wi-Fi/DHCP changes, emulators and physical devices.
  //      physical device   -> http://192.168.x.x:4400
  //      Android emulator  -> http://10.0.2.2:4400
  //      iOS simulator     -> http://localhost:4400
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      ?.split(':')[0];
    if (host) return `http://${host}:4400`;
  }

  // 3. Last resort
  return 'http://localhost:4400';
}

const serverUrl = getServerUrl();
if (__DEV__) console.log(`[socket] game server: ${serverUrl}`);

export type DeeperSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export const socket: DeeperSocket = io(serverUrl, {
  autoConnect: false,
  transports: ['websocket', 'polling'], // polling fallback if websocket blocked
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 10000,
});
