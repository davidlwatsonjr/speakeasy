import {describe,it,expect} from 'vitest';
import {describeSymbol,describeSequence,describeMorsePattern,validAudioText} from './accessibility';
import {readAccessibility,defaultAccessibility} from './storage';
describe('accessible representation and preferences',()=>{
 it('describes symbols without giving the answer',()=>{expect(describeSymbol('asl','A')).toContain('Closed fist');expect(describeSymbol('braille','B')).toBe('Braille dots 1, 2');expect(describeSymbol('morse','S')).toBe('Morse dot dot dot');});
 it('describes sequence boundaries',()=>{expect(describeSequence('morse','A B')).toContain('word space');expect(describeMorsePattern('.- / -...')).toBe('dot dash; word space; dash dot dot dot');expect(validAudioText('SOS')).toBe(true);});
 it('migrates absent settings, clamps invalid values',()=>{expect(readAccessibility(undefined)).toEqual(defaultAccessibility);expect(readAccessibility({wpm:100,volume:-5,large:true})).toMatchObject({wpm:30,volume:0,large:true});});
});
