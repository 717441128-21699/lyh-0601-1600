import {
  SDKConfig,
  AuditIntensity,
  WhitelistWord,
  RiskCategory,
  SceneParams,
  RuleConfig,
  RiskLevel,
  RuleVersion,
  RuleSnapshot,
} from '../types';

export class RuleConfigManager {
  private config: SDKConfig;
  private whitelistMap: Map<string, WhitelistWord> = new Map();
  private sceneIntensityMap: Map<string, AuditIntensity> = new Map();
  private customRules: Map<string, RuleConfig> = new Map();
  private ruleVersions: Map<string, RuleVersion> = new Map();
  private sceneRuleVersions: Map<string, string> = new Map();

  constructor(config: SDKConfig) {
    this.config = { ...this.getDefaultConfig(), ...config };
    this.initializeWhitelist();
    this.initializeSceneIntensity();
    this.initializeCustomRules();
    this.initializeRuleVersions();
    this.initializeSceneRuleVersions();
  }

  private getDefaultConfig(): Partial<SDKConfig> {
    return {
      defaultScene: 'default',
      defaultIntensity: AuditIntensity.STANDARD,
      enableRetry: true,
      maxRetryCount: 3,
      retryDelayMs: 1000,
      enableWhitelist: true,
      timeoutMs: 5000,
    };
  }

  private initializeWhitelist(): void {
    if (this.config.whitelistWords) {
      this.config.whitelistWords.forEach((word) => {
        this.whitelistMap.set(word.word.toLowerCase(), word);
      });
    }
  }

  private initializeSceneIntensity(): void {
    if (this.config.sceneIntensityMap) {
      Object.entries(this.config.sceneIntensityMap).forEach(([scene, intensity]) => {
        this.sceneIntensityMap.set(scene, intensity);
      });
    }
  }

  private initializeCustomRules(): void {
    if (this.config.customRules) {
      Object.entries(this.config.customRules).forEach(([ruleId, config]) => {
        this.customRules.set(ruleId, config);
      });
    }
  }

  private initializeRuleVersions(): void {
    if (this.config.ruleVersions) {
      Object.entries(this.config.ruleVersions).forEach(([version, ruleVersion]) => {
        this.ruleVersions.set(version, ruleVersion);
      });
    }
    if (this.ruleVersions.size === 0) {
      this.ruleVersions.set('v1', {
        version: 'v1',
        description: '默认规则版本',
        createdAt: Date.now(),
      });
    }
  }

  private initializeSceneRuleVersions(): void {
    if (this.config.sceneRuleVersions) {
      Object.entries(this.config.sceneRuleVersions).forEach(([scene, version]) => {
        this.sceneRuleVersions.set(scene, version);
      });
    }
  }

  public getConfig(): SDKConfig {
    return { ...this.config };
  }

  public updateConfig(partialConfig: Partial<SDKConfig>): void {
    this.config = { ...this.config, ...partialConfig };
    if (partialConfig.whitelistWords) {
      this.whitelistMap.clear();
      this.initializeWhitelist();
    }
    if (partialConfig.sceneIntensityMap) {
      this.sceneIntensityMap.clear();
      this.initializeSceneIntensity();
    }
    if (partialConfig.customRules) {
      this.customRules.clear();
      this.initializeCustomRules();
    }
    if (partialConfig.ruleVersions) {
      this.ruleVersions.clear();
      this.initializeRuleVersions();
    }
    if (partialConfig.sceneRuleVersions) {
      this.sceneRuleVersions.clear();
      this.initializeSceneRuleVersions();
    }
  }

  public getSceneParams(scene?: string, businessTag?: string): SceneParams {
    const sceneName = scene || this.config.defaultScene || 'default';
    const intensity = this.sceneIntensityMap.get(sceneName) ||
      this.config.defaultIntensity ||
      AuditIntensity.STANDARD;
    const ruleVersion = this.sceneRuleVersions.get(sceneName) || 'v1';

    return {
      scene: sceneName,
      intensity,
      businessTag: businessTag || this.getBusinessTag(sceneName),
      customRules: this.getSceneCustomRules(sceneName),
      ruleVersion,
    };
  }

  public getRuleVersionForScene(scene: string): string {
    return this.sceneRuleVersions.get(scene) || 'v1';
  }

  public setSceneRuleVersion(scene: string, version: string): void {
    if (this.ruleVersions.has(version)) {
      this.sceneRuleVersions.set(scene, version);
    }
  }

  public addRuleVersion(ruleVersion: RuleVersion): void {
    this.ruleVersions.set(ruleVersion.version, ruleVersion);
  }

  public getRuleVersion(version: string): RuleVersion | undefined {
    return this.ruleVersions.get(version);
  }

  public getAllRuleVersions(): RuleVersion[] {
    return Array.from(this.ruleVersions.values());
  }

  public captureRuleSnapshot(scene: string): RuleSnapshot {
    const sceneParams = this.getSceneParams(scene);
    const ruleVersion = this.ruleVersions.get(sceneParams.ruleVersion || 'v1');
    const versionIntensity = ruleVersion?.intensity;
    const versionCustomRules = ruleVersion?.customRules;
    const versionWhitelistWords = ruleVersion?.whitelistWords;

    return {
      version: sceneParams.ruleVersion || 'v1',
      scene,
      intensity: versionIntensity || sceneParams.intensity,
      customRules: versionCustomRules || this.getAllCustomRules(),
      whitelistWords: versionWhitelistWords || this.getWhitelistWords(),
      capturedAt: Date.now(),
    };
  }

  private getBusinessTag(scene: string): string {
    const tagMap: Record<string, string> = {
      default: '通用内容',
      comment: '用户评论',
      post: '社区发帖',
      chat: '即时通讯',
      article: '文章内容',
      'customer-service': '客服工单',
    };
    return tagMap[scene] || '通用内容';
  }

  private getSceneCustomRules(scene: string): string[] {
    const sceneRuleMap: Record<string, string[]> = {
      default: ['basic_ad', 'basic_abuse', 'basic_privacy', 'basic_sensitive'],
      comment: ['basic_ad', 'basic_abuse', 'basic_privacy', 'basic_sensitive'],
      post: ['adv_ad', 'adv_abuse', 'adv_privacy', 'adv_sensitive', 'url_detect'],
      chat: ['basic_ad', 'basic_abuse', 'basic_privacy', 'basic_sensitive', 'contact_detect'],
      article: ['adv_ad', 'adv_abuse', 'adv_privacy', 'adv_sensitive', 'url_detect'],
      'customer-service': ['basic_ad', 'basic_abuse', 'basic_privacy', 'basic_sensitive'],
    };
    return sceneRuleMap[scene] || sceneRuleMap.default;
  }

  public getIntensityThreshold(intensity: AuditIntensity): { [key in RiskCategory]: number } {
    const thresholds: Record<AuditIntensity, Record<RiskCategory, number>> = {
      [AuditIntensity.LOOSE]: {
        [RiskCategory.AD]: 0.8,
        [RiskCategory.ABUSE]: 0.85,
        [RiskCategory.PRIVACY]: 0.75,
        [RiskCategory.SENSITIVE]: 0.8,
        [RiskCategory.NORMAL]: 0,
      },
      [AuditIntensity.STANDARD]: {
        [RiskCategory.AD]: 0.65,
        [RiskCategory.ABUSE]: 0.7,
        [RiskCategory.PRIVACY]: 0.6,
        [RiskCategory.SENSITIVE]: 0.65,
        [RiskCategory.NORMAL]: 0,
      },
      [AuditIntensity.STRICT]: {
        [RiskCategory.AD]: 0.5,
        [RiskCategory.ABUSE]: 0.55,
        [RiskCategory.PRIVACY]: 0.45,
        [RiskCategory.SENSITIVE]: 0.5,
        [RiskCategory.NORMAL]: 0,
      },
      [AuditIntensity.VERY_STRICT]: {
        [RiskCategory.AD]: 0.35,
        [RiskCategory.ABUSE]: 0.4,
        [RiskCategory.PRIVACY]: 0.3,
        [RiskCategory.SENSITIVE]: 0.35,
        [RiskCategory.NORMAL]: 0,
      },
    };
    return thresholds[intensity];
  }

  public checkWhitelist(word: string): { whitelisted: boolean; info: WhitelistWord | null } {
    if (!this.config.enableWhitelist) {
      return { whitelisted: false, info: null };
    }
    const lowerWord = word.toLowerCase();
    const whitelistWord = this.whitelistMap.get(lowerWord);
    if (!whitelistWord) {
      return { whitelisted: false, info: null };
    }
    return { whitelisted: true, info: whitelistWord };
  }

  public isWhitelisted(word: string, category?: RiskCategory): boolean {
    const { whitelisted, info } = this.checkWhitelist(word);
    if (!whitelisted || !info) return false;
    if (category && info.category !== category) return false;
    return true;
  }

  public isWhitelistedAnyCategory(word: string): { whitelisted: boolean; info: WhitelistWord | null } {
    return this.checkWhitelist(word);
  }

  public getWhitelistRelatedPatterns(word: string): string[] {
    const lowerWord = word.toLowerCase();
    const whitelistWord = this.whitelistMap.get(lowerWord);
    return whitelistWord?.relatedPatterns || [];
  }

  public addWhitelistWord(word: WhitelistWord): void {
    this.whitelistMap.set(word.word.toLowerCase(), word);
  }

  public removeWhitelistWord(word: string): void {
    this.whitelistMap.delete(word.toLowerCase());
  }

  public getWhitelistWords(): WhitelistWord[] {
    return Array.from(this.whitelistMap.values());
  }

  public setSceneIntensity(scene: string, intensity: AuditIntensity): void {
    this.sceneIntensityMap.set(scene, intensity);
  }

  public getSceneIntensity(scene: string): AuditIntensity {
    return this.sceneIntensityMap.get(scene) ||
      this.config.defaultIntensity ||
      AuditIntensity.STANDARD;
  }

  public addCustomRule(ruleId: string, config: RuleConfig): void {
    this.customRules.set(ruleId, config);
  }

  public removeCustomRule(ruleId: string): void {
    this.customRules.delete(ruleId);
  }

  public getCustomRule(ruleId: string): RuleConfig | undefined {
    return this.customRules.get(ruleId);
  }

  public getAllCustomRules(): Record<string, RuleConfig> {
    const rules: Record<string, RuleConfig> = {};
    this.customRules.forEach((config, ruleId) => {
      rules[ruleId] = config;
    });
    return rules;
  }

  public getRiskLevel(confidence: number, category: RiskCategory, intensity: AuditIntensity): RiskLevel {
    const threshold = this.getIntensityThreshold(intensity)[category];

    if (confidence >= threshold && confidence >= 0.9) return RiskLevel.DANGEROUS;
    if (confidence >= threshold && confidence >= 0.75) return RiskLevel.HIGH;
    if (confidence >= threshold && confidence >= 0.55) return RiskLevel.MEDIUM;
    if (confidence >= threshold) return RiskLevel.LOW;
    return RiskLevel.SAFE;
  }

  public shouldBlock(level: RiskLevel, intensity: AuditIntensity): boolean {
    const blockLevels: Record<AuditIntensity, RiskLevel[]> = {
      [AuditIntensity.LOOSE]: [RiskLevel.DANGEROUS, RiskLevel.HIGH],
      [AuditIntensity.STANDARD]: [RiskLevel.DANGEROUS, RiskLevel.HIGH, RiskLevel.MEDIUM],
      [AuditIntensity.STRICT]: [RiskLevel.DANGEROUS, RiskLevel.HIGH, RiskLevel.MEDIUM, RiskLevel.LOW],
      [AuditIntensity.VERY_STRICT]: [RiskLevel.DANGEROUS, RiskLevel.HIGH, RiskLevel.MEDIUM, RiskLevel.LOW],
    };
    return blockLevels[intensity].includes(level);
  }
}
