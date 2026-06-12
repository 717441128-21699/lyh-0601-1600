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
} from '../types';
import { RuleConfigManager } from '../config/RuleConfigManager';

export class AuditEngine {
  private detectors: Map<RiskCategory, Detector> = new Map();
  private ruleConfigManager: RuleConfigManager;

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

  public async audit(request: TextAuditRequest): Promise<TextAuditResult> {
    const startTime = Date.now();
    const requestId = request.requestId || this.generateRequestId();
    const sceneParams = this.ruleConfigManager.getSceneParams(request.scene, request.businessTag);

    let allFragments: HitFragment[] = [];

    this.detectors.forEach((detector) => {
      const fragments = detector.detect(request.text);
      allFragments = allFragments.concat(fragments);
    });

    const filteredFragments = this.filterWhitelist(allFragments);
    const deduplicatedFragments = this.deduplicateFragments(filteredFragments);
    const hitDetails = this.groupByCategory(deduplicatedFragments, sceneParams.intensity);
    const overallRiskLevel = this.calculateOverallRiskLevel(hitDetails);
    const isPassed = !this.ruleConfigManager.shouldBlock(overallRiskLevel, sceneParams.intensity);
    const suggestions = this.generateSuggestions(hitDetails, isPassed);
    const displayReason = this.generateDisplayReason(hitDetails, isPassed, overallRiskLevel);
    const whitelistHits = this.getWhitelistHits(allFragments, filteredFragments);

    const result: TextAuditResult = {
      requestId,
      text: request.text,
      riskLevel: overallRiskLevel,
      isPassed,
      hitDetails,
      suggestions,
      displayReason,
      businessTag: sceneParams.businessTag || '通用内容',
      whitelistHits,
      sceneParams,
      retryCount: 0,
      reviewStatus: isPassed ? ReviewStatus.APPROVED : ReviewStatus.PENDING,
      isMisjudged: false,
      timestamp: Date.now(),
      costMs: Date.now() - startTime,
    };

    return result;
  }

  private filterWhitelist(fragments: HitFragment[]): HitFragment[] {
    return fragments.filter((fragment) => {
      return !this.ruleConfigManager.isWhitelisted(fragment.text, fragment.category);
    });
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

  private generateDisplayReason(hitDetails: HitDetail[], isPassed: boolean, level: RiskLevel): string {
    if (isPassed) {
      return '内容合规，审核通过';
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
    return `检测到${topCategories.join('、')}等违规内容`;
  }

  private getWhitelistHits(allFragments: HitFragment[], filteredFragments: HitFragment[]): string[] {
    const filteredTexts = new Set(filteredFragments.map((f) => f.text.toLowerCase()));
    const whitelistHits: string[] = [];

    allFragments.forEach((fragment) => {
      const lowerText = fragment.text.toLowerCase();
      if (!filteredTexts.has(lowerText) && !whitelistHits.includes(lowerText)) {
        whitelistHits.push(fragment.text);
      }
    });

    return whitelistHits;
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
