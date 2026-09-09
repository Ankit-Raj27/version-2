export type WhatsAppConnectionState =
  | 'idle'
  | 'connecting'
  | 'qr'
  | 'connected'
  | 'disconnected'
  | 'logged_out';

export interface WhatsAppStatus {
  state: WhatsAppConnectionState;
  connected: boolean;
}

export interface SentWhatsAppMessage {
  externalMessageId: string;
  timestamp: number;
}