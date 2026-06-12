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

export interface HitFragment {
  text: string;
  start: number;
  end: number;
  category: RiskCategory;
  confidence: number;
  ruleId?: string;
}

export interface WhitelistWord {
  word: string;
  category: RiskCategory;
  reason?: string;
  createdAt: number;
}

export interface SceneParams {
  scene: string;
  intensity: AuditIntensity;
  businessTag?: string;
  customRules?: string[];
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
  sceneParams: SceneParams;
  retryCount: number;
  reviewStatus: ReviewStatus;
  isMisjudged: boolean;
  timestamp: number;
  costMs: number;
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
  periodStart: number;
  periodEnd: number;
}

export interface RuleConfig {
  enabled: boolean;
  threshold: number;
  level: RiskLevel;
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
}

export interface MisjudgeFeedback {
  requestId: string;
  category: RiskCategory;
  feedback: string;
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
