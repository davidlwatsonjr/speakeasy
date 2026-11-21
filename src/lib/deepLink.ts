import { courseById, type CourseId, type Group } from '../data/courses';
import type { TestDirection, TestLength, TestUnit } from './practice';

export type Mode = 'study' | 'test' | 'type';
export type DeckFilter = Group | 'all' | 'starred' | 'review';
export interface DeepLink {
  course: CourseId;
  mode: Mode;
  filter: DeckFilter;
  card?: string;
  reverse: boolean;
  unit: TestUnit;
  direction: TestDirection;
  length: TestLength;
  typeReverse: boolean;
}

function pick<T extends string>(value: string | null, values: readonly T[], fallback: T): T {
  return values.find(option => option === value) ?? fallback;
}
export function isPersonalDeck(filter: DeckFilter): boolean {
  return filter === 'starred' || filter === 'review';
}
export function parseDeepLink(search: string, fallbackCourse: CourseId = 'asl'): DeepLink {
  const params = new URLSearchParams(search);
  const course = pick(params.get('course'), ['asl','braille','morse'], fallbackCourse);
  const mode = pick(params.get('mode'), ['study','test','type'], 'study');
  const groups = [...new Set(courseById[course].cards.map(card => card.group))];
  const filters: DeckFilter[] = [...groups, 'all', 'starred', 'review'];
  let filter = pick(params.get('filter'), filters, 'letters');
  const selected = mode === 'study' ? courseById[course].cards.find(card =>
    card.label === params.get('card')?.toUpperCase()) : undefined;
  // A link to a number or punctuation mark opens its appropriate deck, even
  // when an omitted or incompatible filter would otherwise hide the card.
  if (selected && !isPersonalDeck(filter) && filter !== 'all' && filter !== selected.group) filter = selected.group;
  return {
    course, mode, filter,
    card: selected && !isPersonalDeck(filter) ? selected.label : undefined,
    reverse: mode === 'study' && params.get('reverse') === '1',
    unit: pick(params.get('unit'), ['letter','word'], 'letter'),
    direction: pick(params.get('direction'), ['decode','encode'], 'decode'),
    length: pick(params.get('length'), ['10','60','180'], '10'),
    typeReverse: mode === 'type' && course !== 'asl' && params.get('direction') === 'decode',
  };
}
export function formatDeepLink(route: DeepLink): string {
  const params = new URLSearchParams({course:route.course,mode:route.mode});
  if (route.mode === 'study') {
    if (route.filter !== 'letters') params.set('filter',route.filter);
    if (route.card && !isPersonalDeck(route.filter)) params.set('card',route.card);
    if (route.reverse) params.set('reverse','1');
  } else if (route.mode === 'test') {
    params.set('unit',route.unit);
    params.set('direction',route.direction);
    params.set('length',route.length);
  } else if (route.course !== 'asl') {
    params.set('direction',route.typeReverse ? 'decode' : 'encode');
  }
  return '?' + params.toString();
}
export function cardIndex(route: DeepLink): number {
  if (!route.card || isPersonalDeck(route.filter)) return 0;
  const cards = courseById[route.course].cards.filter(card => route.filter === 'all' || card.group === route.filter);
  return Math.max(0, cards.findIndex(card => card.label === route.card));
}
