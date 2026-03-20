/**
 * Abstract connector interface for external integrations.
 */
export interface ConnectorConfig {
  [key: string]: unknown;
}

export interface SendResult {
  success: boolean;
  response?: unknown;
  error?: string;
}

export interface BaseConnector {
  type: string;
  send(payload: Record<string, unknown>, config: ConnectorConfig): Promise<SendResult>;
  test(config: ConnectorConfig): Promise<SendResult>;
}
