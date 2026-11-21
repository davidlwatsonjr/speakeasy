import '@fontsource-variable/dm-sans/wght.css';
import '@fontsource-variable/outfit/wght.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Clock3, Copy, Delete, Hand, Keyboard, RotateCcw, Settings2, Shuffle, Star, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { BrailleCell, SymbolVisual } from './components/SymbolVisual';
import { brailleFor, courseById, courses, translateText, unicodeBraille, type CourseId, type Group } from './data/courses';
import { calculateMetrics, cardsFor, decodeBraille, decodeMorse, generateQuestions, matchesAnswer, shuffle, type Attempt, type Question, type TestDirection, type TestLength, type TestUnit } from './lib/practice';
import { playMorse, stopMorse } from './lib/audio';
import { addSession, initialPreferences, rateCard, readPreferences, storageKey } from './lib/storage';
import './style.css';

type Mode = 'study' | 'test' | 'type';
type DeckFilter = 'letters' | Group | 'all' | 'starred' | 'review';
type Phase = 'ready' | 'running' | 'finished';

function SymbolSequence({ course, text, mini = false }: { course: CourseId; text: string; mini?: boolean }) {
  if (course === 'morse') return <div className={mini ? 'sequence morse-sequence mini' : 'sequence morse-sequence'} aria-label={`Morse code for ${text}`}>
    {[...text.toUpperCase()].map((ch, i) => <span key={i}>{translateText('morse', ch).replaceAll('.', '·').replaceAll('-', '−')}</span>)}
  </div>;
  return <div className={mini ? 'sequence mini' : 'sequence'} aria-label={`${course === 'asl' ? 'Fingerspelling' : 'Braille'} sequence of ${text.length} characters`}>
    {[...text.toUpperCase()].map((ch, i) => {
      const card = courseById[course].cards.find(c => c.label === ch);
      return card ? <SymbolVisual key={i} course={course} card={card} compact /> : <span key={i} className="unknown">?</span>;
    })}
  </div>;
}

function App() {
  const [prefs, setPrefs] = useState(() => {
    const saved = readPreferences();
    const selected = new URLSearchParams(window.location.search).get('course');
    return selected === 'asl' || selected === 'braille' || selected === 'morse' ? {...saved, course: selected} : saved;
  });
  const [mode, setMode] = useState<Mode>('study');
  const [filter, setFilter] = useState<DeckFilter>('letters');
  const [reverse, setReverse] = useState(false);
  const [randomDeck, setRandomDeck] = useState(false);
  const [deckIndex, setDeckIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [unit, setUnit] = useState<TestUnit>('letter');
  const [direction, setDirection] = useState<TestDirection>('decode');
  const [length, setLength] = useState<TestLength>('10');
  const [phase, setPhase] = useState<Phase>('ready');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [remaining, setRemaining] = useState(60);
  const [input, setInput] = useState('HELLO WORLD');
  const [typeReverse, setTypeReverse] = useState(false);
  const [brailleDots, setBrailleDots] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);
  const [settings, setSettings] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState<'preparing' | 'ready' | 'unavailable'>('preparing');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const beganAt = useRef(0);
  const endedAt = useRef(0);
  const questionAt = useRef(0);
  const saveCompleted = useRef(false);
  const course = courseById[prefs.course];
  const cards = course.cards;
  const active = questions[questionIndex];
  const totalMastered = cards.filter(c => prefs.progress[c.id]?.mastered).length;
  const deck = useMemo(() => {
    const subset = cards.filter(card => {
      if (filter === 'starred') return prefs.starred.includes(card.id);
      if (filter === 'review') return (prefs.progress[card.id]?.seen ?? 0) > 0 && !prefs.progress[card.id]?.mastered;
      return filter === 'all' || card.group === filter;
    });
    return randomDeck ? shuffle(subset) : subset;
  }, [cards, filter, prefs.starred, filter === 'review' ? prefs.progress : null, randomDeck]);
  const current = deck.length ? deck[((deckIndex % deck.length) + deck.length) % deck.length] : undefined;
  const pastSessions = prefs.sessions.filter(s => s.course === course.id);
  const latest = pastSessions[pastSessions.length - 1];
  const duration = Math.max(1, ((endedAt.current || Date.now()) - beganAt.current) / 1000);
  const metrics = calculateMetrics(attempts, duration);
  const testCorrect = active && answer !== null && matchesAnswer(answer, active.answer);
  const output = typeReverse ? (course.id === 'morse' ? decodeMorse(input) : decodeBraille(input)) : translateText(course.id, input);
  const answerOptions = active?.options ?? [];

  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(prefs)); } catch { /* private browsing */ } }, [prefs]);
  useEffect(() => () => stopMorse(), []);
  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
      setOfflineStatus('unavailable');
      return () => {
        window.removeEventListener('online', updateConnection);
        window.removeEventListener('offline', updateConnection);
      };
    }

    let mounted = true;
    const serviceWorker = navigator.serviceWorker;
    const onControl = () => {
      if (mounted && serviceWorker.controller) setOfflineStatus('ready');
    };
    serviceWorker.addEventListener('controllerchange', onControl);
    onControl();
    void serviceWorker.register('/sw.js')
      .then(() => serviceWorker.ready)
      .then(registration => {
        if (mounted && registration.active) setOfflineStatus('ready');
      })
      .catch(error => {
        console.warn('Offline installation failed', error);
        if (mounted) setOfflineStatus('unavailable');
      });

    return () => {
      mounted = false;
      serviceWorker.removeEventListener('controllerchange', onControl);
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'running' || length === '10') return;
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((beganAt.current + Number(length) * 1000 - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) finishTest();
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase, length]);

  useEffect(() => {
    if (phase !== 'finished' || saveCompleted.current || !beganAt.current) return;
    saveCompleted.current = true;
    stopMorse();
    if (attempts.length) {
      const result = calculateMetrics(attempts, Math.max(1, (endedAt.current - beganAt.current) / 1000));
      setPrefs(p => ({...p, sessions: addSession(p.sessions, {
        id: Date.now(), course: p.course, unit, direction, length, metrics: result
      })}));
    }
  }, [phase, attempts, length, remaining, unit, direction]);

  function finishTest() { if (endedAt.current) return; endedAt.current = Date.now(); setPhase('finished'); }
  function resetTest() {
    stopMorse(); setPhase('ready'); setQuestions([]); setAnswer(null); setTypedAnswer('');
    setAttempts([]); setQuestionIndex(0); beganAt.current = 0; endedAt.current = 0;
  }
  function switchCourse(courseId: CourseId) {
    if (courseId === prefs.course) return;
    resetTest(); setPrefs(p => ({...p, course: courseId}));
    setFilter('letters'); setDeckIndex(0); setRevealed(false);
    setInput('HELLO WORLD'); setTypeReverse(false); setBrailleDots([]);
  }
  function switchMode(next: Mode) {
    if (mode === 'test' && next !== 'test') resetTest();
    stopMorse(); setMode(next); setRevealed(false);
  }
  function switchFilter(value: DeckFilter) {
    setFilter(value); setDeckIndex(0); setRevealed(false);
  }
  function moveCard(delta: number) {
    setDeckIndex(i => deck.length ? (i + delta + deck.length) % deck.length : 0);
    setRevealed(false);
  }
  function gradeCard(correct: boolean) {
    if (!current) return;
    setPrefs(p => ({...p, progress: rateCard(p.progress, current.id, correct)}));
    moveCard(1);
  }
  function beginTest() {
    const generated = generateQuestions(course.id, unit, direction, length === '10' ? 10 : 120);
    setQuestions(generated); setQuestionIndex(0); setAnswer(null); setTypedAnswer('');
    setAttempts([]); beganAt.current = Date.now(); questionAt.current = Date.now();
    saveCompleted.current = false; endedAt.current = 0; setRemaining(length === '10' ? 0 : Number(length)); setPhase('running');
    if (prefs.audioEnabled && generated[0]) void playMorse(generated[0].answer);
  }
  function submitAnswer(choice: string) {
    if (!active || answer !== null || phase !== 'running') return;
    const correct = matchesAnswer(choice, active.answer);
    setAnswer(choice);
    const measured = Math.max(0, Date.now() - questionAt.current);
    setAttempts(a => [...a, {correct, milliseconds: measured, characters: active.answer.length}]);
    setPrefs(p => {
      let progress = p.progress;
      for (const c of cardsFor(p.course, active.answer)) progress = rateCard(progress, c.id, correct);
      return {...p, progress};
    });
    stopMorse();
  }
  function nextQuestion() {
    if (questionIndex + 1 === questions.length) { finishTest(); return; }
    const next = questions[questionIndex + 1];
    setQuestionIndex(v => v + 1); setAnswer(null); setTypedAnswer('');
    questionAt.current = Date.now();
    if (prefs.audioEnabled) void playMorse(next.answer);
  }
  function updateAudio() {
    setPrefs(p => ({...p, audioEnabled: !p.audioEnabled}));
    if (prefs.audioEnabled) stopMorse();
    else {
      const message = mode === 'test' && phase === 'running' ? active?.answer : mode === 'study' ? current?.label : mode === 'type' ? (typeReverse ? output : input) : undefined;
      if (message) void playMorse(message);
    }
  }
  function clearData() {
    if (!window.confirm('Delete local study progress, favorites, and test history on this device?')) return;
    setPrefs({...initialPreferences, course: prefs.course}); resetTest(); setSettings(false);
  }
  async function copyOutput() {
    try { await navigator.clipboard.writeText(output); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }
    catch { setCopied(false); }
  }
  useEffect(() => {
    if (!prefs.audioEnabled || mode !== 'study' || !current) return;
    void playMorse(current.label);
    return () => stopMorse();
  }, [course.id, current?.id, mode, prefs.audioEnabled]);

  return <div className="app">
    <header className="app-header">
      <div className="identity"><img src="/icons/icon-192.png" alt="" /><div><strong>Speak<em>Easy</em></strong><small>Learn a new way to communicate</small></div></div>
      <div className="header-right"><span className="mastered"><Trophy size={15}/> {totalMastered}/{cards.length}</span><button className="icon-button" onClick={() => setSettings(true)} aria-label="Settings"><Settings2 size={19}/></button></div>
    </header>
    <nav className="course-tabs" aria-label="Select language">
      {courses.map(c => <button key={c.id} aria-pressed={c.id === course.id} className={c.id === course.id ? 'active' : ''} onClick={() => switchCourse(c.id)}>
        {c.id === 'asl' ? <Hand size={17}/> : c.id === 'braille' ? <span className="braille-mark">⠿</span> : <span className="morse-mark">·−</span>}{c.id === 'asl' ? 'ASL' : c.name}
      </button>)}
    </nav>
    <nav className="mode-tabs" role="tablist" aria-label="Learning mode">
      {([['study','Study',BookOpen],['test','Test',Trophy],['type','Type',Keyboard]] as const).map(([key,label,Icon]) => <button key={key} role="tab" aria-selected={mode === key} className={mode === key ? 'active' : ''} onClick={() => switchMode(key)}><Icon size={16}/>{label}</button>)}
    </nav>
    <main className="stage">
      <div className="stage-head">
        <div className="stage-title"><h1>{mode === 'study' ? 'Flashcards' : mode === 'test' ? 'Test your recall' : 'Free-form typing'}</h1><small>{course.id === 'asl' ? 'ASL fingerspelling' : course.id === 'braille' ? 'Uncontracted Braille' : 'International Morse'}</small></div>
        {<button className={prefs.audioEnabled ? 'sound-toggle on' : 'sound-toggle'} aria-pressed={prefs.audioEnabled} onClick={updateAudio} title={prefs.audioEnabled ? 'Mute Morse playback' : 'Enable Morse audio in any course'}>
          {prefs.audioEnabled ? <Volume2 size={17}/> : <VolumeX size={17}/>} Morse {prefs.audioEnabled ? 'on' : 'off'}
        </button>}
      </div>

      {mode === 'study' && <>
        <div className="tools-row">
          <label className="select-control"><select aria-label="Study set" value={filter} onChange={e => switchFilter(e.target.value as DeckFilter)}>
            <option value="letters">A–Z</option>{course.id !== 'asl' && <option value="numbers">Numbers</option>}{course.id === 'morse' && <option value="punctuation">Punctuation</option>}
            <option value="all">All symbols</option><option value="starred">Favorites</option><option value="review">Review</option>
          </select><ChevronDown size={14}/></label>
          <button className="small-tool" onClick={() => {setReverse(v => !v); setRevealed(false);}} aria-pressed={reverse}><RotateCcw size={15}/> Reverse</button>
          <button className="small-tool" onClick={() => {setRandomDeck(v => !v); setDeckIndex(0); setRevealed(false);}} aria-pressed={randomDeck}><Shuffle size={15}/> {randomDeck ? 'Mixed' : 'Order'}</button>
          {prefs.audioEnabled && current && <button className="small-tool study-replay" aria-label="Replay Morse" title="Replay Morse" onClick={() => void playMorse(current.label)}><Volume2 size={16}/></button>}
        </div>
        {current ? <>
          <div className="progress-line"><span>{deckIndex % deck.length + 1} of {deck.length}</span><span>{reverse ? 'Character → symbol' : 'Symbol → character'}</span></div>
          <button className="study-card" onClick={() => setRevealed(v => !v)} aria-label={revealed ? 'Show question' : 'Reveal answer'}>
            <span className="card-caption">{revealed ? 'ANSWER' : 'TAP TO REVEAL'}</span>
            <div className="study-card-content">{(revealed !== reverse) ? <span className="large-character">{current.label}</span> : <SymbolVisual key={current.id} course={course.id} card={current} />}</div>
            <span className="card-caption bottom">{revealed ? (current.motion || 'Tap to return') : 'What does this represent?'}</span>
          </button>
          <div className="study-actions">
            <button className="square-action" onClick={() => moveCard(-1)} aria-label="Previous"><ArrowLeft size={20}/></button>
            <button className={prefs.starred.includes(current.id) ? 'square-action starred' : 'square-action'} onClick={() => setPrefs(p => ({...p,starred:p.starred.includes(current.id)?p.starred.filter(id => id !== current.id):[...p.starred,current.id]}))} aria-label="Favorite" aria-pressed={prefs.starred.includes(current.id)}><Star size={19}/></button>
            {revealed ? <><button className="secondary-action" onClick={() => gradeCard(false)}>Again</button><button className="primary-action" onClick={() => gradeCard(true)}><Check size={17}/> Got it</button></> : <button className="primary-action" onClick={() => setRevealed(true)}>Reveal</button>}
            <button className="square-action" onClick={() => moveCard(1)} aria-label="Next"><ArrowRight size={20}/></button>
          </div>
        </> : <div className="empty"><Star size={26}/><p>No cards in this set yet.</p><button onClick={() => switchFilter('letters')}>All letters</button></div>}
      </>}

      {mode === 'test' && phase === 'ready' && <>
        <div className="test-config">
          <label>Content<select value={unit} onChange={e => setUnit(e.target.value as TestUnit)}><option value="letter">Letters</option><option value="word">Words</option></select></label>
          <label>Direction<select value={direction} onChange={e => setDirection(e.target.value as TestDirection)}><option value="decode">Read symbols</option><option value="encode">Pick symbols</option></select></label>
          <label>Session<select value={length} onChange={e => setLength(e.target.value as TestLength)}><option value="10">10 questions</option><option value="60">60 seconds</option><option value="180">3 minutes</option></select></label>
        </div>
        <div className="ready-hero"><Clock3 size={38}/><h2>Ready when you are.</h2><p>{unit === 'letter' ? 'Match individual characters.' : 'Read or recognize complete words.'} {direction === 'decode' ? 'Identify what the symbols mean.' : 'Choose the correct symbols.'}</p></div>
        {latest && <p className="prior-score">Last {latest.unit} test · {latest.metrics.accuracy}% accuracy · {latest.metrics.correctPerMinute} correct/min</p>}
        <button className="primary-action full" onClick={beginTest}>Start test <ArrowRight size={18}/></button>
      </>}

      {mode === 'test' && phase === 'running' && active && <>
        <div className="progress-line"><span>{unit === 'letter' ? 'LETTER' : 'WORD'} · {questionIndex + 1} answered after this question</span><span>{length === '10' ? `${attempts.length}/10` : `${remaining}s`}</span></div>
        <div className="meter"><span style={{width: `${length === '10' ? attempts.length * 10 : (Number(length) - remaining)/Number(length)*100}%`}}/></div>
        <div className="question-prompt">
          <small>{direction === 'decode' ? 'WHAT DOES THIS SAY?' : 'WHICH SYMBOLS MATCH?'}</small>
          <div className="question-display">{direction === 'decode'
            ? (unit === 'letter' ? <SymbolVisual key={active.answer} course={course.id} card={cardsFor(course.id,active.answer)[0]}/> : <SymbolSequence course={course.id} text={active.answer}/>)
            : <span className="large-character word">{active.answer}</span>}
          </div>
          {prefs.audioEnabled && <button className="replay" onClick={() => void playMorse(active.answer)}><Volume2 size={16}/> Replay</button>}
        </div>
        {unit === 'word' && direction === 'decode' ? <form className="word-entry" onSubmit={e => {e.preventDefault(); submitAnswer(typedAnswer);}}>
          <input aria-label="Type the word" placeholder="Type the word…" autoCapitalize="characters" autoComplete="off" spellCheck={false} disabled={answer !== null} value={typedAnswer} onChange={e => setTypedAnswer(e.target.value.toUpperCase().replace(/[^A-Z]/g,''))} maxLength={12}/>
          {answer === null && <button type="submit" className="primary-action" disabled={!typedAnswer.trim()}>Check</button>}
        </form> : <div className={unit === 'letter' ? 'options' : 'options word-options'}>
          {answerOptions.map(choice => <button key={choice} disabled={answer !== null} onClick={() => submitAnswer(choice)} className={answer !== null && choice === active.answer ? 'correct' : answer === choice ? 'incorrect' : ''}>
            {direction === 'encode' ? <SymbolSequence course={course.id} text={choice} mini={unit === 'word'}/> : choice}
            {answer !== null && choice === active.answer && <Check size={16}/>}
          </button>)}
        </div>}
        <div className="test-bottom">
          {answer !== null ? <><span aria-live="polite" className={testCorrect ? 'feedback right' : 'feedback wrong'}>{testCorrect ? 'Correct!' : `Answer: ${active.answer}`}</span><button className="primary-action" onClick={() => {if (length === '10' && questionIndex + 1 >= 10) finishTest(); else nextQuestion();}}>Next <ArrowRight size={17}/></button></>
            : <><span className="subtle">{prefs.audioEnabled ? 'Morse audio is an optional clue.' : 'First answer counts toward your grade.'}</span><button className="text-action" onClick={finishTest}>End test</button></>}
        </div>
      </>}

      {mode === 'test' && phase === 'finished' && <>
        <div className="result-hero"><Trophy size={40}/><h2>{metrics.accuracy}%</h2><p>{metrics.correct} correct out of {metrics.answered}</p></div>
        <div className="result-grid"><div><strong>{metrics.averageSeconds}s</strong><small>avg / answer</small></div><div><strong>{metrics.correctPerMinute}</strong><small>correct / min</small></div><div><strong>{metrics.charactersPerMinute}</strong><small>characters / min</small></div></div>
        <p className="result-note">Results are saved on this device. Speed measures correct answers per elapsed minute; accuracy includes mistakes.</p>
        <div className="result-actions"><button className="secondary-action" onClick={() => setPhase('ready')}>Change settings</button><button className="primary-action" onClick={beginTest}>Try again <ArrowRight size={18}/></button></div>
      </>}

      {mode === 'type' && <>
        <div className="type-toolbar">
          {course.id !== 'asl' ? <div className="segmented"><button className={!typeReverse ? 'active' : ''} onClick={() => {setTypeReverse(false);setInput('HELLO WORLD');setBrailleDots([]);}}>Encode</button><button className={typeReverse ? 'active' : ''} onClick={() => {setTypeReverse(true);setInput('');setBrailleDots([]);}}>Decode</button></div> : <span className="subtle">Finger-spell any message</span>}
          <button className="small-tool" onClick={() => setInput('')}>Clear <X size={15}/></button>
        </div>
        <label className="type-label" htmlFor="free-input">{typeReverse ? course.id === 'morse' ? 'Morse input (spaces between letters, / between words)' : 'Paste Braille Unicode cells' : 'Your text'}</label>
        <textarea id="free-input" rows={2} value={input} onChange={e => setInput(e.target.value.slice(0,120))} maxLength={120} placeholder={typeReverse ? course.id === 'morse' ? '.... . .-.. .-.. ---' : '⠓⠑⠇⠇⠕' : 'Type anything…'} spellCheck={false}/>
        {typeReverse && course.id === 'braille' && <div className="braille-keypad" aria-label="Braille cell input">
          {[1,4,2,5,3,6].map(dot => <button key={dot} aria-pressed={brailleDots.includes(dot)}
            onClick={() => setBrailleDots(p => p.includes(dot) ? p.filter(v => v !== dot) : [...p,dot])}>
            {dot}
          </button>)}
          <button disabled={!brailleDots.length} onClick={() => {setInput(v => v + unicodeBraille(brailleDots));setBrailleDots([]);}}>Add cell</button>
          <button onClick={() => setInput(v => v + ' ')}>Space</button>
          <button aria-label="Backspace" onClick={() => setInput(v => v.slice(0,-1))}><Delete size={16}/></button>
        </div>}
        {typeReverse && course.id === 'morse' && <div className="morse-keypad">
          <button onClick={() => setInput(v => v + '.')}>· Dit</button><button onClick={() => setInput(v => v + '-')}>− Dah</button>
          <button onClick={() => setInput(v => v + ' ')}>Next letter</button><button onClick={() => setInput(v => v.trimEnd() + ' / ')}>Space</button>
          <button aria-label="Backspace" onClick={() => setInput(v => v.slice(0,-1))}><Delete size={17}/></button>
        </div>}
        <div className="type-output">
          <div className="output-header"><strong>{typeReverse ? 'DECODED TEXT' : 'OUTPUT'}</strong><div className="output-buttons">
            {prefs.audioEnabled && <button onClick={() => void playMorse(typeReverse ? output : input)}><Volume2 size={16}/> Play Morse</button>}
            <button onClick={() => void copyOutput()}><Copy size={16}/>{copied ? 'Copied' : 'Copy'}</button></div></div>
          <div className="type-output-content">{typeReverse ? <div className="decoded-text">{output || '…'}</div> : course.id === 'morse'
            ? <div className="morse-text">{output.replaceAll('.', '·').replaceAll('-', '−')}</div>
            : <div className="type-sequence">{[...input.toUpperCase()].slice(0,50).map((ch,i) => ch === ' ' ? <span key={i} className="word-gap"/> : course.id === 'braille'
              ? <span className="type-cell" key={i}>{brailleFor(ch)?.map((dots,j) => <BrailleCell key={j} dots={dots}/>) ?? '?'}</span>
              : /^[A-Z]$/.test(ch) ? <SymbolVisual key={i} course="asl" card={courseById.asl.cards.find(c => c.label === ch)!} compact/> : <span key={i}>·</span>)}</div>}
          </div>
        </div>
        <p className="type-hint">{course.id === 'asl' ? 'ASL is a full language; this mode teaches fingerspelling only. J and Z require movement.' : course.id === 'braille' ? 'Visual six-dot Braille; no tactile feedback, contractions or capitalization marks in encoding.' : 'Morse audio is synthesized locally. Enable Audio above to listen.'}</p>
      </>}
    </main>
    <footer className="app-footer"><span role="status" aria-live="polite">{
      offlineStatus === 'ready' ? (isOnline ? 'Saved for offline use' : 'Offline mode · ready')
      : offlineStatus === 'preparing' ? 'Preparing offline files…'
      : 'Offline files unavailable · reconnect to install'
    } · Progress saved on this device</span>{latest && <span>{pastSessions.length} tests logged</span>}</footer>
    {settings && <div className="modal-backdrop" onMouseDown={e => {if(e.target === e.currentTarget) setSettings(false);}}><section className="modal" role="dialog" aria-modal="true" aria-label="Settings"><div className="modal-top"><h2>Settings & progress</h2><button className="icon-button" onClick={() => setSettings(false)} aria-label="Close"><X size={18}/></button></div>
      <p>All learning data is saved locally. No account or backend is required.</p>
      <p><strong>{totalMastered} mastered</strong> in {course.name} · {pastSessions.length} saved tests</p>
      {latest && <p>Most recent: {latest.unit}, {latest.direction} · {latest.metrics.accuracy}% accuracy · {latest.metrics.averageSeconds}s average.</p>}
      <p className="small-print">ASL covers fingerspelling, not ASL grammar or vocabulary. Braille is a visual introduction and does not replace tactile reading. Test word lists omit moving ASL letters J and Z.</p>
      <nav className="learning-links" aria-label="Learning guides">
        <a href="/learn/asl.html">ASL alphabet guide</a>
        <a href="/learn/braille.html">Braille alphabet guide</a>
        <a href="/learn/morse.html">Morse code guide</a>
      </nav>
      <button className="danger-button" onClick={clearData}>Delete saved progress</button>
    </section></div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

