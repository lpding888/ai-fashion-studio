export interface ModelConfig {
  // Snapshot-only identifiers (no secrets)
  brainProfileId?: string;
  painterProfileId?: string;

  // Shared or Brain-specific
  gatewayUrl?: string; // Legacy/Fallback
  apiKey?: string; // Legacy/Fallback

  // Specific
  brainGateway?: string;
  brainKey?: string;
  brainModel?: string;

  painterGateway?: string;
  painterKey?: string;
  painterModel?: string;
}
