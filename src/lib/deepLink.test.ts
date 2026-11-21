import { describe, expect, it } from 'vitest';
import { cardIndex, formatDeepLink, parseDeepLink } from './deepLink';

describe('deep links', () => {
  it('keeps the saved course when no course is specified', () => {
    expect(parseDeepLink('', 'braille')).toMatchObject({course:'braille',mode:'study',filter:'letters'});
  });
  it('opens ASL J and reversed study', () => {
    const link = parseDeepLink('?course=asl&mode=study&card=j&reverse=1');
    expect(link).toMatchObject({course:'asl',mode:'study',card:'J',reverse:true});
    expect(cardIndex(link)).toBe(9);
    expect(parseDeepLink(formatDeepLink(link))).toEqual(link);
  });
  it('chooses the correct deck for numbers and escaped punctuation', () => {
    const number = parseDeepLink('?course=braille&card=3');
    expect(number.filter).toBe('numbers');
    expect(cardIndex(number)).toBe(2);
    const punctuation = parseDeepLink('?course=morse&card=%2F');
    expect(punctuation).toMatchObject({filter:'punctuation',card:'/'});
    expect(parseDeepLink(formatDeepLink(punctuation))).toEqual(punctuation);
  });
  it('shares test configuration without starting a session', () => {
    const link = parseDeepLink('?course=morse&mode=test&unit=word&direction=encode&length=180');
    expect(link).toMatchObject({mode:'test',unit:'word',direction:'encode',length:'180'});
    expect(parseDeepLink(formatDeepLink(link))).toEqual(link);
  });
  it('supports reverse typing only for courses with decoders', () => {
    expect(parseDeepLink('?course=braille&mode=type&direction=decode').typeReverse).toBe(true);
    expect(parseDeepLink('?course=asl&mode=type&direction=decode').typeReverse).toBe(false);
    expect(formatDeepLink(parseDeepLink('?course=asl&mode=type'))).toBe('?course=asl&mode=type');
  });
  it('safely ignores invalid and incompatible parameters', () => {
    expect(parseDeepLink('?course=unknown&mode=wrong&filter=numbers&card=9&unit=bad&length=0')).toMatchObject({
      course:'asl',mode:'study',filter:'letters',card:undefined,unit:'letter',length:'10'
    });
  });
  it('does not expose personal deck contents, answers or user text', () => {
    const link = parseDeepLink('?course=asl&filter=starred&card=J&text=secret&answer=B&score=100');
    expect(link.card).toBeUndefined();
    expect(formatDeepLink(link)).toBe('?course=asl&mode=study&filter=starred');
    expect(formatDeepLink({...link,card:'J'})).not.toContain('card=');
  });
});
