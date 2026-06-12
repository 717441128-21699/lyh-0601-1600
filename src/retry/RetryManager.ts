import { AuditEngine } from '../engine/AuditEngine';
import { TextAuditRequest, TextAuditResult, SDKConfig } from '../types';

export class RetryManager {
  private auditEngine: AuditEngine;
  private config: SDKConfig;

  constructor(auditEngine: AuditEngine, config: SDKConfig) {
    this.auditEngine = auditEngine;
    this.config = config;
  }

  public async auditWithRetry(request: TextAuditRequest): Promise<TextAuditResult> {
    if (!this.config.enableRetry) {
      return this.auditEngine.audit(request);
    }

    const maxRetries = this.config.maxRetryCount || 3;
    const retryDelayMs = this.config.retryDelayMs || 1000;

    let lastError: Error | null = null;
    let result: TextAuditResult | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        result = await this.auditEngine.audit(request);
        result.retryCount = attempt;
        return result;
      } catch (error) {
        lastError = error as Error;
        retryCount = attempt + 1;

        if (attempt < maxRetries) {
          await this.delay(retryDelayMs * Math.pow(2, attempt));
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    return result as TextAuditResult;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public updateConfig(config: Partial<SDKConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
