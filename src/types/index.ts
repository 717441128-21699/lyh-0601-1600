export enum RiskLevel {
  SAFE = 'safe',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  DANGEROUS = 'dangerous',
}

export enum RiskCategory {
  AD = 'ad',
  ABUSE = 'abuse',
  PRIVACY = 'privacy',
  SENSITIVE = 'sensitive',
  NORMAL = 'normal',
}

export enum ReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  MISJUDGED = 'misjudged',
}

export enum AuditIntensity {
  LOOSE = 'loose',
  STANDARD = 'standard',
  STRICT = 'strict',
  VERY_STRICT = 'very_strict',
}

export enum FeedbackStatus {
  SUBMITTED = 'submitted',
  PROCESSING = 'processing',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum FeedbackReasonCategory {
  FALSE_POSITIVE = 'false_positive',
  CONTEXT_IGNORED = 'context_ignored',
  RULE_TOO_STRICT = 'rule_too_strict',
  WHITELIST_MISSING = 'whitelist_missing',
  OTHER = 'other',
}

export interface HitFragment {
  text: string;
  start: number;
  end: number;
  category: RiskCategory;
  confidence: number;
  ruleId?: string;
  whitelisted?: boolean;
  whitelistReason?: string;
  whitelistSource?: string;
}

export interface WhitelistWord {
  word: string;
  category: RiskCategory;
  reason?: string;
  createdAt: number;
  relatedPatterns?: string[];
}

export interface WhitelistHitInfo {
  word: string;
  category: RiskCategory;
  reason?: string;
  releasedFragments: string[];
}

export interface SceneParams {
  scene: string;
  intensity: AuditIntensity;
  businessTag?: string;
  customRules?: string[];
  ruleVersion?: string;
}

export interface HitDetail {
  category: RiskCategory;
  level: RiskLevel;
  fragments: HitFragment[];
  description: string;
}

export interface ReviewResult {
  status: ReviewStatus;
  reviewer?: string;
  reviewTime?: number;
  comment?: string;
  isMisjudged?: boolean;
}

export interface TextAuditRequest {
  text: string;
  scene?: string;
  businessTag?: string;
  userId?: string;
  requestId?: string;
}

export interface BatchAuditRequest {
  items: TextAuditRequest[];
  scene?: string;
  concurrency?: number;
}

export interface RemoteAuditResult {
  riskLevel: RiskLevel;
  isPassed: boolean;
  hitDetails: HitDetail[];
  suggestions: string[];
  displayReason: string;
  confidence: number;
  costMs: number;
  raw?: unknown;
}

export interface RemoteAuditChannel {
  name: string;
  audit(request: TextAuditRequest): Promise<RemoteAuditResult>;
}

export interface RemoteAuditConfig {
  channel: RemoteAuditChannel;
  triggerLevel?: RiskLevel;
  timeoutMs?: number;
  fallbackToLocal?: boolean;
}

export interface TextAuditResult {
  requestId: string;
  text: string;
  riskLevel: RiskLevel;
  isPassed: boolean;
  hitDetails: HitDetail[];
  suggestions: string[];
  displayReason: string;
  businessTag: string;
  whitelistHits: string[];
  whitelistHitInfos: WhitelistHitInfo[];
  sceneParams: SceneParams;
  retryCount: number;
  reviewStatus: ReviewStatus;
  isMisjudged: boolean;
  manuallyReviewed: boolean;
  timestamp: number;
  costMs: number;
  localResult?: {
    riskLevel: RiskLevel;
    isPassed: boolean;
    hitDetails: HitDetail[];
    displayReason: string;
  };
  remoteResult?: RemoteAuditResult;
  remoteAuditUsed: boolean;
  remoteAuditFallback: boolean;
  ruleVersion?: string;
  ruleSnapshot?: RuleSnapshot;
}

export interface BatchAuditResult {
  batchId: string;
  total: number;
  passed: number;
  failed: number;
  results: TextAuditResult[];
  timestamp: number;
  costMs: number;
}

export interface AuditStatistics {
  totalRequests: number;
  passedCount: number;
  blockedCount: number;
  categoryDistribution: Record<RiskCategory, number>;
  levelDistribution: Record<RiskLevel, number>;
  avgCostMs: number;
  retryRate: number;
  misjudgeRate: number;
  manualReviewRate: number;
  manuallyReviewedCount: number;
  remoteAuditCount: number;
  remoteAuditFallbackCount: number;
  periodStart: number;
  periodEnd: number;
}

export interface RuleConfig {
  enabled: boolean;
  threshold: number;
  level: RiskLevel;
}

export interface RuleVersion {
  version: string;
  description?: string;
  createdAt: number;
  intensity?: AuditIntensity;
  customRules?: Record<string, RuleConfig>;
  whitelistWords?: WhitelistWord[];
}

export interface RuleSnapshot {
  version: string;
  scene: string;
  intensity: AuditIntensity;
  customRules: Record<string, RuleConfig>;
  whitelistWords: WhitelistWord[];
  capturedAt: number;
}

export interface SDKConfig {
  appKey: string;
  appSecret?: string;
  defaultScene?: string;
  defaultIntensity?: AuditIntensity;
  enableRetry?: boolean;
  maxRetryCount?: number;
  retryDelayMs?: number;
  enableWhitelist?: boolean;
  whitelistWords?: WhitelistWord[];
  customRules?: Record<string, RuleConfig>;
  endpoint?: string;
  timeoutMs?: number;
  sceneIntensityMap?: Record<string, AuditIntensity>;
  sceneRuleVersions?: Record<string, string>;
  ruleVersions?: Record<string, RuleVersion>;
  remoteAudit?: RemoteAuditConfig;
}

export interface MisjudgeFeedback {
  id: string;
  requestId: string;
  category: RiskCategory;
  feedback: string;
  reasonCategory: FeedbackReasonCategory;
  status: FeedbackStatus;
  handler?: string;
  handledAt?: number;
  handleComment?: string;
  contact?: string;
  createdAt: number;
}

export interface ManualReviewRecord {
  requestId: string;
  originalResult: TextAuditResult;
  reviewResult: ReviewResult;
  reviewer: string;
  reviewedAt: number;
  comment?: string;
}

export interface AuditChainResult {
  originalResult: TextAuditResult;
  reviewRecord: ManualReviewRecord | null;
  feedbacks: MisjudgeFeedback[];
}
