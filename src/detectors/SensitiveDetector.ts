import { BaseDetector } from './BaseDetector';
import { RiskCategory, HitFragment } from '../types';

export class SensitiveDetector extends BaseDetector {
  name = 'SensitiveDetector';
  category = RiskCategory.SENSITIVE;

  private politicalSensitive = [
    { word: '法轮功', confidence: 0.95 },
    { word: '台独', confidence: 0.9 },
    { word: '藏独', confidence: 0.9 },
    { word: '疆独', confidence: 0.9 },
    { word: '港独', confidence: 0.9 },
    { word: '反动', confidence: 0.7 },
    { word: '颠覆', confidence: 0.75 },
  ];

  private violenceSensitive = [
    { word: '杀人', confidence: 0.9 },
    { word: '放火', confidence: 0.8 },
    { word: '爆炸', confidence: 0.85 },
    { word: '毒品', confidence: 0.9 },
    { word: '吸毒', confidence: 0.85 },
    { word: '赌博', confidence: 0.75 },
    { word: '色情', confidence: 0.8 },
    { word: '黄色', confidence: 0.65 },
  ];

  private scamSensitive = [
    { word: '诈骗', confidence: 0.85 },
    { word: '传销', confidence: 0.8 },
    { word: '非法集资', confidence: 0.85 },
    { word: '庞氏骗局', confidence: 0.9 },
  ];

  detect(text: string): HitFragment[] {
    const fragments: HitFragment[] = [];

    const allSensitive = [
      ...this.politicalSensitive.map(s => ({ ...s, type: 'political' })),
      ...this.violenceSensitive.map(s => ({ ...s, type: 'violence' })),
      ...this.scamSensitive.map(s => ({ ...s, type: 'scam' })),
    ];

    allSensitive.forEach(({ word, confidence, type }) => {
      const lowerText = text.toLowerCase();
      const lowerWord = word.toLowerCase();
      let index = lowerText.indexOf(lowerWord);
      while (index !== -1) {
        fragments.push(
          this.createFragment(
            text,
            text.substring(index, index + word.length),
            index,
            confidence,
            `sensitive_${type}_${word}`
          )
        );
        index = lowerText.indexOf(lowerWord, index + word.length);
      }
    });

    return fragments;
  }
}
