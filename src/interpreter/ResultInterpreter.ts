import {
  TextAuditResult,
  HitDetail,
  RiskLevel,
  RiskCategory,
  HitFragment,
} from '../types';

export class ResultInterpreter {
  public explain(result: TextAuditResult): string {
    const lines: string[] = [];

    lines.push(`【审核结果】${result.isPassed ? '通过' : '不通过'}`);
    lines.push(`【风险等级】${this.getLevelText(result.riskLevel)}`);
    lines.push(`【业务标签】${result.businessTag}`);
    lines.push(`【场景】${result.sceneParams.scene}`);
    lines.push(`【审核强度】${this.getIntensityText(result.sceneParams.intensity)}`);
    lines.push('');

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

    if (result.whitelistHits.length > 0) {
      lines.push('【白名单豁免】');
      result.whitelistHits.forEach((word) => {
        lines.push(`  - ${word}`);
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

  public shouldManualReview(result: TextAuditResult): boolean {
    return result.riskLevel === RiskLevel.HIGH ||
           result.riskLevel === RiskLevel.MEDIUM ||
           (result.hitDetails.length > 0 && result.hitDetails.some(
             (d) => d.level === RiskLevel.MEDIUM
           ));
  }
}
