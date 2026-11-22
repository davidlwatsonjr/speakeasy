import type { CourseId } from '../data/courses';
import type { TestDirection, TestLength, TestUnit, Metrics } from './practice';
export interface CardProgress { seen: number; correct: number; again: number; last: number; mastered: boolean; }
export type Progress = Record<string, CardProgress>;
export interface Session {
  id: number; course: CourseId; unit: TestUnit; direction: TestDirection;
  length: TestLength; metrics: Metrics;
}
export interface AccessibilityPreferences { contrast: boolean; large: boolean; reduceMotion: boolean; untimed: boolean; accuracyOnly: boolean; wpm: number; volume: number; }
export const defaultAccessibility: AccessibilityPreferences = {contrast:false,large:false,reduceMotion:false,untimed:false,accuracyOnly:false,wpm:18,volume:100};
export function readAccessibility(value: unknown): AccessibilityPreferences {
  const data = value && typeof value === 'object' ? value as Partial<AccessibilityPreferences> : {};
  const bounded = (v: unknown, lo: number, hi: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(hi,Math.max(lo,Math.round(v))) : fallback;
  return {contrast:data.contrast === true,large:data.large === true,reduceMotion:data.reduceMotion === true,untimed:data.untimed === true,accuracyOnly:data.accuracyOnly === true,wpm:bounded(data.wpm,5,30,18),volume:bounded(data.volume,0,100,100)};
}
export interface Preferences { accessibility: AccessibilityPreferences; course: CourseId; starred: string[]; progress: Progress; audioEnabled: boolean; sessions: Session[]; }
export const storageKey = 'speakeasy:state:v1';
const legacyStorageKey = 'alltheways:state:v1';
export const initialPreferences: Preferences = { course: 'asl', starred: [], progress: {}, audioEnabled: false, sessions: [], accessibility: defaultAccessibility };
export function readPreferences(): Preferences {
  if (typeof localStorage === 'undefined') return {...initialPreferences};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return {...initialPreferences};
    const data = parsed as Partial<Preferences>;
    return {
      course: ['asl','braille','morse'].includes(data.course ?? '') ? data.course! : 'asl',
      starred: Array.isArray(data.starred) ? data.starred.filter(x => typeof x === 'string') : [],
      progress: data.progress && typeof data.progress === 'object' && !Array.isArray(data.progress) ? data.progress : {},
      audioEnabled: data.audioEnabled === true,
      accessibility: readAccessibility(data.accessibility),
      sessions: Array.isArray(data.sessions) ? data.sessions.filter(s => s && typeof s.id === 'number' && s.metrics).slice(-50) : []
    };
  } catch { return {...initialPreferences}; }
}
export function rateCard(progress: Progress, id: string, correct: boolean): Progress {
  const prev = progress[id] ?? {seen: 0, correct: 0, again: 0, last: 0, mastered: false};
  return {...progress, [id]: {
    seen: prev.seen + 1, correct: prev.correct + Number(correct),
    again: prev.again + Number(!correct), last: Date.now(),
    mastered: correct ? prev.correct + 1 >= 2 : false
  }};
}
export function addSession(sessions: Session[], session: Session): Session[] {
  return [...sessions, session].slice(-50);
}
