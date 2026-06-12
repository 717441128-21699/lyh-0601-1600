import {
  ContentAuditSDK,
  RiskLevel,
  RiskCategory,
  AuditIntensity,
  ReviewStatus,
  WhitelistWord,
} from '../src/index';

async function main() {
  console.log('=== AI 内容审核 SDK 使用示例 ===\n');

  const sdk = new ContentAuditSDK({
    appKey: 'test-app-key-123',
    defaultScene: 'comment',
    defaultIntensity: AuditIntensity.STANDARD,
    enableRetry: true,
    maxRetryCount: 3,
    enableWhitelist: true,
    sceneIntensityMap: {
      post: AuditIntensity.STRICT,
      chat: AuditIntensity.LOOSE,
      'customer-service': AuditIntensity.STANDARD,
    },
  });

  console.log('--- 1. 基础文本检测 ---');
  const result1 = await sdk.auditText({
    text: '你好，这是一条正常的评论内容。',
    scene: 'comment',
    businessTag: '用户评论',
  });
  console.log('文本:', result1.text);
  console.log('是否通过:', result1.isPassed);
  console.log('风险等级:', sdk.getLevelText(result1.riskLevel));
  console.log('可展示原因:', result1.displayReason);
  console.log('调用编号:', result1.requestId);
  console.log('');

  console.log('--- 2. 广告内容检测 ---');
  const result2 = await sdk.auditText({
    text: '加微信: test123 免费领取优惠，扫码下单打折促销！联系方式: 13812345678',
    scene: 'comment',
  });
  console.log('是否通过:', result2.isPassed);
  console.log('风险等级:', sdk.getLevelText(result2.riskLevel));
  console.log('命中详情:');
  result2.hitDetails.forEach((detail, i) => {
    console.log(`  ${i + 1}. ${sdk.getCategoryText(detail.category)} - ${sdk.getLevelText(detail.level)}`);
    console.log(`     命中片段: ${detail.fragments.map(f => f.text).join(', ')}`);
  });
  console.log('处理建议:', result2.suggestions);
  console.log('');

  console.log('--- 3. 辱骂内容检测 ---');
  const result3 = await sdk.auditText({
    text: '你这个蠢货，闭嘴吧，真恶心！',
    scene: 'comment',
  });
  console.log('是否通过:', result3.isPassed);
  console.log('风险等级:', sdk.getLevelText(result3.riskLevel));
  console.log('展示原因:', result3.displayReason);
  console.log('脱敏后文本:', sdk.getDisplayText(result3));
  console.log('');

  console.log('--- 4. 隐私信息检测 ---');
  const result4 = await sdk.auditText({
    text: '我的身份证号是110101199001011234，手机号13912345678，邮箱test@example.com',
    scene: 'chat',
  });
  console.log('是否通过:', result4.isPassed);
  console.log('风险等级:', sdk.getLevelText(result4.riskLevel));
  result4.hitDetails.forEach((detail) => {
    console.log(`  ${sdk.getCategoryText(detail.category)}: ${detail.fragments.length}处`);
  });
  console.log('');

  console.log('--- 5. 敏感内容检测 ---');
  const result5 = await sdk.auditText({
    text: '禁止传播毒品和赌博相关内容',
    scene: 'post',
  });
  console.log('是否通过:', result5.isPassed);
  console.log('风险等级:', sdk.getLevelText(result5.riskLevel));
  console.log('');

  console.log('--- 6. 结果解释 ---');
  const explanation = sdk.explainResult(result2);
  console.log(explanation);
  console.log('');

  console.log('--- 7. 白名单功能 ---');
  const whitelistWord: WhitelistWord = {
    word: '加微信',
    category: RiskCategory.AD,
    reason: '客服场景允许留联系方式',
    createdAt: Date.now(),
  };
  sdk.addWhitelistWord(whitelistWord);
  console.log('添加白名单词: 加微信');

  const result6 = await sdk.auditText({
    text: '加微信: test123 咨询客服',
    scene: 'customer-service',
  });
  console.log('白名单命中:', result6.whitelistHits);
  console.log('是否通过:', result6.isPassed);
  console.log('');

  console.log('--- 8. 不同场景审核强度 ---');
  console.log('评论场景强度:', sdk.getIntensityText(sdk.getSceneIntensity('comment')));
  console.log('发帖场景强度:', sdk.getIntensityText(sdk.getSceneIntensity('post')));
  console.log('聊天场景强度:', sdk.getIntensityText(sdk.getSceneIntensity('chat')));

  sdk.setSceneIntensity('custom-scene', AuditIntensity.VERY_STRICT);
  console.log('自定义场景强度:', sdk.getIntensityText(sdk.getSceneIntensity('custom-scene')));
  console.log('');

  console.log('--- 9. 批量检测 ---');
  const batchResult = await sdk.batchAudit({
    items: [
      { text: '正常内容1' },
      { text: '加微信: abc123 推广广告' },
      { text: '你好，请问有什么可以帮您？' },
      { text: '傻逼玩意，滚蛋！' },
      { text: '身份证号110101199001011234' },
    ],
    scene: 'comment',
    concurrency: 3,
  });
  console.log('批次ID:', batchResult.batchId);
  console.log('总数:', batchResult.total);
  console.log('通过:', batchResult.passed);
  console.log('未通过:', batchResult.failed);
  console.log('耗时:', batchResult.costMs + 'ms');
  batchResult.results.forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.isPassed ? '通过' : '不通过'}] ${sdk.getLevelText(r.riskLevel)} - ${r.text.substring(0, 20)}...`);
  });
  console.log('');

  console.log('--- 10. 调用编号查询 ---');
  const queryResult = sdk.queryByRequestId(result1.requestId);
  if (queryResult) {
    console.log('查询成功:', queryResult.text.substring(0, 30) + '...');
    console.log('审核状态:', queryResult.reviewStatus);
  }
  console.log('');

  console.log('--- 11. 人工复核 ---');
  const reviewResult = sdk.manualReview(
    result2.requestId,
    ReviewStatus.APPROVED,
    'reviewer_001',
    '经过人工审核，内容合规'
  );
  if (reviewResult) {
    console.log('复核状态:', reviewResult.reviewResult.status);
    console.log('复核人:', reviewResult.reviewer);
    console.log('复核时间:', new Date(reviewResult.reviewedAt).toLocaleString());
  }
  console.log('');

  console.log('--- 12. 误判反馈 ---');
  const feedback = sdk.submitMisjudgeFeedback(
    result2.requestId,
    RiskCategory.AD,
    '这是正常的客服联系方式，不是广告',
    'user@example.com'
  );
  console.log('反馈提交成功:', feedback.requestId);
  console.log('反馈内容:', feedback.feedback);
  sdk.markMisjudged(result2.requestId, 'admin_001', '确认为误判，已修正');
  console.log('标记为误判');
  console.log('');

  console.log('--- 13. 统计摘要 ---');
  const stats = sdk.getStatistics();
  console.log('总请求数:', stats.totalRequests);
  console.log('通过数:', stats.passedCount);
  console.log('拦截数:', stats.blockedCount);
  console.log('平均耗时:', stats.avgCostMs + 'ms');
  console.log('误判率:', (stats.misjudgeRate * 100).toFixed(2) + '%');
  console.log('人工复核率:', (stats.manualReviewRate * 100).toFixed(2) + '%');
  console.log('分类分布:');
  Object.entries(stats.categoryDistribution).forEach(([category, count]) => {
    console.log(`  ${sdk.getCategoryText(category as RiskCategory)}: ${count}`);
  });
  console.log('等级分布:');
  Object.entries(stats.levelDistribution).forEach(([level, count]) => {
    console.log(`  ${sdk.getLevelText(level)}: ${count}`);
  });
  console.log('');

  console.log('--- 14. 场景统计 ---');
  const commentStats = sdk.getSceneStats('comment');
  console.log('评论场景:');
  console.log('  请求数:', commentStats.count);
  console.log('  通过率:', (commentStats.passRate * 100).toFixed(2) + '%');
  console.log('  平均耗时:', commentStats.avgCostMs + 'ms');
  console.log('');

  console.log('--- 15. 复核统计 ---');
  const reviewStats = sdk.getReviewStats();
  console.log('总记录:', reviewStats.total);
  console.log('待复核:', reviewStats.pending);
  console.log('已通过:', reviewStats.approved);
  console.log('已驳回:', reviewStats.rejected);
  console.log('误判:', reviewStats.misjudged);
  console.log('');

  console.log('=== 示例执行完成 ===');
}

main().catch(console.error);
