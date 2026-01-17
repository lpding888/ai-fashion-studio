export interface ModelConfig {
  // Snapshot-only identifiers (no secrets)
  brainProfileId?: string;
  brainProfileIds?: string[]; // 可选：同一网关多 Key 轮询（仅存ID，不含密钥）
  painterProfileId?: string;
  painterProfileIds?: string[]; // 可选：同一网关多 Key 轮询（仅存ID，不含密钥）

  // Shared or Brain-specific
  gatewayUrl?: string; // Legacy/Fallback
  apiKey?: string; // Legacy/Fallback

  // Specific
  brainGateway?: string;
  brainKey?: string;
  brainKeys?: string[]; // 运行时注入（不落库）：用于同一网关多 Key
  brainModel?: string;

  painterGateway?: string;
  painterKey?: string;
  painterKeys?: string[]; // 运行时注入（不落库）：用于同一网关多 Key
  painterModel?: string;
}
