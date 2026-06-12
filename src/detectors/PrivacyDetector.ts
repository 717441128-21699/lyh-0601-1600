import { BaseDetector } from './BaseDetector';
import { RiskCategory, HitFragment } from '../types';

export class PrivacyDetector extends BaseDetector {
  name = 'PrivacyDetector';
  category = RiskCategory.PRIVACY;

  private idCardPattern = /[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g;
  private phonePattern = /1[3-9]\d{9}/g;
  private emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  private addressKeywords = ['身份证', '家庭住址', '住址', '地址是', '住在', '家住'];
  private bankCardPattern = /\d{16,19}/g;

  detect(text: string): HitFragment[] {
    const fragments: HitFragment[] = [];

    const idCardMatches = this.findAllMatches(text, this.idCardPattern);
    idCardMatches.forEach(({ match, index }) => {
      fragments.push(this.createFragment(text, match, index, 0.95, 'privacy_idcard'));
    });

    const phoneMatches = this.findAllMatches(text, this.phonePattern);
    phoneMatches.forEach(({ match, index }) => {
      fragments.push(this.createFragment(text, match, index, 0.75, 'privacy_phone'));
    });

    const emailMatches = this.findAllMatches(text, this.emailPattern);
    emailMatches.forEach(({ match, index }) => {
      fragments.push(this.createFragment(text, match, index, 0.8, 'privacy_email'));
    });

    const bankCardMatches = this.findAllMatches(text, this.bankCardPattern);
    bankCardMatches.forEach(({ match, index }) => {
      fragments.push(this.createFragment(text, match, index, 0.85, 'privacy_bankcard'));
    });

    this.addressKeywords.forEach((keyword) => {
      const lowerText = text.toLowerCase();
      const lowerKeyword = keyword.toLowerCase();
      let index = lowerText.indexOf(lowerKeyword);
      while (index !== -1) {
        fragments.push(
          this.createFragment(text, text.substring(index, index + keyword.length), index, 0.6, `privacy_address_keyword`)
        );
        index = lowerText.indexOf(lowerKeyword, index + keyword.length);
      }
    });

    return fragments;
  }
}
