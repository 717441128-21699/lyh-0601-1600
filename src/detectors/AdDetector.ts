import { BaseDetector } from './BaseDetector';
import { RiskCategory, HitFragment } from '../types';

export class AdDetector extends BaseDetector {
  name = 'AdDetector';
  category = RiskCategory.AD;

  private adKeywords = [
    { word: '加微信', confidence: 0.9 },
    { word: '加v', confidence: 0.85 },
    { word: '加qq', confidence: 0.8 },
    { word: '联系方式', confidence: 0.6 },
    { word: '联系电话', confidence: 0.65 },
    { word: '优惠', confidence: 0.4 },
    { word: '促销', confidence: 0.45 },
    { word: '打折', confidence: 0.4 },
    { word: '限时', confidence: 0.35 },
    { word: '免费领取', confidence: 0.7 },
    { word: '点击领取', confidence: 0.65 },
    { word: '扫码', confidence: 0.6 },
    { word: '二维码', confidence: 0.55 },
    { word: '购买', confidence: 0.35 },
    { word: '下单', confidence: 0.4 },
    { word: '客服', confidence: 0.3 },
    { word: '代购', confidence: 0.65 },
    { word: '微商', confidence: 0.75 },
    { word: '招代理', confidence: 0.8 },
    { word: '加盟费', confidence: 0.75 },
    { word: '赚钱', confidence: 0.5 },
    { word: '兼职', confidence: 0.55 },
    { word: '日结', confidence: 0.7 },
  ];

  private urlPattern = /https?:\/\/[^\s]+/g;
  private phonePattern = /1[3-9]\d{9}/g;
  private wechatPattern = /微信[：:]\s*\S+/gi;
  private qqPattern = /QQ[：:]\s*\d+/gi;

  detect(text: string): HitFragment[] {
    const fragments: HitFragment[] = [];

    this.adKeywords.forEach(({ word, confidence }) => {
      const lowerText = text.toLowerCase();
      const lowerWord = word.toLowerCase();
      let index = lowerText.indexOf(lowerWord);
      while (index !== -1) {
        fragments.push(
          this.createFragment(text, text.substring(index, index + word.length), index, confidence, `ad_keyword_${word}`)
        );
        index = lowerText.indexOf(lowerWord, index + word.length);
      }
    });

    const urlMatches = this.findAllMatches(text, this.urlPattern);
    urlMatches.forEach(({ match, index }) => {
      fragments.push(this.createFragment(text, match, index, 0.85, 'ad_url'));
    });

    const phoneMatches = this.findAllMatches(text, this.phonePattern);
    phoneMatches.forEach(({ match, index }) => {
      fragments.push(this.createFragment(text, match, index, 0.7, 'ad_phone'));
    });

    const wechatMatches = this.findAllMatches(text, this.wechatPattern);
    wechatMatches.forEach(({ match, index }) => {
      fragments.push(this.createFragment(text, match, index, 0.9, 'ad_wechat'));
    });

    const qqMatches = this.findAllMatches(text, this.qqPattern);
    qqMatches.forEach(({ match, index }) => {
      fragments.push(this.createFragment(text, match, index, 0.8, 'ad_qq'));
    });

    return fragments;
  }
}
