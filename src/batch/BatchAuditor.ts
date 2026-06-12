import { AuditEngine } from '../engine/AuditEngine';
import {
  BatchAuditRequest,
  BatchAuditResult,
  TextAuditRequest,
  TextAuditResult,
} from '../types';

export class BatchAuditor {
  private auditEngine: AuditEngine;
  private defaultConcurrency = 5;

  constructor(auditEngine: AuditEngine) {
    this.auditEngine = auditEngine;
  }

  public async batchAudit(request: BatchAuditRequest): Promise<BatchAuditResult> {
    const startTime = Date.now();
    const batchId = this.generateBatchId();
    const concurrency = request.concurrency || this.defaultConcurrency;

    const items = request.items.map((item, index) => ({
      ...item,
      scene: item.scene || request.scene,
      requestId: item.requestId || `${batchId}_${index}`,
    }));

    const results: TextAuditResult[] = [];
    let currentIndex = 0;

    const processBatch = async (): Promise<void> => {
      while (currentIndex < items.length) {
        const batchItems = items.slice(currentIndex, currentIndex + concurrency);
        currentIndex += batchItems.length;

        const batchPromises = batchItems.map((item) =>
          this.auditEngine.audit(item)
        );
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }
    };

    await processBatch();

    const passed = results.filter((r) => r.isPassed).length;
    const failed = results.length - passed;

    return {
      batchId,
      total: results.length,
      passed,
      failed,
      results,
      timestamp: Date.now(),
      costMs: Date.now() - startTime,
    };
  }

  public async batchAuditSequential(request: BatchAuditRequest): Promise<BatchAuditResult> {
    const startTime = Date.now();
    const batchId = this.generateBatchId();

    const items = request.items.map((item, index) => ({
      ...item,
      scene: item.scene || request.scene,
      requestId: item.requestId || `${batchId}_${index}`,
    }));

    const results: TextAuditResult[] = [];

    for (const item of items) {
      const result = await this.auditEngine.audit(item);
      results.push(result);
    }

    const passed = results.filter((r) => r.isPassed).length;
    const failed = results.length - passed;

    return {
      batchId,
      total: results.length,
      passed,
      failed,
      results,
      timestamp: Date.now(),
      costMs: Date.now() - startTime,
    };
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
