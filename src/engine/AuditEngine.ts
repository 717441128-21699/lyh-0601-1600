import { Detector, BaseDetector } from '../detectors/BaseDetector';
import { AdDetector } from '../detectors/AdDetector';
import { AbuseDetector } from '../detectors/AbuseDetector';
import { PrivacyDetector } from '../detectors/PrivacyDetector';
import { SensitiveDetector } from '../detectors/SensitiveDetector';
import {
  HitFragment,
  RiskCategory,
  RiskLevel,
  HitDetail,
  TextAuditResult,
  TextAuditRequest,
  SceneParams,
  ReviewStatus,
  AuditIntensity,
  RemoteAuditResult,
  RemoteAuditConfig,
  WhitelistHitInfo,
  RuleSnapshot,
} from '../types';
import { RuleConfigManager } from '../config/RuleConfigManager';

export class AuditEngine {
  private detectors: Map<RiskCategory, Detector> = new Map();
  private ruleConfigManager: RuleConfigManager;
  private remoteAuditConfig: RemoteAuditConfig | null = null;

  constructor(ruleConfigManager: RuleConfigManager) {
    this.ruleConfigManager = ruleConfigManager;
    this.initializeDetectors();
  }

  private initializeDetectors(): void {
    this.detectors.set(RiskCategory.AD, new AdDetector());
    this.detectors.set(RiskCategory.ABUSE, new AbuseDetector());
    this.detectors.set(RiskCategory.PRIVACY, new PrivacyDetector());
    this.detectors.set(RiskCategory.SENSITIVE, new SensitiveDetector());
  }

  public setRemoteAuditConfig(config: RemoteAuditConfig | null): void {
    this.remoteAuditConfig = config;
  }

  public async audit(request: TextAuditRequest): Promise<TextAuditResult> {
    const startTime = Date.now();
    const requestId = request.requestId || this.generateRequestId();
    const sceneParams = this.ruleConfigManager.getSceneParams(request.scene, request.businessTag);

    const localResult = this.performLocalAudit(request.text, requestId, sceneParams, startTime);

    const shouldTriggerRemote = this.shouldTriggerRemoteAudit(localResult.riskLevel);
    let remoteResult: RemoteAuditResult | undefined;
    let remoteAuditUsed = false;
    let remoteAuditFallback = false;

    if (shouldTriggerRemote && this.remoteAuditConfig) {
      remoteAuditUsed = true;
      try {
        const timeout = this.remoteAuditConfig.timeoutMs || 5000;
        remoteResult = await this.auditWithTimeout(request, timeout);
      } catch {
        remoteAuditFallback = true;
        if (!this.remoteAuditConfig.fallbackToLocal) {
          throw new Error('Remote audit failed and fallback to local is disabled');
        }
      }
    }

    if (remoteResult && !remoteAuditFallback) {
      return this.mergeResults(localResult, remoteResult, requestId, request.text, sceneParams, startTime, true, false);
    }

    localResult.remoteAuditUsed = remoteAuditUsed;
    localResult.remoteAuditFallback = remoteAuditFallback;
    if (remoteResult) {
      localResult.remoteResult = remoteResult;
    }
    return localResult;
  }

  private performLocalAudit(
    text: string,
    requestId: string,
    sceneParams: SceneParams,
    startTime: number
  ): TextAuditResult {
    let allFragments: HitFragment[] = [];

    this.detectors.forEach((detector) => {
      const fragments = detector.detect(text);
      allFragments = allFragments.concat(fragments);
    });

    const { filteredFragments, whitelistHitInfos } = this.filterWhitelistWithInfo(allFragments, text);
    const deduplicatedFragments = this.deduplicateFragments(filteredFragments);
    const hitDetails = this.groupByCategory(deduplicatedFragments, sceneParams.intensity);
    const overallRiskLevel = this.calculateOverallRiskLevel(hitDetails);
    const isPassed = !this.ruleConfigManager.shouldBlock(overallRiskLevel, sceneParams.intensity);
    const suggestions = this.generateSuggestions(hitDetails, isPassed);
    const displayReason = this.generateDisplayReason(hitDetails, isPassed, overallRiskLevel, whitelistHitInfos);
    const whitelistHits = whitelistHitInfos.map((info) => info.word);
    const ruleSnapshot = this.ruleConfigManager.captureRuleSnapshot(sceneParams.scene);

    return {
      requestId,
      text,
      riskLevel: overallRiskLevel,
      isPassed,
      hitDetails,
      suggestions,
      displayReason,
      businessTag: sceneParams.businessTag || '通用内容',
      whitelistHits,
      whitelistHitInfos,
      sceneParams,
      retryCount: 0,
      reviewStatus: isPassed ? ReviewStatus.APPROVED : ReviewStatus.PENDING,
      isMisjudged: false,
      manuallyReviewed: false,
      timestamp: Date.now(),
      costMs: Date.now() - startTime,
      localResult: {
        riskLevel: overallRiskLevel,
        isPassed,
        hitDetails,
        displayReason,
      },
      remoteAuditUsed: false,
      remoteAuditFallback: false,
      ruleVersion: sceneParams.ruleVersion,
      ruleSnapshot,
    };
  }

  private filterWhitelistWithInfo(fragments: HitFragment[], text: string): {
    filteredFragments: HitFragment[];
    whitelistHitInfos: WhitelistHitInfo[];
  } {
    const whitelistHitInfos: WhitelistHitInfo[] = [];
    const whitelistWordMap = new Map<string, { info: import('../types').WhitelistWord; releasedTexts: Set<string> }>();

    const releasedRanges: Array<{ start: number; end: number; source: string; reason?: string }> = [];

    const allWhitelistWords = this.ruleConfigManager.getWhitelistWords();
    for (const wlWord of allWhitelistWords) {
      const lowerText = text.toLowerCase();
      const lowerWord = wlWord.word.toLowerCase();
      let searchIndex = 0;
      while (searchIndex < lowerText.length) {
        const foundIndex = lowerText.indexOf(lowerWord, searchIndex);
        if (foundIndex === -1) break;

        const key = wlWord.word.toLowerCase();
        if (!whitelistWordMap.has(key)) {
          whitelistWordMap.set(key, { info: wlWord, releasedTexts: new Set() });
        }

        const contextStart = Math.max(0, foundIndex - 30);
        const contextEnd = Math.min(text.length, foundIndex + wlWord.word.length + 30);
        releasedRanges.push({
          start: contextStart,
          end: contextEnd,
          source: wlWord.word,
          reason: wlWord.reason,
        });

        for (const fragment of fragments) {
          if (fragment.start >= contextStart && fragment.end <= contextEnd) {
            whitelistWordMap.get(key)!.releasedTexts.add(fragment.text);
          }
        }

        searchIndex = foundIndex + wlWord.word.length;
      }
    }

    for (const fragment of fragments) {
      const { whitelisted, info } = this.ruleConfigManager.isWhitelistedAnyCategory(fragment.text);
      if (whitelisted && info) {
        const key = info.word.toLowerCase();
        if (!whitelistWordMap.has(key)) {
          whitelistWordMap.set(key, { info, releasedTexts: new Set() });
        }
        const entry = whitelistWordMap.get(key)!;
        entry.releasedTexts.add(fragment.text);

        releasedRanges.push({
          start: fragment.start,
          end: fragment.end,
          source: info.word,
          reason: info.reason,
        });
      }
    }

    for (const [key, entry] of whitelistWordMap) {
      const relatedPatterns = entry.info.relatedPatterns || [];
      for (const pattern of relatedPatterns) {
        for (const fragment of fragments) {
          if (
            fragment.text.toLowerCase().includes(pattern.toLowerCase()) ||
            pattern.toLowerCase().includes(fragment.text.toLowerCase())
          ) {
            entry.releasedTexts.add(fragment.text);
            releasedRanges.push({
              start: fragment.start,
              end: fragment.end,
              source: entry.info.word,
              reason: entry.info.reason,
            });
          }
        }
      }
    }

    const filteredFragments = fragments.filter((fragment) => {
      const isDirectlyWhitelisted = this.ruleConfigManager.isWhitelistedAnyCategory(fragment.text).whitelisted;

      if (isDirectlyWhitelisted) {
        fragment.whitelisted = true;
        const checkResult = this.ruleConfigManager.isWhitelistedAnyCategory(fragment.text);
        if (checkResult.info) {
          fragment.whitelistReason = checkResult.info.reason;
          fragment.whitelistSource = checkResult.info.word;
        }
        return false;
      }

      const isReleased = releasedRanges.some(
        (range) =>
          fragment.start >= range.start &&
          fragment.end <= range.end
      ) || releasedRanges.some(
        (range) =>
          fragment.start < range.end &&
          fragment.end > range.start
      );

      if (isReleased) {
        fragment.whitelisted = true;
        const matchingRange = releasedRanges.find(
          (range) =>
            fragment.start >= range.start && fragment.end <= range.end
        ) || releasedRanges.find(
          (range) => fragment.start < range.end && fragment.end > range.start
        );
        if (matchingRange) {
          fragment.whitelistReason = matchingRange.reason;
          fragment.whitelistSource = matchingRange.source;
        }
        return false;
      }

      return true;
    });

    for (const [, entry] of whitelistWordMap) {
      whitelistHitInfos.push({
        word: entry.info.word,
        category: entry.info.category,
        reason: entry.info.reason,
        releasedFragments: Array.from(entry.releasedTexts),
      });
    }

    return { filteredFragments, whitelistHitInfos };
  }

  private deduplicateFragments(fragments: HitFragment[]): HitFragment[] {
    const seen = new Set<string>();
    return fragments.filter((fragment) => {
      const key = `${fragment.start}-${fragment.end}-${fragment.category}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private groupByCategory(fragments: HitFragment[], intensity: AuditIntensity): HitDetail[] {
    const categoryMap = new Map<RiskCategory, HitFragment[]>();

    fragments.forEach((fragment) => {
      if (!categoryMap.has(fragment.category)) {
        categoryMap.set(fragment.category, []);
      }
      categoryMap.get(fragment.category)!.push(fragment);
    });

    const details: HitDetail[] = [];
    categoryMap.forEach((catFragments, category) => {
      const maxConfidence = Math.max(...catFragments.map((f) => f.confidence));
      const level = this.ruleConfigManager.getRiskLevel(maxConfidence, category, intensity);
      const description = this.getCategoryDescription(category, level, catFragments.length);

      details.push({
        category,
        level,
        fragments: catFragments,
        description,
      });
    });

    details.sort((a, b) => {
      const levelOrder = {
        [RiskLevel.DANGEROUS]: 0,
        [RiskLevel.HIGH]: 1,
        [RiskLevel.MEDIUM]: 2,
        [RiskLevel.LOW]: 3,
        [RiskLevel.SAFE]: 4,
      };
      return levelOrder[a.level] - levelOrder[b.level];
    });

    return details;
  }

  private getCategoryDescription(category: RiskCategory, level: RiskLevel, count: number): string {
    const descriptions: Record<RiskCategory, Record<RiskLevel, string>> = {
      [RiskCategory.AD]: {
        [RiskLevel.DANGEROUS]: `检测到${count}处广告内容，风险极高`,
        [RiskLevel.HIGH]: `检测到${count}处广告内容，风险较高`,
        [RiskLevel.MEDIUM]: `检测到${count}处疑似广告内容`,
        [RiskLevel.LOW]: `检测到少量广告相关内容`,
        [RiskLevel.SAFE]: '未检测到广告内容',
      },
      [RiskCategory.ABUSE]: {
        [RiskLevel.DANGEROUS]: `检测到${count}处辱骂内容，风险极高`,
        [RiskLevel.HIGH]: `检测到${count}处辱骂内容，风险较高`,
        [RiskLevel.MEDIUM]: `检测到${count}处疑似辱骂内容`,
        [RiskLevel.LOW]: `检测到少量辱骂相关内容`,
        [RiskLevel.SAFE]: '未检测到辱骂内容',
      },
      [RiskCategory.PRIVACY]: {
        [RiskLevel.DANGEROUS]: `检测到${count}处隐私信息泄露，风险极高`,
        [RiskLevel.HIGH]: `检测到${count}处隐私信息，风险较高`,
        [RiskLevel.MEDIUM]: `检测到${count}处疑似隐私信息`,
        [RiskLevel.LOW]: `检测到少量隐私相关内容`,
        [RiskLevel.SAFE]: '未检测到隐私信息',
      },
      [RiskCategory.SENSITIVE]: {
        [RiskLevel.DANGEROUS]: `检测到${count}处敏感内容，风险极高`,
        [RiskLevel.HIGH]: `检测到${count}处敏感内容，风险较高`,
        [RiskLevel.MEDIUM]: `检测到${count}处疑似敏感内容`,
        [RiskLevel.LOW]: `检测到少量敏感相关内容`,
        [RiskLevel.SAFE]: '未检测到敏感内容',
      },
      [RiskCategory.NORMAL]: {
        [RiskLevel.DANGEROUS]: '',
        [RiskLevel.HIGH]: '',
        [RiskLevel.MEDIUM]: '',
        [RiskLevel.LOW]: '',
        [RiskLevel.SAFE]: '内容正常',
      },
    };
    return descriptions[category][level];
  }

  private calculateOverallRiskLevel(hitDetails: HitDetail[]): RiskLevel {
    if (hitDetails.length === 0) return RiskLevel.SAFE;

    const levelPriority = {
      [RiskLevel.DANGEROUS]: 4,
      [RiskLevel.HIGH]: 3,
      [RiskLevel.MEDIUM]: 2,
      [RiskLevel.LOW]: 1,
      [RiskLevel.SAFE]: 0,
    };

    let maxLevel = RiskLevel.SAFE;
    let maxPriority = 0;

    hitDetails.forEach((detail) => {
      if (levelPriority[detail.level] > maxPriority) {
        maxPriority = levelPriority[detail.level];
        maxLevel = detail.level;
      }
    });

    return maxLevel;
  }

  private generateSuggestions(hitDetails: HitDetail[], isPassed: boolean): string[] {
    const suggestions: string[] = [];

    if (isPassed) {
      suggestions.push('内容审核通过，可正常发布');
      return suggestions;
    }

    hitDetails.forEach((detail) => {
      switch (detail.category) {
        case RiskCategory.AD:
          suggestions.push('请移除广告相关内容，包括联系方式、链接、推广信息等');
          break;
        case RiskCategory.ABUSE:
          suggestions.push('请使用文明用语，避免辱骂、攻击性语言');
          break;
        case RiskCategory.PRIVACY:
          suggestions.push('请保护个人隐私，不要泄露身份证号、手机号、地址等敏感信息');
          break;
        case RiskCategory.SENSITIVE:
          suggestions.push('请遵守相关规定，不要发布敏感内容');
          break;
      }
    });

    suggestions.push('如对审核结果有异议，可申请人工复核');
    return suggestions;
  }

  private generateDisplayReason(
    hitDetails: HitDetail[],
    isPassed: boolean,
    level: RiskLevel,
    whitelistHitInfos: WhitelistHitInfo[]
  ): string {
    if (isPassed && hitDetails.length === 0) {
      return '内容合规，审核通过';
    }

    if (isPassed && whitelistHitInfos.length > 0) {
      const whitelistDesc = whitelistHitInfos.map((info) => {
        const released = info.releasedFragments.length > 0
          ? `（已豁免: ${info.releasedFragments.join('、')}）`
          : '';
        return `${info.word}${released}`;
      }).join('、');
      return `内容合规，审核通过。白名单放行: ${whitelistDesc}`;
    }

    if (hitDetails.length === 0) {
      return '内容正常';
    }

    const categoryNames: Record<RiskCategory, string> = {
      [RiskCategory.AD]: '广告推广',
      [RiskCategory.ABUSE]: '辱骂攻击',
      [RiskCategory.PRIVACY]: '隐私泄露',
      [RiskCategory.SENSITIVE]: '敏感内容',
      [RiskCategory.NORMAL]: '正常内容',
    };

    const topCategories = hitDetails.slice(0, 2).map((d) => categoryNames[d.category]);
    let reason = `检测到${topCategories.join('、')}等违规内容`;

    if (whitelistHitInfos.length > 0) {
      const whitelistDesc = whitelistHitInfos.map((info) => info.word).join('、');
      reason += `；白名单已放行: ${whitelistDesc}`;
    }

    return reason;
  }

  private shouldTriggerRemoteAudit(localRiskLevel: RiskLevel): boolean {
    if (!this.remoteAuditConfig) return false;

    const triggerLevel = this.remoteAuditConfig.triggerLevel || RiskLevel.MEDIUM;
    const levelPriority = {
      [RiskLevel.SAFE]: 0,
      [RiskLevel.LOW]: 1,
      [RiskLevel.MEDIUM]: 2,
      [RiskLevel.HIGH]: 3,
      [RiskLevel.DANGEROUS]: 4,
    };

    return levelPriority[localRiskLevel] >= levelPriority[triggerLevel];
  }

  private async auditWithTimeout(
    request: TextAuditRequest,
    timeoutMs: number
  ): Promise<RemoteAuditResult> {
    return Promise.race([
      this.remoteAuditConfig!.channel.audit(request),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Remote audit timeout')), timeoutMs)
      ),
    ]);
  }

  private mergeResults(
    localResult: TextAuditResult,
    remoteResult: RemoteAuditResult,
    requestId: string,
    text: string,
    sceneParams: SceneParams,
    startTime: number,
    remoteAuditUsed: boolean,
    remoteAuditFallback: boolean
  ): TextAuditResult {
    const levelPriority = {
      [RiskLevel.SAFE]: 0,
      [RiskLevel.LOW]: 1,
      [RiskLevel.MEDIUM]: 2,
      [RiskLevel.HIGH]: 3,
      [RiskLevel.DANGEROUS]: 4,
    };

    const mergedRiskLevel = levelPriority[remoteResult.riskLevel] >= levelPriority[localResult.riskLevel]
      ? remoteResult.riskLevel
      : localResult.riskLevel;

    const isPassed = !this.ruleConfigManager.shouldBlock(mergedRiskLevel, sceneParams.intensity);

    const localCategorySet = new Set(localResult.hitDetails.map((d) => d.category));
    const mergedHitDetails = [...localResult.hitDetails];
    remoteResult.hitDetails.forEach((detail) => {
      if (!localCategorySet.has(detail.category)) {
        mergedHitDetails.push(detail);
      }
    });

    const mergedSuggestions = [...new Set([...localResult.suggestions, ...remoteResult.suggestions])];
    const displayReason = isPassed
      ? '内容合规，审核通过'
      : remoteResult.displayReason || localResult.displayReason;

    return {
      requestId,
      text,
      riskLevel: mergedRiskLevel,
      isPassed,
      hitDetails: mergedHitDetails,
      suggestions: mergedSuggestions,
      displayReason,
      businessTag: sceneParams.businessTag || '通用内容',
      whitelistHits: localResult.whitelistHits,
      whitelistHitInfos: localResult.whitelistHitInfos,
      sceneParams,
      retryCount: 0,
      reviewStatus: isPassed ? ReviewStatus.APPROVED : ReviewStatus.PENDING,
      isMisjudged: false,
      manuallyReviewed: false,
      timestamp: Date.now(),
      costMs: Date.now() - startTime,
      localResult: {
        riskLevel: localResult.riskLevel,
        isPassed: localResult.isPassed,
        hitDetails: localResult.hitDetails,
        displayReason: localResult.displayReason,
      },
      remoteResult,
      remoteAuditUsed,
      remoteAuditFallback,
      ruleVersion: sceneParams.ruleVersion,
      ruleSnapshot: localResult.ruleSnapshot,
    };
  }

  private generateRequestId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public addDetector(detector: Detector): void {
    this.detectors.set(detector.category, detector);
  }

  public removeDetector(category: RiskCategory): void {
    this.detectors.delete(category);
  }
}
