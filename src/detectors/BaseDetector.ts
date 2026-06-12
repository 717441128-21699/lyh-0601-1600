import { HitFragment, RiskCategory } from '../types';

export interface Detector {
  name: string;
  category: RiskCategory;
  detect(text: string): HitFragment[];
}

export abstract class BaseDetector implements Detector {
  abstract name: string;
  abstract category: RiskCategory;

  abstract detect(text: string): HitFragment[];

  protected createFragment(
    text: string,
    matchedText: string,
    start: number,
    confidence: number,
    ruleId?: string
  ): HitFragment {
    return {
      text: matchedText,
      start,
      end: start + matchedText.length,
      category: this.category,
      confidence,
      ruleId,
    };
  }

  protected findAllMatches(text: string, pattern: RegExp): Array<{ match: string; index: number }> {
    const results: Array<{ match: string; index: number }> = [];
    const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    let match;
    while ((match = regex.exec(text)) !== null) {
      results.push({ match: match[0], index: match.index });
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }
    return results;
  }
}
