import {
  SDKConfig,
  TextAuditRequest,
  TextAuditResult,
  BatchAuditRequest,
  BatchAuditResult,
  AuditStatistics,
  WhitelistWord,
  AuditIntensity,
  RiskCategory,
  ReviewStatus,
  MisjudgeFeedback,
  ManualReviewRecord,
  HitDetail,
  RemoteAuditConfig,
  RemoteAuditChannel,
  RuleVersion,
  RuleSnapshot,
  AuditChainResult,
  FeedbackReasonCategory,
  FeedbackStatus,
} from './types';
import { RuleConfigManager } from './config/RuleConfigManager';
import { AuditEngine } from './engine/AuditEngine';
import { BatchAuditor } from './batch/BatchAuditor';
import { ResultInterpreter } from './interpreter/ResultInterpreter';
import { ReviewManager } from './review/ReviewManager';
import { StatisticsManager } from './statistics/StatisticsManager';
import { RetryManager } from './retry/RetryManager';
import { Detector } from './detectors/BaseDetector';

export class ContentAuditSDK {
  private config: SDKConfig;
  private ruleConfigManager: RuleConfigManager;
  private auditEngine: AuditEngine;
  private batchAuditor: BatchAuditor;
  private resultInterpreter: ResultInterpreter;
  private reviewManager: ReviewManager;
  private statisticsManager: StatisticsManager;
  private retryManager: RetryManager;

  constructor(config: SDKConfig) {
    if (!config.appKey) {
      throw new Error('appKey is required');
    }

    this.config = config;
    this.ruleConfigManager = new RuleConfigManager(config);
    this.auditEngine = new AuditEngine(this.ruleConfigManager);
    this.batchAuditor = new BatchAuditor(this.auditEngine);
    this.resultInterpreter = new ResultInterpreter();
    this.reviewManager = new ReviewManager();
    this.statisticsManager = new StatisticsManager();
    this.retryManager = new RetryManager(this.auditEngine, config);

    if (config.remoteAudit) {
      this.auditEngine.setRemoteAuditConfig(config.remoteAudit);
    }
  }

  public async auditText(request: TextAuditRequest): Promise<TextAuditResult> {
    const result = await this.retryManager.auditWithRetry(request);
    this.reviewManager.storeResult(result);
    this.statisticsManager.recordResult(result);
    return result;
  }

  public async batchAudit(request: BatchAuditRequest): Promise<BatchAuditResult> {
    const result = await this.batchAuditor.batchAudit(request);
    result.results.forEach((r) => {
      this.reviewManager.storeResult(r);
      this.statisticsManager.recordResult(r);
    });
    return result;
  }

  public explainResult(result: TextAuditResult): string {
    return this.resultInterpreter.explain(result);
  }

  public getDisplayText(result: TextAuditResult, maskChar = '*'): string {
    return this.resultInterpreter.getDisplayText(result, maskChar);
  }

  public queryByRequestId(requestId: string): TextAuditResult | null {
    return this.reviewManager.queryByRequestId(requestId);
  }

  public queryAuditChain(requestId: string): AuditChainResult | null {
    const chain = this.reviewManager.queryAuditChain(requestId);
    return chain;
  }

  public explainAuditChain(requestId: string): string | null {
    const chain = this.reviewManager.queryAuditChain(requestId);
    if (!chain) return null;
    return this.resultInterpreter.explainAuditChain(chain);
  }

  public manualReview(
    requestId: string,
    status: ReviewStatus,
    reviewer: string,
    comment?: string,
    isMisjudged = false
  ): ManualReviewRecord | null {
    const record = this.reviewManager.manualReview(
      requestId,
      status,
      reviewer,
      comment,
      isMisjudged
    );
    if (record) {
      this.statisticsManager.markManuallyReviewed(requestId);
    }
    return record;
  }

  public approve(requestId: string, reviewer: string, comment?: string): ManualReviewRecord | null {
    const record = this.reviewManager.approve(requestId, reviewer, comment);
    if (record) {
      this.statisticsManager.markManuallyReviewed(requestId);
    }
    return record;
  }

  public reject(requestId: string, reviewer: string, comment?: string): ManualReviewRecord | null {
    const record = this.reviewManager.reject(requestId, reviewer, comment);
    if (record) {
      this.statisticsManager.markManuallyReviewed(requestId);
    }
    return record;
  }

  public markMisjudged(
    requestId: string,
    reviewer: string,
    comment?: string
  ): ManualReviewRecord | null {
    const record = this.reviewManager.markMisjudged(requestId, reviewer, comment);
    if (record) {
      this.statisticsManager.markManuallyReviewed(requestId);
    }
    return record;
  }

  public submitMisjudgeFeedback(params: {
    requestId: string;
    category: RiskCategory;
    feedback: string;
    reasonCategory: FeedbackReasonCategory;
    contact?: string;
  }): MisjudgeFeedback {
    return this.reviewManager.submitMisjudgeFeedback(params);
  }

  public processFeedback(
    feedbackId: string,
    handler: string,
    status: FeedbackStatus.PROCESSING | FeedbackStatus.RESOLVED | FeedbackStatus.DISMISSED,
    comment?: string
  ): MisjudgeFeedback | null {
    return this.reviewManager.processFeedback(feedbackId, handler, status, comment);
  }

  public getMisjudgeFeedbacks(requestId?: string): MisjudgeFeedback[] {
    return this.reviewManager.getMisjudgeFeedbacks(requestId);
  }

  public getPendingReviews(): TextAuditResult[] {
    return this.reviewManager.getPendingReviews();
  }

  public getReviewStats(): ReturnType<ReviewManager['getReviewStats']> {
    return this.reviewManager.getReviewStats();
  }

  public getStatistics(periodStart?: number, periodEnd?: number): AuditStatistics {
    return this.statisticsManager.getStatistics(periodStart, periodEnd);
  }

  public getCategoryStats(
    category: RiskCategory,
    periodStart?: number,
    periodEnd?: number
  ): ReturnType<StatisticsManager['getCategoryStats']> {
    return this.statisticsManager.getCategoryStats(category, periodStart, periodEnd);
  }

  public getSceneStats(
    scene: string,
    periodStart?: number,
    periodEnd?: number
  ): ReturnType<StatisticsManager['getSceneStats']> {
    return this.statisticsManager.getSceneStats(scene, periodStart, periodEnd);
  }

  public addWhitelistWord(word: WhitelistWord): void {
    this.ruleConfigManager.addWhitelistWord(word);
  }

  public removeWhitelistWord(word: string): void {
    this.ruleConfigManager.removeWhitelistWord(word);
  }

  public getWhitelistWords(): WhitelistWord[] {
    return this.ruleConfigManager.getWhitelistWords();
  }

  public isWhitelisted(word: string, category?: RiskCategory): boolean {
    return this.ruleConfigManager.isWhitelisted(word, category);
  }

  public setSceneIntensity(scene: string, intensity: AuditIntensity): void {
    this.ruleConfigManager.setSceneIntensity(scene, intensity);
  }

  public getSceneIntensity(scene: string): AuditIntensity {
    return this.ruleConfigManager.getSceneIntensity(scene);
  }

  public getSceneParams(scene?: string, businessTag?: string) {
    return this.ruleConfigManager.getSceneParams(scene, businessTag);
  }

  public setRemoteAuditChannel(config: RemoteAuditConfig): void {
    this.auditEngine.setRemoteAuditConfig(config);
    this.config.remoteAudit = config;
  }

  public disableRemoteAudit(): void {
    this.auditEngine.setRemoteAuditConfig(null);
    this.config.remoteAudit = undefined;
  }

  public addRuleVersion(ruleVersion: RuleVersion): void {
    this.ruleConfigManager.addRuleVersion(ruleVersion);
  }

  public getRuleVersion(version: string): RuleVersion | undefined {
    return this.ruleConfigManager.getRuleVersion(version);
  }

  public getAllRuleVersions(): RuleVersion[] {
    return this.ruleConfigManager.getAllRuleVersions();
  }

  public setSceneRuleVersion(scene: string, version: string): void {
    this.ruleConfigManager.setSceneRuleVersion(scene, version);
  }

  public getRuleVersionForScene(scene: string): string {
    return this.ruleConfigManager.getRuleVersionForScene(scene);
  }

  public captureRuleSnapshot(scene: string): RuleSnapshot {
    return this.ruleConfigManager.captureRuleSnapshot(scene);
  }

  public updateConfig(partialConfig: Partial<SDKConfig>): void {
    this.ruleConfigManager.updateConfig(partialConfig);
    this.retryManager.updateConfig(partialConfig);
    this.config = { ...this.config, ...partialConfig };
    if (partialConfig.remoteAudit) {
      this.auditEngine.setRemoteAuditConfig(partialConfig.remoteAudit);
    }
  }

  public getConfig(): SDKConfig {
    return this.ruleConfigManager.getConfig();
  }

  public addDetector(detector: Detector): void {
    this.auditEngine.addDetector(detector);
  }

  public removeDetector(category: RiskCategory): void {
    this.auditEngine.removeDetector(category);
  }

  public getLevelText(level: string): string {
    return this.resultInterpreter.getLevelText(level as any);
  }

  public getCategoryText(category: RiskCategory): string {
    return this.resultInterpreter.getCategoryText(category);
  }

  public getIntensityText(intensity: string): string {
    return this.resultInterpreter.getIntensityText(intensity);
  }

  public shouldManualReview(result: TextAuditResult): boolean {
    return this.resultInterpreter.shouldManualReview(result);
  }
}

export * from './types';
export { RuleConfigManager } from './config/RuleConfigManager';
export { AuditEngine } from './engine/AuditEngine';
export { BatchAuditor } from './batch/BatchAuditor';
export { ResultInterpreter } from './interpreter/ResultInterpreter';
export { ReviewManager } from './review/ReviewManager';
export { StatisticsManager } from './statistics/StatisticsManager';
export { RetryManager } from './retry/RetryManager';
export { BaseDetector, Detector } from './detectors/BaseDetector';
export { AdDetector } from './detectors/AdDetector';
export { AbuseDetector } from './detectors/AbuseDetector';
export { PrivacyDetector } from './detectors/PrivacyDetector';
export { SensitiveDetector } from './detectors/SensitiveDetector';

export default ContentAuditSDK;
