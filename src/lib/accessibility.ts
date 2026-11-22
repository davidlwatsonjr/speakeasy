import { courseById, morseMap, type CourseId } from '../data/courses';
const handshapes: Record<string,string> = {
  "A": "Closed fist with thumb resting along the side of the index finger.",
  "B": "Four fingers straight together, thumb folded across the palm.",
  "C": "Fingers and thumb curved into an open semicircle.",
  "D": "Index finger points upward, other fingertips meet the thumb in a circle.",
  "E": "Fingers bent toward the palm with thumb tucked beneath them.",
  "F": "Index fingertip touches thumb, remaining three fingers extend upward.",
  "G": "Index finger and thumb extend horizontally, parallel to each other.",
  "H": "Index and middle fingers extend together horizontally.",
  "I": "Little finger points up, remaining fingers folded with thumb across them.",
  "J": "Little finger extended; trace a curved hook with its tip.",
  "K": "Index and middle fingers extend in a V, thumb rests against middle finger.",
  "L": "Index finger points up and thumb extends sideways at a right angle.",
  "M": "Closed fingers with thumb tucked under index, middle and ring fingers.",
  "N": "Closed fingers with thumb tucked under index and middle fingers.",
  "O": "All fingertips meet thumb in a rounded opening.",
  "P": "Index and middle fingers form the K handshape pointing downward.",
  "Q": "Index finger and thumb form the G handshape pointing downward.",
  "R": "Index and middle fingers crossed and pointing upward.",
  "S": "Closed fist with thumb folded across front of fingers.",
  "T": "Closed fist with thumb between index and middle fingers.",
  "U": "Index and middle fingers extended upward and held together.",
  "V": "Index and middle fingers extended upward and spread apart.",
  "W": "Index, middle and ring fingers extended and spread apart.",
  "X": "Index finger bent into a hook, other fingers folded.",
  "Y": "Thumb and little finger extended, middle three fingers folded.",
  "Z": "Index finger extended; trace a horizontal zigzag in the air."
};
export function describeSymbol(course: CourseId, label: string): string {
  const card = courseById[course].cards.find(c => c.label === label.toUpperCase());
  if (!card) return 'Unsupported character';
  if (course === 'asl') return handshapes[card.label] ?? 'Fingerspelling handshape';
  if (course === 'braille') return 'Braille dots ' + card.dots?.map(d => d.join(', ')).join('; next cell: ');
  return 'Morse ' + [...card.code].map(mark => mark === '.' ? 'dot' : 'dash').join(' ');
}
export function describeSequence(course: CourseId, text: string): string {
  return [...text].map(ch => ch === ' ' ? 'word space' : describeSymbol(course,ch)).join('; ');
}
export function describeMorsePattern(text: string): string {
  return text.trim().split(/\s+/).filter(Boolean).map(part => part === '/' ? 'word space' : [...part].map(ch => ch === '.' ? 'dot' : ch === '-' ? 'dash' : ch).join(' ')).join('; ');
}
export function validAudioText(text: string): boolean {
  return [...text.toUpperCase()].some(c => Boolean(morseMap[c]));
}
