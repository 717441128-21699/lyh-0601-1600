import {
  ContentAuditSDK,
  RiskLevel,
  RiskCategory,
  AuditIntensity,
  ReviewStatus,
  WhitelistWord,
  FeedbackReasonCategory,
  FeedbackStatus,
  RemoteAuditChannel,
  RemoteAuditResult,
  TextAuditRequest,
} from '../src/index';

const mockRemoteChannel: RemoteAuditChannel = {
  name: 'mock-remote-ai',
  async audit(request: TextAuditRequest): Promise<RemoteAuditResult> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      riskLevel: RiskLevel.HIGH,
      isPassed: false,
      hitDetails: [{
        category: RiskCategory.AD,
        level: RiskLevel.HIGH,
        fragments: [],
        description: '远程AI检测到广告推广内容',
      }],
      suggestions: ['远程审核建议: 请移除广告内容'],
      displayReason: '远程AI审核: 检测到广告推广内容',
      confidence: 0.85,
      costMs: 50,
    };
  },
};

async function main() {
  console.log('=== AI 内容审核 SDK 增强版使用示例 ===\n');

  const sdk = new ContentAuditSDK({
    appKey: 'test-app-key-123',
    defaultScene: 'comment',
    defaultIntensity: AuditIntensity.STANDARD,
    enableRetry: true,
    maxRetryCount: 3,
    enableWhitelist: true,
    whitelistWords: [
      {
        word: '客服电话',
        category: RiskCategory.AD,
        reason: '客服场景允许留联系方式',
        createdAt: Date.now(),
        relatedPatterns: ['138', '139', '158'],
      },
    ],
    sceneIntensityMap: {
      post: AuditIntensity.STRICT,
      chat: AuditIntensity.LOOSE,
      'customer-service': AuditIntensity.STANDARD,
    },
    sceneRuleVersions: {
      comment: 'v1',
      'customer-service': 'v1',
    },
    ruleVersions: {
      v1: {
        version: 'v1',
        description: '初始规则版本',
        createdAt: Date.now(),
      },
      v2: {
        version: 'v2',
        description: '增强敏感词检测',
        createdAt: Date.now(),
        intensity: AuditIntensity.STRICT,
      },
    },
  });

  console.log('--- 1. 白名单跨分类释放 ---');
  const result1 = await sdk.auditText({
    text: '请拨打客服电话 13812345678 咨询',
    scene: 'customer-service',
  });
  console.log('是否通过:', result1.isPassed);
  console.log('白名单命中详情:');
  result1.whitelistHitInfos.forEach((info) => {
    console.log(`  词: ${info.word}`);
    console.log(`  原因: ${info.reason}`);
    console.log(`  释放片段: ${info.releasedFragments.join(', ')}`);
  });
  console.log('可展示原因:', result1.displayReason);
  console.log('');

  console.log('--- 2. 规则版本和灰度 ---');
  const sceneParams = sdk.getSceneParams('comment');
  console.log('评论场景规则版本:', sceneParams.ruleVersion);
  console.log('客服场景规则版本:', sdk.getRuleVersionForScene('customer-service'));

  sdk.addRuleVersion({
    version: 'v2-cs',
    description: '客服场景专用规则 - 宽松版',
    createdAt: Date.now(),
    intensity: AuditIntensity.LOOSE,
  });
  sdk.setSceneRuleVersion('customer-service', 'v2-cs');
  console.log('灰度切换后客服场景版本:', sdk.getRuleVersionForScene('customer-service'));

  const snapshot = sdk.captureRuleSnapshot('customer-service');
  console.log('规则快照版本:', snapshot.version);
  console.log('快照强度:', sdk.getIntensityText(snapshot.intensity));
  console.log('快照白名单数:', snapshot.whitelistWords.length);
  console.log('');

  const result2 = await sdk.auditText({
    text: '客服电话 13812345678，加微信咨询',
    scene: 'customer-service',
  });
  console.log('灰度后审核结果 - 规则版本:', result2.ruleVersion);
  console.log('灰度后是否通过:', result2.isPassed);
  console.log('');

  console.log('--- 3. 远程审核通道 ---');
  sdk.setRemoteAuditChannel({
    channel: mockRemoteChannel,
    triggerLevel: RiskLevel.MEDIUM,
    timeoutMs: 3000,
    fallbackToLocal: true,
  });
  console.log('已启用远程审核通道 (触发级别: 中风险及以上)');

  const result3 = await sdk.auditText({
    text: '加微信: abc123 免费领取优惠！',
    scene: 'comment',
  });
  console.log('远程审核启用:', result3.remoteAuditUsed);
  console.log('远程审核兜底:', result3.remoteAuditFallback);
  if (result3.localResult) {
    console.log('本地结论:', sdk.getLevelText(result3.localResult.riskLevel), result3.localResult.isPassed ? '通过' : '不通过');
  }
  if (result3.remoteResult) {
    console.log('远程结论:', sdk.getLevelText(result3.remoteResult.riskLevel), result3.remoteResult.isPassed ? '通过' : '不通过');
  }
  console.log('最终结论:', sdk.getLevelText(result3.riskLevel), result3.isPassed ? '通过' : '不通过');
  console.log('');

  const safeResult = await sdk.auditText({
    text: '今天天气真好，适合出去散步。',
    scene: 'comment',
  });
  console.log('安全内容远程审核启用:', safeResult.remoteAuditUsed, '(安全内容不触发远程)');
  console.log('');

  sdk.disableRemoteAudit();

  console.log('--- 4. 批量审核统计准确性 ---');
  const batchResult = await sdk.batchAudit({
    items: [
      { text: '正常内容1' },
      { text: '正常内容2' },
      { text: '你好世界' },
    ],
    scene: 'comment',
  });
  console.log('批量提交:', batchResult.total, '条');
  console.log('批量通过:', batchResult.passed, '条');
  console.log('批量未通过:', batchResult.failed, '条');

  await sdk.auditText({ text: '单条测试1', scene: 'comment' });
  await sdk.auditText({ text: '单条测试2', scene: 'comment' });

  const stats = sdk.getStatistics();
  console.log('');
  console.log('--- 5. 统计摘要 ---');
  console.log('总请求数:', stats.totalRequests);
  console.log('通过数:', stats.passedCount);
  console.log('拦截数:', stats.blockedCount);
  console.log('人工复核数:', stats.manuallyReviewedCount);
  console.log('人工复核率:', (stats.manualReviewRate * 100).toFixed(2) + '%');
  console.log('远程审核数:', stats.remoteAuditCount);
  console.log('远程兜底数:', stats.remoteAuditFallbackCount);
  console.log('通过率:', stats.totalRequests > 0 ? ((stats.passedCount / stats.totalRequests) * 100).toFixed(2) + '%' : 'N/A');
  console.log('');

  console.log('--- 6. 人工复核 + 统计联动 ---');
  const reviewStatsBefore = sdk.getReviewStats();
  console.log('复核前 - 人工复核数:', reviewStatsBefore.manuallyReviewed);

  sdk.approve(result3.requestId, 'reviewer_001', '人工确认通过');

  const reviewStatsAfter = sdk.getReviewStats();
  console.log('复核后 - 人工复核数:', reviewStatsAfter.manuallyReviewed);

  const statsAfterReview = sdk.getStatistics();
  console.log('统计中人工复核数:', statsAfterReview.manuallyReviewedCount);
  console.log('统计中人工复核率:', (statsAfterReview.manualReviewRate * 100).toFixed(2) + '%');
  console.log('');

  console.log('--- 7. 误判反馈（增强版） ---');
  const feedback = sdk.submitMisjudgeFeedback({
    requestId: result3.requestId,
    category: RiskCategory.AD,
    feedback: '这是正常的客服联系方式，不是广告',
    reasonCategory: FeedbackReasonCategory.WHITELIST_MISSING,
    contact: 'user@example.com',
  });
  console.log('反馈ID:', feedback.id);
  console.log('原因分类:', feedback.reasonCategory);
  console.log('处理状态:', feedback.status);

  sdk.processFeedback(
    feedback.id,
    'admin_001',
    FeedbackStatus.PROCESSING,
    '正在核实反馈内容'
  );
  const updatedFb = sdk.getMisjudgeFeedbacks(result3.requestId)[0];
  console.log('处理后状态:', updatedFb.status);
  console.log('处理人:', updatedFb.handler);
  console.log('处理备注:', updatedFb.handleComment);

  sdk.processFeedback(
    feedback.id,
    'admin_001',
    FeedbackStatus.RESOLVED,
    '已确认为误判，将添加白名单'
  );
  const resolvedFb = sdk.getMisjudgeFeedbacks(result3.requestId)[0];
  console.log('最终状态:', resolvedFb.status);
  console.log('');

  console.log('--- 8. 调用编号查询完整链路 ---');
  const chain = sdk.queryAuditChain(result3.requestId);
  if (chain) {
    console.log('原始审核 - 风险等级:', sdk.getLevelText(chain.originalResult.riskLevel));
    console.log('原始审核 - 是否通过:', chain.originalResult.isPassed);
    console.log('原始审核 - 规则版本:', chain.originalResult.ruleVersion);
    console.log('复核记录:', chain.reviewRecord ? '有' : '无');
    if (chain.reviewRecord) {
      console.log('  复核状态:', chain.reviewRecord.reviewResult.status);
      console.log('  复核人:', chain.reviewRecord.reviewer);
      console.log('  是否误判:', chain.reviewRecord.reviewResult.isMisjudged);
    }
    console.log('误判反馈数:', chain.feedbacks.length);
    chain.feedbacks.forEach((fb, i) => {
      console.log(`  反馈${i + 1}: ${fb.reasonCategory} - ${fb.status}`);
    });
  }
  console.log('');

  console.log('--- 9. 完整链路解释 ---');
  const chainExplanation = sdk.explainAuditChain(result3.requestId);
  if (chainExplanation) {
    console.log(chainExplanation);
  }
  console.log('');

  console.log('--- 10. 结果解释（含白名单放行来源） ---');
  const explanation = sdk.explainResult(result1);
  console.log(explanation);
  console.log('');

  console.log('=== 示例执行完成 ===');
}

main().catch(console.error);
