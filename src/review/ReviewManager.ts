import {
  TextAuditResult,
  ReviewStatus,
  ManualReviewRecord,
  MisjudgeFeedback,
  RiskCategory,
} from '../types';

export class ReviewManager {
  private reviewRecords: Map<string, ManualReviewRecord> = new Map();
  private misjudgeFeedbacks: Map<string, MisjudgeFeedback> = new Map();
  private auditResults: Map<string, TextAuditResult> = new Map();

  public storeResult(result: TextAuditResult): void {
    this.auditResults.set(result.requestId, result);
  }

  public queryByRequestId(requestId: string): TextAuditResult | null {
    return this.auditResults.get(requestId) || null;
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

  public submitMisjudgeFeedback(
    requestId: string,
    category: RiskCategory,
    feedback: string,
    contact?: string
  ): MisjudgeFeedback {
    const record: MisjudgeFeedback = {
      requestId,
      category,
      feedback,
      contact,
      createdAt: Date.now(),
    };

    const key = `${requestId}_${Date.now()}`;
    this.misjudgeFeedbacks.set(key, record);

    return record;
  }

  public getMisjudgeFeedbacks(requestId?: string): MisjudgeFeedback[] {
    const feedbacks = Array.from(this.misjudgeFeedbacks.values());
    if (requestId) {
      return feedbacks.filter((f) => f.requestId === requestId);
    }
    return feedbacks;
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
  } {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let misjudged = 0;

    this.auditResults.forEach((result) => {
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
    };
  }

  public clearOldData(beforeTimestamp: number): number {
    let clearedCount = 0;

    this.auditResults.forEach((result, key) => {
      if (result.timestamp < beforeTimestamp) {
        this.auditResults.delete(key);
        this.reviewRecords.delete(key);
        clearedCount++;
      }
    });

    const misjudgeKeysToDelete: string[] = [];
    this.misjudgeFeedbacks.forEach((feedback, key) => {
      if (feedback.createdAt < beforeTimestamp) {
        misjudgeKeysToDelete.push(key);
      }
    });
    misjudgeKeysToDelete.forEach((key) => {
      this.misjudgeFeedbacks.delete(key);
    });

    return clearedCount + misjudgeKeysToDelete.length;
  }
}
