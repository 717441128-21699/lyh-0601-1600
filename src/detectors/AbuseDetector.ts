import { BaseDetector } from './BaseDetector';
import { RiskCategory, HitFragment } from '../types';

export class AbuseDetector extends BaseDetector {
  name = 'AbuseDetector';
  category = RiskCategory.ABUSE;

  private severeAbuseWords = [
    '傻逼', '操你妈', '草泥马', '去死', '傻逼玩意', '垃圾人',
    '废物', '滚蛋', '狗娘养的', '王八', '白痴', '脑残',
  ];

  private moderateAbuseWords = [
    '垃圾', '傻逼', '蠢货', '笨蛋', '傻缺', '智障',
    '你妹', '坑爹', '扯淡', '装逼', '屌丝', '绿茶',
    '渣男', '渣女', '恶心', '无耻', '卑鄙', '下流',
  ];

  private mildAbuseWords = [
    '讨厌', '烦人', '闭嘴', '笨', '蠢', '傻',
    '丑', '胖', '矮', '穷', '抠门', '小气',
  ];

  detect(text: string): HitFragment[] {
    const fragments: HitFragment[] = [];

    this.severeAbuseWords.forEach((word) => {
      const index = text.indexOf(word);
      if (index !== -1) {
        fragments.push(
          this.createFragment(text, word, index, 0.95, `abuse_severe_${word}`)
        );
      }
    });

    this.moderateAbuseWords.forEach((word) => {
      const lowerText = text.toLowerCase();
      const lowerWord = word.toLowerCase();
      let index = lowerText.indexOf(lowerWord);
      while (index !== -1) {
        fragments.push(
          this.createFragment(text, text.substring(index, index + word.length), index, 0.7, `abuse_moderate_${word}`)
        );
        index = lowerText.indexOf(lowerWord, index + word.length);
      }
    });

    this.mildAbuseWords.forEach((word) => {
      const lowerText = text.toLowerCase();
      const lowerWord = word.toLowerCase();
      let index = lowerText.indexOf(lowerWord);
      while (index !== -1) {
        fragments.push(
          this.createFragment(text, text.substring(index, index + word.length), index, 0.4, `abuse_mild_${word}`)
        );
        index = lowerText.indexOf(lowerWord, index + word.length);
      }
    });

    return fragments;
  }
}
