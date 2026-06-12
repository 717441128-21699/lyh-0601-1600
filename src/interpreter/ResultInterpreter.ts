import {
  TextAuditResult,
  HitDetail,
  RiskLevel,
  RiskCategory,
  HitFragment,
  WhitelistHitInfo,
  AuditChainResult,
  FeedbackStatus,
  FeedbackReasonCategory,
} from '../types';

export class ResultInterpreter {
  public explain(result: TextAuditResult): string {
    const lines: string[] = [];

    lines.push(`【审核结果】${result.isPassed ? '通过' : '不通过'}`);
    lines.push(`【风险等级】${this.getLevelText(result.riskLevel)}`);
    lines.push(`【业务标签】${result.businessTag}`);
    lines.push(`【场景】${result.sceneParams.scene}`);
    lines.push(`【审核强度】${this.getIntensityText(result.sceneParams.intensity)}`);
    if (result.ruleVersion) {
      lines.push(`【规则版本】${result.ruleVersion}`);
    }
    lines.push('');

    if (result.remoteAuditUsed) {
      lines.push(`【远程审核】已启用 (通道: ${result.remoteResult ? '成功' : '失败/超时'})`);
      if (result.remoteAuditFallback) {
        lines.push('  远程审核失败，已回退至本地结果兜底');
      }
      if (result.localResult) {
        lines.push(`  本地结论: ${this.getLevelText(result.localResult.riskLevel)} - ${result.localResult.isPassed ? '通过' : '不通过'}`);
      }
      if (result.remoteResult) {
        lines.push(`  远程结论: ${this.getLevelText(result.remoteResult.riskLevel)} - ${result.remoteResult.isPassed ? '通过' : '不通过'}`);
      }
      lines.push(`  最终结论: ${this.getLevelText(result.riskLevel)} - ${result.isPassed ? '通过' : '不通过'}`);
      lines.push('');
    }

    if (result.hitDetails.length > 0) {
      lines.push('【命中详情】');
      result.hitDetails.forEach((detail, index) => {
        lines.push(`  ${index + 1}. ${detail.description}`);
        lines.push(`     分类: ${this.getCategoryText(detail.category)}`);
        lines.push(`     风险等级: ${this.getLevelText(detail.level)}`);
        lines.push(`     命中片段数: ${detail.fragments.length}`);
      });
      lines.push('');
    }

    if (result.whitelistHitInfos.length > 0) {
      lines.push('【白名单豁免】');
      result.whitelistHitInfos.forEach((info) => {
        const reasonStr = info.reason ? ` - 原因: ${info.reason}` : '';
        const releasedStr = info.releasedFragments.length > 0
          ? ` (释放片段: ${info.releasedFragments.join('、')})`
          : '';
        lines.push(`  - ${info.word}${reasonStr}${releasedStr}`);
      });
      lines.push('');
    }

    if (result.suggestions.length > 0) {
      lines.push('【处理建议】');
      result.suggestions.forEach((suggestion, index) => {
        lines.push(`  ${index + 1}. ${suggestion}`);
      });
      lines.push('');
    }

    lines.push(`【可展示原因】${result.displayReason}`);
    lines.push('');
    lines.push(`【调用编号】${result.requestId}`);
    lines.push(`【耗时】${result.costMs}ms`);

    return lines.join('\n');
  }

  public explainAuditChain(chain: AuditChainResult): string {
    const lines: string[] = [];

    lines.push('========== 审核链路查询 ==========');
    lines.push('');

    lines.push('--- 原始审核结果 ---');
    lines.push(`调用编号: ${chain.originalResult.requestId}`);
    lines.push(`文本: ${chain.originalResult.text.substring(0, 50)}...`);
    lines.push(`风险等级: ${this.getLevelText(chain.originalResult.riskLevel)}`);
    lines.push(`是否通过: ${chain.originalResult.isPassed ? '通过' : '不通过'}`);
    lines.push(`可展示原因: ${chain.originalResult.displayReason}`);
    lines.push(`规则版本: ${chain.originalResult.ruleVersion || '未知'}`);
    if (chain.originalResult.ruleSnapshot) {
      lines.push(`规则快照时间: ${new Date(chain.originalResult.ruleSnapshot.capturedAt).toLocaleString()}`);
    }
    lines.push('');

    if (chain.reviewRecord) {
      lines.push('--- 复核记录 ---');
      lines.push(`复核状态: ${this.getReviewStatusText(chain.reviewRecord.reviewResult.status)}`);
      lines.push(`复核人: ${chain.reviewRecord.reviewer}`);
      lines.push(`复核时间: ${new Date(chain.reviewRecord.reviewedAt).toLocaleString()}`);
      if (chain.reviewRecord.comment) {
        lines.push(`复核意见: ${chain.reviewRecord.comment}`);
      }
      if (chain.reviewRecord.reviewResult.isMisjudged) {
        lines.push('标记为误判: 是');
      }
      lines.push('');
    } else {
      lines.push('--- 复核记录: 无 ---');
      lines.push('');
    }

    if (chain.feedbacks.length > 0) {
      lines.push('--- 误判反馈 ---');
      chain.feedbacks.forEach((fb, index) => {
        lines.push(`  反馈 ${index + 1}:`);
        lines.push(`    反馈ID: ${fb.id}`);
        lines.push(`    原因分类: ${this.getFeedbackReasonCategoryText(fb.reasonCategory)}`);
        lines.push(`    反馈内容: ${fb.feedback}`);
        lines.push(`    处理状态: ${this.getFeedbackStatusText(fb.status)}`);
        if (fb.handler) {
          lines.push(`    处理人: ${fb.handler}`);
        }
        if (fb.handledAt) {
          lines.push(`    处理时间: ${new Date(fb.handledAt).toLocaleString()}`);
        }
        if (fb.handleComment) {
          lines.push(`    处理备注: ${fb.handleComment}`);
        }
      });
    } else {
      lines.push('--- 误判反馈: 无 ---');
    }

    return lines.join('\n');
  }

  public getRiskSummary(result: TextAuditResult): {
    level: RiskLevel;
    categories: RiskCategory[];
    isPassed: boolean;
    hitCount: number;
  } {
    return {
      level: result.riskLevel,
      categories: result.hitDetails.map((d) => d.category),
      isPassed: result.isPassed,
      hitCount: result.hitDetails.reduce((sum, d) => sum + d.fragments.length, 0),
    };
  }

  public getHitFragmentsByCategory(result: TextAuditResult, category: RiskCategory): HitFragment[] {
    const detail = result.hitDetails.find((d) => d.category === category);
    return detail ? detail.fragments : [];
  }

  public getDisplayText(result: TextAuditResult, maskChar = '*'): string {
    let text = result.text;

    const allFragments = result.hitDetails.flatMap((d) => d.fragments);
    const sortedFragments = [...allFragments].sort((a, b) => b.start - a.start);

    sortedFragments.forEach((fragment) => {
      const replacement = maskChar.repeat(fragment.text.length);
      text = text.substring(0, fragment.start) + replacement + text.substring(fragment.end);
    });

    return text;
  }

  public getLevelText(level: RiskLevel): string {
    const levelTexts: Record<RiskLevel, string> = {
      [RiskLevel.SAFE]: '安全',
      [RiskLevel.LOW]: '低风险',
      [RiskLevel.MEDIUM]: '中风险',
      [RiskLevel.HIGH]: '高风险',
      [RiskLevel.DANGEROUS]: '危险',
    };
    return levelTexts[level];
  }

  public getCategoryText(category: RiskCategory): string {
    const categoryTexts: Record<RiskCategory, string> = {
      [RiskCategory.AD]: '广告推广',
      [RiskCategory.ABUSE]: '辱骂攻击',
      [RiskCategory.PRIVACY]: '隐私泄露',
      [RiskCategory.SENSITIVE]: '敏感内容',
      [RiskCategory.NORMAL]: '正常内容',
    };
    return categoryTexts[category];
  }

  public getIntensityText(intensity: string): string {
    const intensityTexts: Record<string, string> = {
      loose: '宽松',
      standard: '标准',
      strict: '严格',
      very_strict: '非常严格',
    };
    return intensityTexts[intensity] || intensity;
  }

  public getReviewStatusText(status: string): string {
    const statusTexts: Record<string, string> = {
      pending: '待复核',
      approved: '已通过',
      rejected: '已驳回',
      misjudged: '误判',
    };
    return statusTexts[status] || status;
  }

  public getFeedbackStatusText(status: FeedbackStatus): string {
    const statusTexts: Record<FeedbackStatus, string> = {
      [FeedbackStatus.SUBMITTED]: '已提交',
      [FeedbackStatus.PROCESSING]: '处理中',
      [FeedbackStatus.RESOLVED]: '已解决',
      [FeedbackStatus.DISMISSED]: '已驳回',
    };
    return statusTexts[status];
  }

  public getFeedbackReasonCategoryText(category: FeedbackReasonCategory): string {
    const categoryTexts: Record<FeedbackReasonCategory, string> = {
      [FeedbackReasonCategory.FALSE_POSITIVE]: '误报',
      [FeedbackReasonCategory.CONTEXT_IGNORED]: '忽略上下文',
      [FeedbackReasonCategory.RULE_TOO_STRICT]: '规则过严',
      [FeedbackReasonCategory.WHITELIST_MISSING]: '白名单缺失',
      [FeedbackReasonCategory.OTHER]: '其他',
    };
    return categoryTexts[category];
  }

  public shouldManualReview(result: TextAuditResult): boolean {
    return result.riskLevel === RiskLevel.HIGH ||
           result.riskLevel === RiskLevel.MEDIUM ||
           (result.hitDetails.length > 0 && result.hitDetails.some(
             (d) => d.level === RiskLevel.MEDIUM
           ));
  }
}
