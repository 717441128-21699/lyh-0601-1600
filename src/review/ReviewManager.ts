import {
  TextAuditResult,
  ReviewStatus,
  ManualReviewRecord,
  MisjudgeFeedback,
  RiskCategory,
  FeedbackReasonCategory,
  FeedbackStatus,
  AuditChainResult,
} from '../types';

export class ReviewManager {
  private reviewRecords: Map<string, ManualReviewRecord> = new Map();
  private misjudgeFeedbacks: Map<string, MisjudgeFeedback[]> = new Map();
  private auditResults: Map<string, TextAuditResult> = new Map();

  public storeResult(result: TextAuditResult): void {
    this.auditResults.set(result.requestId, result);
  }

  public queryByRequestId(requestId: string): TextAuditResult | null {
    return this.auditResults.get(requestId) || null;
  }

  public queryAuditChain(requestId: string): AuditChainResult | null {
    const originalResult = this.auditResults.get(requestId);
    if (!originalResult) return null;

    const reviewRecord = this.reviewRecords.get(requestId) || null;
    const feedbacks = this.misjudgeFeedbacks.get(requestId) || [];

    return {
      originalResult,
      reviewRecord,
      feedbacks,
    };
  }

  public getReviewRecord(requestId: string): ManualReviewRecord | null {
    return this.reviewRecords.get(requestId) || null;
  }

  public manualReview(
    requestId: string,
    status: ReviewStatus,
    reviewer: string,
    comment?: string,
    isMisjudged = false
  ): ManualReviewRecord | null {
    const originalResult = this.auditResults.get(requestId);
    if (!originalResult) return null;

    const reviewResult = {
      status,
      reviewer,
      reviewTime: Date.now(),
      comment,
      isMisjudged,
    };

    const record: ManualReviewRecord = {
      requestId,
      originalResult,
      reviewResult,
      reviewer,
      reviewedAt: Date.now(),
      comment,
    };

    this.reviewRecords.set(requestId, record);

    originalResult.reviewStatus = status;
    originalResult.isMisjudged = isMisjudged;
    originalResult.manuallyReviewed = true;

    if (isMisjudged && status === ReviewStatus.APPROVED) {
      originalResult.isPassed = true;
    }

    return record;
  }

  public approve(requestId: string, reviewer: string, comment?: string): ManualReviewRecord | null {
    return this.manualReview(requestId, ReviewStatus.APPROVED, reviewer, comment, false);
  }

  public reject(requestId: string, reviewer: string, comment?: string): ManualReviewRecord | null {
    return this.manualReview(requestId, ReviewStatus.REJECTED, reviewer, comment, false);
  }

  public markMisjudged(
    requestId: string,
    reviewer: string,
    comment?: string
  ): ManualReviewRecord | null {
    return this.manualReview(requestId, ReviewStatus.MISJUDGED, reviewer, comment, true);
  }

  public submitMisjudgeFeedback(params: {
    requestId: string;
    category: RiskCategory;
    feedback: string;
    reasonCategory: FeedbackReasonCategory;
    contact?: string;
  }): MisjudgeFeedback {
    const { requestId, category, feedback, reasonCategory, contact } = params;

    const record: MisjudgeFeedback = {
      id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      requestId,
      category,
      feedback,
      reasonCategory,
      status: FeedbackStatus.SUBMITTED,
      contact,
      createdAt: Date.now(),
    };

    const existing = this.misjudgeFeedbacks.get(requestId) || [];
    existing.push(record);
    this.misjudgeFeedbacks.set(requestId, existing);

    return record;
  }

  public processFeedback(
    feedbackId: string,
    handler: string,
    status: FeedbackStatus.PROCESSING | FeedbackStatus.RESOLVED | FeedbackStatus.DISMISSED,
    comment?: string
  ): MisjudgeFeedback | null {
    for (const [, feedbacks] of this.misjudgeFeedbacks) {
      const feedback = feedbacks.find((f) => f.id === feedbackId);
      if (feedback) {
        feedback.status = status;
        feedback.handler = handler;
        feedback.handledAt = Date.now();
        feedback.handleComment = comment;
        return feedback;
      }
    }
    return null;
  }

  public getMisjudgeFeedbacks(requestId?: string): MisjudgeFeedback[] {
    if (requestId) {
      return this.misjudgeFeedbacks.get(requestId) || [];
    }
    const allFeedbacks: MisjudgeFeedback[] = [];
    this.misjudgeFeedbacks.forEach((feedbacks) => {
      allFeedbacks.push(...feedbacks);
    });
    return allFeedbacks.sort((a, b) => b.createdAt - a.createdAt);
  }

  public getFeedbackById(feedbackId: string): MisjudgeFeedback | null {
    for (const [, feedbacks] of this.misjudgeFeedbacks) {
      const feedback = feedbacks.find((f) => f.id === feedbackId);
      if (feedback) return feedback;
    }
    return null;
  }

  public getReviewRecords(
    status?: ReviewStatus,
    reviewer?: string
  ): ManualReviewRecord[] {
    let records = Array.from(this.reviewRecords.values());

    if (status) {
      records = records.filter((r) => r.reviewResult.status === status);
    }
    if (reviewer) {
      records = records.filter((r) => r.reviewer === reviewer);
    }

    return records.sort((a, b) => b.reviewedAt - a.reviewedAt);
  }

  public getPendingReviews(): TextAuditResult[] {
    const pendingResults: TextAuditResult[] = [];
    this.auditResults.forEach((result) => {
      if (result.reviewStatus === ReviewStatus.PENDING && !result.isPassed) {
        pendingResults.push(result);
      }
    });
    return pendingResults.sort((a, b) => b.timestamp - a.timestamp);
  }

  public getReviewStats(): {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    misjudged: number;
    manuallyReviewed: number;
  } {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let misjudged = 0;
    let manuallyReviewed = 0;

    this.auditResults.forEach((result) => {
      if (result.manuallyReviewed) {
        manuallyReviewed++;
      }
      switch (result.reviewStatus) {
        case ReviewStatus.PENDING:
          pending++;
          break;
        case ReviewStatus.APPROVED:
          approved++;
          break;
        case ReviewStatus.REJECTED:
          rejected++;
          break;
        case ReviewStatus.MISJUDGED:
          misjudged++;
          break;
      }
    });

    return {
      total: this.auditResults.size,
      pending,
      approved,
      rejected,
      misjudged,
      manuallyReviewed,
    };
  }

  public clearOldData(beforeTimestamp: number): number {
    let clearedCount = 0;

    this.auditResults.forEach((result, key) => {
      if (result.timestamp < beforeTimestamp) {
        this.auditResults.delete(key);
        this.reviewRecords.delete(key);
        this.misjudgeFeedbacks.delete(key);
        clearedCount++;
      }
    });

    return clearedCount;
  }
}
