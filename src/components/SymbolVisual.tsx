import { useState } from 'react';
import { Hand } from 'lucide-react';
import { describeSymbol } from '../lib/accessibility';
import type { CourseId, SymbolCard } from '../data/courses';
export function BrailleCell({ dots }: { dots: number[] }) {
  return <span className="braille-cell" role="img" aria-label={`Braille dots ${dots.join(', ') || 'none'}`}>{[1,4,2,5,3,6].map(n =>
    <span key={n} className={dots.includes(n) ? 'braille-dot filled' : 'braille-dot'}/>)}</span>;
}
export function SymbolVisual({ course, card, compact = false }: { course: CourseId; card: SymbolCard; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (course === 'braille') return <div className={`symbol-visual braille-visual ${compact ? 'compact' : ''}`} role="img" aria-label={`Braille dots ${card.dots?.map(d => d.join(',')).join(' then ')}`}>
    {card.dots?.map((dots,i) => <BrailleCell key={i} dots={dots}/>)}
    {!compact && <small>{card.dots?.map(d => d.join('–')).join(' / ')}</small>}</div>;
  if (course === 'morse') return <div className={`symbol-visual morse-visual ${compact ? 'compact' : ''}`}>
    <div className="morse-marks" role="img" aria-label={describeSymbol(course,card.label)}>
      {[...card.code].map((mark,i) => <span key={i} className={mark === '-' ? 'dash' : 'dot'}/>)}</div>
    {!compact && <div className="morse-footer" aria-hidden="true">{card.code.replaceAll('.', '·').replaceAll('-', '−')}</div>}
  </div>;
  // J and Z use the same monochrome SVG style as other fingerspelling letters, with motion paths.
  if (card.motion) return <div className={`symbol-visual sign-visual ${compact ? 'compact' : ''}`}>
    {!failed ? <img src={`/asl/${card.label.toLowerCase()}.svg`} alt={describeSymbol(course,card.label)} onError={() => setFailed(true)} />
      : <div className="sign-fallback"><Hand size={compact ? 24 : 55}/><small>Motion illustration unavailable</small></div>}
  </div>;
  return <div className={`symbol-visual sign-visual ${compact ? 'compact' : ''}`}>
    {!failed ? <img src={`/asl/${card.label.toLowerCase()}.svg`} alt={describeSymbol(course,card.label)} onError={() => setFailed(true)} />
      : <div className="sign-fallback"><Hand size={compact ? 24 : 55}/><small>Reference unavailable</small></div>}
  </div>;
}
