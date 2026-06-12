import {
  AuditStatistics,
  TextAuditResult,
  RiskCategory,
  RiskLevel,
} from '../types';

export class StatisticsManager {
  private results: TextAuditResult[] = [];
  private maxStoredResults = 10000;
  private periodStart = Date.now();
  private manuallyReviewedIds: Set<string> = new Set();

  public recordResult(result: TextAuditResult): void {
    this.results.push(result);
    if (this.results.length > this.maxStoredResults) {
      const removed = this.results.shift();
      if (removed && this.manuallyReviewedIds.has(removed.requestId)) {
        this.manuallyReviewedIds.delete(removed.requestId);
      }
    }
  }

  public markManuallyReviewed(requestId: string): void {
    this.manuallyReviewedIds.add(requestId);
  }

  public getStatistics(periodStart?: number, periodEnd?: number): AuditStatistics {
    const start = periodStart || this.periodStart;
    const end = periodEnd || Date.now();

    const filteredResults = this.results.filter(
      (r) => r.timestamp >= start && r.timestamp <= end
    );

    const totalRequests = filteredResults.length;
    const passedCount = filteredResults.filter((r) => r.isPassed).length;
    const blockedCount = totalRequests - passedCount;

    const categoryDistribution: Record<RiskCategory, number> = {
      [RiskCategory.AD]: 0,
      [RiskCategory.ABUSE]: 0,
      [RiskCategory.PRIVACY]: 0,
      [RiskCategory.SENSITIVE]: 0,
      [RiskCategory.NORMAL]: 0,
    };

    const levelDistribution: Record<RiskLevel, number> = {
      [RiskLevel.SAFE]: 0,
      [RiskLevel.LOW]: 0,
      [RiskLevel.MEDIUM]: 0,
      [RiskLevel.HIGH]: 0,
      [RiskLevel.DANGEROUS]: 0,
    };

    let totalCostMs = 0;
    let retryCount = 0;
    let misjudgeCount = 0;
    let manuallyReviewedCount = 0;
    let remoteAuditCount = 0;
    let remoteAuditFallbackCount = 0;

    filteredResults.forEach((result) => {
      levelDistribution[result.riskLevel]++;
      totalCostMs += result.costMs;

      if (result.retryCount > 0) {
        retryCount++;
      }
      if (result.isMisjudged) {
        misjudgeCount++;
      }
      if (this.manuallyReviewedIds.has(result.requestId)) {
        manuallyReviewedCount++;
      }
      if (result.remoteAuditUsed) {
        remoteAuditCount++;
      }
      if (result.remoteAuditFallback) {
        remoteAuditFallbackCount++;
      }

      result.hitDetails.forEach((detail) => {
        categoryDistribution[detail.category]++;
      });

      if (result.hitDetails.length === 0) {
        categoryDistribution[RiskCategory.NORMAL]++;
      }
    });

    const avgCostMs = totalRequests > 0 ? Math.round(totalCostMs / totalRequests) : 0;
    const retryRate = totalRequests > 0 ? retryCount / totalRequests : 0;
    const misjudgeRate = totalRequests > 0 ? misjudgeCount / totalRequests : 0;
    const manualReviewRate = totalRequests > 0 ? manuallyReviewedCount / totalRequests : 0;

    return {
      totalRequests,
      passedCount,
      blockedCount,
      categoryDistribution,
      levelDistribution,
      avgCostMs,
      retryRate,
      misjudgeRate,
      manualReviewRate,
      manuallyReviewedCount,
      remoteAuditCount,
      remoteAuditFallbackCount,
      periodStart: start,
      periodEnd: end,
    };
  }

  public getCategoryStats(category: RiskCategory, periodStart?: number, periodEnd?: number): {
    count: number;
    levelDistribution: Record<RiskLevel, number>;
  } {
    const start = periodStart || this.periodStart;
    const end = periodEnd || Date.now();

    const filteredResults = this.results.filter(
      (r) => r.timestamp >= start && r.timestamp <= end
    );

    let count = 0;
    const levelDistribution: Record<RiskLevel, number> = {
      [RiskLevel.SAFE]: 0,
      [RiskLevel.LOW]: 0,
      [RiskLevel.MEDIUM]: 0,
      [RiskLevel.HIGH]: 0,
      [RiskLevel.DANGEROUS]: 0,
    };

    filteredResults.forEach((result) => {
      const categoryDetail = result.hitDetails.find((d) => d.category === category);
      if (categoryDetail) {
        count++;
        levelDistribution[categoryDetail.level]++;
      }
    });

    return { count, levelDistribution };
  }

  public getSceneStats(scene: string, periodStart?: number, periodEnd?: number): {
    count: number;
    passRate: number;
    avgCostMs: number;
  } {
    const start = periodStart || this.periodStart;
    const end = periodEnd || Date.now();

    const sceneResults = this.results.filter(
      (r) => r.timestamp >= start && r.timestamp <= end && r.sceneParams.scene === scene
    );

    const count = sceneResults.length;
    const passedCount = sceneResults.filter((r) => r.isPassed).length;
    const passRate = count > 0 ? passedCount / count : 0;
    const avgCostMs = count > 0
      ? Math.round(sceneResults.reduce((sum, r) => sum + r.costMs, 0) / count)
      : 0;

    return { count, passRate, avgCostMs };
  }

  public getTrendData(intervalMs: number, periodStart?: number, periodEnd?: number): Array<{
    timestamp: number;
    count: number;
    passRate: number;
  }> {
    const start = periodStart || this.periodStart;
    const end = periodEnd || Date.now();

    const trendData: Array<{ timestamp: number; count: number; passRate: number }> = [];
    let currentTime = start;

    while (currentTime < end) {
      const intervalEnd = currentTime + intervalMs;
      const intervalResults = this.results.filter(
        (r) => r.timestamp >= currentTime && r.timestamp < intervalEnd
      );

      const count = intervalResults.length;
      const passedCount = intervalResults.filter((r) => r.isPassed).length;
      const passRate = count > 0 ? passedCount / count : 0;

      trendData.push({
        timestamp: currentTime,
        count,
        passRate,
      });

      currentTime = intervalEnd;
    }

    return trendData;
  }

  public resetStatistics(): void {
    this.results = [];
    this.manuallyReviewedIds.clear();
    this.periodStart = Date.now();
  }

  public setMaxStoredResults(max: number): void {
    this.maxStoredResults = max;
    if (this.results.length > max) {
      const removed = this.results.splice(0, this.results.length - max);
      removed.forEach((r) => this.manuallyReviewedIds.delete(r.requestId));
    }
  }

  public getStoredCount(): number {
    return this.results.length;
  }
}
