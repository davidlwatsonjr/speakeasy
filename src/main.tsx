import '@fontsource-variable/dm-sans/wght.css';
import '@fontsource-variable/outfit/wght.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Clock3, Copy, Delete, Hand, Keyboard, Link2, RotateCcw, Settings2, Shuffle, Star, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { BrailleCell, SymbolVisual } from './components/SymbolVisual';
import { brailleFor, courseById, courses, translateText, unicodeBraille, type CourseId } from './data/courses';
import { calculateMetrics, cardsFor, decodeBraille, decodeMorse, generateQuestions, matchesAnswer, shuffle, type Attempt, type Question, type TestDirection, type TestLength, type TestUnit } from './lib/practice';
import { playMorse, stopMorse } from './lib/audio';
import { addSession, initialPreferences, rateCard, readPreferences, storageKey, type AccessibilityPreferences } from './lib/storage';
import { cardIndex, formatDeepLink, parseDeepLink, type Mode, type DeckFilter } from './lib/deepLink';
import { describeSymbol, describeSequence, describeMorsePattern } from './lib/accessibility';
import './style.css';
type Phase = 'ready' | 'running' | 'finished';

function SymbolSequence({ course, text, mini = false }: { course: CourseId; text: string; mini?: boolean }) {
  if (course === 'morse') return <div className={mini ? 'sequence morse-sequence mini' : 'sequence morse-sequence'} role="img" aria-label={describeSequence(course,text)}>
    {[...text.toUpperCase()].map((ch, i) => <span key={i}>{translateText('morse', ch).replaceAll('.', '·').replaceAll('-', '−')}</span>)}
  </div>;
  return <div className={mini ? 'sequence mini' : 'sequence'} role="img" aria-label={describeSequence(course,text)}>
    {[...text.toUpperCase()].map((ch, i) => {
      const card = courseById[course].cards.find(c => c.label === ch);
      return card ? <SymbolVisual key={i} course={course} card={card} compact /> : <span key={i} className="unknown">?</span>;
    })}
  </div>;
}

function App() {
  const [initial] = useState(() => {
    const saved = readPreferences();
    return {saved, route: parseDeepLink(window.location.search, saved.course)};
  });
  const [prefs, setPrefs] = useState<ReturnType<typeof readPreferences>>(() => ({...initial.saved, course:initial.route.course}));
  const [mode, setMode] = useState<Mode>(initial.route.mode);
  const [filter, setFilter] = useState<DeckFilter>(initial.route.filter);
  const [reverse, setReverse] = useState(initial.route.reverse);
  const [randomDeck, setRandomDeck] = useState(false);
  const [deckIndex, setDeckIndex] = useState(cardIndex(initial.route));
  const [revealed, setRevealed] = useState(false);
  const [unit, setUnit] = useState<TestUnit>(initial.route.unit);
  const [direction, setDirection] = useState<TestDirection>(initial.route.direction);
  const [length, setLength] = useState<TestLength>(initial.saved.accessibility.untimed && !new URLSearchParams(window.location.search).has('length') ? '10' : initial.route.length);
  const [phase, setPhase] = useState<Phase>('ready');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [remaining, setRemaining] = useState(60);
  const [input, setInput] = useState(initial.route.typeReverse ? '' : 'HELLO WORLD');
  const [typeReverse, setTypeReverse] = useState(initial.route.typeReverse);
  const [brailleDots, setBrailleDots] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [settings, setSettings] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const studyRef = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState('');
  const startRef = useRef<HTMLButtonElement>(null);
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
  const a11y = prefs.accessibility;
  const effectiveLength = a11y.untimed ? '10' : length;
  const speak = (message: string) => playMorse(message,a11y.wpm,a11y.volume);
  function updateAccessibility<K extends keyof AccessibilityPreferences>(key: K, value: AccessibilityPreferences[K]) {
    stopMorse();
    if (key === 'untimed' && value === true) { resetTest(); setLength('10'); }
    setPrefs(p => ({...p,accessibility:{...p.accessibility,[key]:value}}));
  }
  const deepLink = formatDeepLink({course: course.id, mode, filter, card: current?.label, reverse, unit, direction, length:effectiveLength, typeReverse});

  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(prefs)); } catch { /* private browsing */ } }, [prefs]);
  useEffect(() => () => stopMorse(), []);
  // Course/mode changes are browser history entries; card advancement and
  // configuration changes update the current entry instead of flooding Back.
  useEffect(() => {
    if (window.location.search === deepLink) return;
    const previous = parseDeepLink(window.location.search, course.id);
    const url = window.location.pathname + deepLink;
    if (previous.course !== course.id || previous.mode !== mode) window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  }, [deepLink, course.id, mode]);
  useEffect(() => {
    const restoreLink = () => {
      const route = parseDeepLink(window.location.search, readPreferences().course);
      resetTest();
      setPrefs(p => ({...p, course: route.course}));
      setMode(route.mode); setFilter(route.filter); setReverse(route.reverse);
      setRandomDeck(false); setDeckIndex(cardIndex(route)); setRevealed(false);
      setUnit(route.unit); setDirection(route.direction); setLength(route.length);
      setTypeReverse(route.typeReverse); setInput(route.typeReverse ? '' : 'HELLO WORLD');
      setBrailleDots([]); setSettings(false);
    };
    window.addEventListener('popstate', restoreLink);
    return () => window.removeEventListener('popstate', restoreLink);
  }, []);
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
    if (phase !== 'running' || effectiveLength === '10') return;
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((beganAt.current + Number(effectiveLength) * 1000 - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) finishTest();
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase, effectiveLength]);

  useEffect(() => {
    if (phase !== 'finished' || saveCompleted.current || !beganAt.current) return;
    saveCompleted.current = true;
    stopMorse();
    if (attempts.length) {
      const result = calculateMetrics(attempts, Math.max(1, (endedAt.current - beganAt.current) / 1000));
      setPrefs(p => ({...p, sessions: addSession(p.sessions, {
        id: Date.now(), course: p.course, unit, direction, length:effectiveLength, metrics: result
      })}));
    }
  }, [phase, attempts, effectiveLength, remaining, unit, direction]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (settings && !dialog.open) dialog.showModal();
    if (!settings && dialog.open) { stopMorse(); dialog.close(); settingsTrigger.current?.focus(); }
  }, [settings]);
  useEffect(() => {
    if (mode !== 'test' || settings) return;
    if (phase === 'running') { if (answer !== null) nextRef.current?.focus(); else promptRef.current?.focus(); }
    if (phase === 'finished') resultRef.current?.focus();
  }, [mode, phase, questionIndex, answer]);
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
    studyRef.current?.focus();
  }
  function beginTest() {
    const generated = generateQuestions(course.id, unit, direction, effectiveLength === '10' ? 10 : 120);
    setQuestions(generated); setQuestionIndex(0); setAnswer(null); setTypedAnswer('');
    setAttempts([]); beganAt.current = Date.now(); questionAt.current = Date.now();
    saveCompleted.current = false; endedAt.current = 0; setRemaining(effectiveLength === '10' ? 0 : Number(effectiveLength)); setPhase('running');
    if (prefs.audioEnabled && generated[0]) void speak(generated[0].answer);
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
    if (prefs.audioEnabled) void speak(next.answer);
  }
  function updateAudio() {
    setPrefs(p => ({...p, audioEnabled: !p.audioEnabled}));
    if (prefs.audioEnabled) stopMorse();
    else {
      const message = mode === 'test' && phase === 'running' ? active?.answer : mode === 'study' ? current?.label : mode === 'type' ? (typeReverse ? output : input) : undefined;
      if (message) void speak(message);
    }
  }
  function clearData() {
    if (!window.confirm('Delete local study progress, favorites, and test history on this device?')) return;
    setPrefs({...initialPreferences, course: prefs.course, accessibility:a11y}); resetTest(); setSettings(false);
  }
  async function shareCurrentView() {
    const url = new URL(deepLink, window.location.origin + '/').href;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true); setNotice('Learning link copied.');
      window.setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      window.prompt('Copy this SpeakEasy link:', url);
    }
  }
  async function copyOutput() {
    try { await navigator.clipboard.writeText(output); setCopied(true); setNotice('Output copied.'); window.setTimeout(() => setCopied(false), 1200); }
    catch { setCopied(false); }
  }
  useEffect(() => {
    if (!prefs.audioEnabled || mode !== 'study' || !current) return;
    void speak(current.label);
    return () => stopMorse();
  }, [course.id, current?.id, mode, prefs.audioEnabled, a11y.wpm, a11y.volume]);

  return <div className={`app${a11y.contrast ? ' enhanced-contrast' : ''}${a11y.large ? ' large-controls' : ''}${a11y.reduceMotion ? ' reduced-motion' : ''}`}>
    <a className="skip-link" href="#learning-stage">Skip to learning activity</a>
    <span className="sr-only" role="status">{notice}</span>
    <header className="app-header">
      <div className="identity"><img src="/icons/icon-192.png" alt="" /><div><strong>Speak<em>Easy</em></strong><small>Learn a new way to communicate</small></div></div>
      <div className="header-right"><span className="mastered" role="img" aria-label={`${totalMastered} of ${cards.length} cards mastered`}><Trophy size={15}/> {totalMastered}/{cards.length}</span><button className="icon-button" onClick={() => void shareCurrentView()} aria-label={linkCopied ? 'Link copied' : 'Copy link to current view'} title={linkCopied ? 'Link copied' : 'Copy link to current view'}>{linkCopied ? <Check size={19}/> : <Link2 size={19}/>}</button><button ref={settingsTrigger} className="icon-button" onClick={() => setSettings(true)} aria-label="Settings" aria-haspopup="dialog"><Settings2 size={19}/></button></div>
    </header>
    <nav className="course-tabs" aria-label="Select language">
      {courses.map(c => <button key={c.id} aria-pressed={c.id === course.id} className={c.id === course.id ? 'active' : ''} onClick={() => switchCourse(c.id)}>
        {c.id === 'asl' ? <Hand size={17}/> : c.id === 'braille' ? <span className="braille-mark">⠿</span> : <span className="morse-mark">·−</span>}{c.id === 'asl' ? 'ASL' : c.name}
      </button>)}
    </nav>
    <nav className="mode-tabs" role="tablist" aria-label="Learning mode" onKeyDown={e => {
      const modes: Mode[] = ['study','test','type'];
      const index = modes.indexOf(mode);
      const next = e.key === 'ArrowRight' ? modes[(index + 1) % 3] : e.key === 'ArrowLeft' ? modes[(index + 2) % 3] : e.key === 'Home' ? modes[0] : e.key === 'End' ? modes[2] : undefined;
      if (next) { e.preventDefault(); switchMode(next); document.getElementById(`tab-${next}`)?.focus(); }
    }}>
      {([['study','Study',BookOpen],['test','Test',Trophy],['type','Type',Keyboard]] as const).map(([key,label,Icon]) => <button key={key} role="tab" id={`tab-${key}`} aria-controls="learning-panel" tabIndex={mode === key ? 0 : -1} aria-selected={mode === key} className={mode === key ? 'active' : ''} onClick={() => switchMode(key)}><Icon size={16}/>{label}</button>)}
    </nav>
    <main className="stage" id="learning-stage" tabIndex={-1}>
      <div className="learning-panel" role="tabpanel" id="learning-panel" aria-labelledby={`tab-${mode}`}>
      <div className="stage-head">
        <div className="stage-title"><h1>{mode === 'study' ? 'Flashcards' : mode === 'test' ? 'Test your recall' : 'Free-form typing'}</h1><small>{course.id === 'asl' ? 'ASL fingerspelling' : course.id === 'braille' ? 'Uncontracted Braille' : 'International Morse'}</small></div>
        {<button className={prefs.audioEnabled ? 'sound-toggle on' : 'sound-toggle'} aria-pressed={prefs.audioEnabled} onClick={updateAudio} title={prefs.audioEnabled ? 'Mute Morse playback' : 'Enable Morse audio in any course'}>
          {prefs.audioEnabled ? <Volume2 size={17}/> : <VolumeX size={17}/>} Morse {prefs.audioEnabled ? 'on' : 'off'}
        </button>}
      </div>

      {mode === 'study' && <>
        <div className="tools-row">
          <label className="select-control"><span className="sr-only">Study set</span><select aria-label="Study set" value={filter} onChange={e => switchFilter(e.target.value as DeckFilter)}>
            <option value="letters">A–Z</option>{course.id !== 'asl' && <option value="numbers">Numbers</option>}{course.id === 'morse' && <option value="punctuation">Punctuation</option>}
            <option value="all">All symbols</option><option value="starred">Favorites</option><option value="review">Review</option>
          </select><ChevronDown size={14}/></label>
          <button className="small-tool" onClick={() => {setReverse(v => !v); setRevealed(false);}} aria-pressed={reverse}><RotateCcw size={15}/> Reverse</button>
          <button className="small-tool" onClick={() => {setRandomDeck(v => !v); setDeckIndex(0); setRevealed(false);}} aria-pressed={randomDeck}><Shuffle size={15}/> {randomDeck ? 'Mixed' : 'Order'}</button>
          {prefs.audioEnabled && current && <button className="small-tool study-replay" aria-label="Replay Morse" title="Replay Morse" onClick={() => void speak(current.label)}><Volume2 size={16}/></button>}
        </div>
        {current ? <>
          <div className="progress-line" aria-live="polite"><span>{deckIndex % deck.length + 1} of {deck.length}</span><span>{reverse ? 'Character → symbol' : 'Symbol → character'}</span></div>
          <button ref={studyRef} className="study-card" onClick={() => setRevealed(v => !v)} onKeyDown={e => {if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {e.preventDefault();moveCard(e.key === 'ArrowLeft' ? -1 : 1);}}} aria-label={`${revealed ? 'Answer' : 'Question'}, ${(revealed !== reverse) ? current.label : describeSymbol(course.id,current.label)}. ${revealed ? 'Show question' : 'Reveal answer'}`}>
            <span className="card-caption">{revealed ? 'ANSWER' : 'TAP TO REVEAL'}</span>
            <div className="study-card-content">{(revealed !== reverse) ? <span className="large-character">{current.label}</span> : <SymbolVisual key={current.id} course={course.id} card={current} />}</div>
            <span className="card-caption bottom">{revealed ? (current.motion || 'Tap to return') : 'What does this represent?'}</span>
          </button>
          <div className="study-actions">
            <button className="square-action" onClick={() => moveCard(-1)} aria-label="Previous"><ArrowLeft size={20}/></button>
            <button className={prefs.starred.includes(current.id) ? 'square-action starred' : 'square-action'} onClick={() => setPrefs(p => ({...p,starred:p.starred.includes(current.id)?p.starred.filter(id => id !== current.id):[...p.starred,current.id]}))} aria-label="Favorite" aria-pressed={prefs.starred.includes(current.id)}><Star size={19} fill={prefs.starred.includes(current.id) ? 'currentColor' : 'none'}/></button>
            {revealed ? <><button className="secondary-action" onClick={() => gradeCard(false)}>Again</button><button className="primary-action" onClick={() => gradeCard(true)}><Check size={17}/> Got it</button></> : <button className="primary-action" onClick={() => {setRevealed(true);studyRef.current?.focus();}}>Reveal</button>}
            <button className="square-action" onClick={() => moveCard(1)} aria-label="Next"><ArrowRight size={20}/></button>
          </div>
        </> : <div className="empty"><Star size={26}/><p>No cards in this set yet.</p><button onClick={() => switchFilter('letters')}>All letters</button></div>}
      </>}

      {mode === 'test' && phase === 'ready' && <>
        <div className="test-config">
          <label>Content<select value={unit} onChange={e => setUnit(e.target.value as TestUnit)}><option value="letter">Letters</option><option value="word">Words</option></select></label>
          <label>Direction<select value={direction} onChange={e => setDirection(e.target.value as TestDirection)}><option value="decode">Read symbols</option><option value="encode">Pick symbols</option></select></label>
          <label>Session<select disabled={a11y.untimed} value={effectiveLength} onChange={e => setLength(e.target.value as TestLength)}><option value="10">10 questions (untimed)</option><option value="60">60 seconds</option><option value="180">3 minutes</option></select></label>
        </div>
        <div className="ready-hero"><Clock3 size={38}/><h2>Ready when you are.</h2><p>{unit === 'letter' ? 'Match individual characters.' : 'Read or recognize complete words.'} {direction === 'decode' ? 'Identify what the symbols mean.' : 'Choose the correct symbols.'}</p></div>
        {latest && <p className="prior-score">Last {latest.unit} test · {latest.metrics.accuracy}% accuracy{!a11y.accuracyOnly && ` · ${latest.metrics.correctPerMinute} correct/min`}</p>}
        <button ref={startRef} className="primary-action full" onClick={beginTest}>Start test <ArrowRight size={18}/></button>
      </>}

      {mode === 'test' && phase === 'running' && active && <>
        <div className="progress-line"><span>{unit === 'letter' ? 'LETTER' : 'WORD'} · Question {questionIndex + 1}</span><span>{effectiveLength === '10' ? `${attempts.length}/10` : `${remaining}s`}</span></div>
        <div className="meter" aria-hidden="true"><span style={{width: `${effectiveLength === '10' ? attempts.length * 10 : (Number(effectiveLength) - remaining)/Number(effectiveLength)*100}%`}}/></div>
        <div className="question-prompt" ref={promptRef} tabIndex={-1} role="group" aria-label={`Question ${questionIndex + 1}: ${direction === 'decode' ? describeSequence(course.id,active.answer) : active.answer}. ${direction === 'decode' ? 'Identify the symbols' : 'Choose matching symbols'}`}>
          <small>{direction === 'decode' ? 'WHAT DOES THIS SAY?' : 'WHICH SYMBOLS MATCH?'}</small>
          <div className="question-display">{direction === 'decode'
            ? (unit === 'letter' ? <SymbolVisual key={active.answer} course={course.id} card={cardsFor(course.id,active.answer)[0]}/> : <SymbolSequence course={course.id} text={active.answer}/>)
            : <span className="large-character word">{active.answer}</span>}
          </div>
          {prefs.audioEnabled && <button className="replay" onClick={() => void speak(active.answer)}><Volume2 size={16}/> Replay</button>}
        </div>
        {unit === 'word' && direction === 'decode' ? <form className="word-entry" onSubmit={e => {e.preventDefault(); submitAnswer(typedAnswer);}}>
          <input aria-label="Type the word" placeholder="Type the word…" autoCapitalize="characters" autoComplete="off" spellCheck={false} disabled={answer !== null} value={typedAnswer} onChange={e => setTypedAnswer(e.target.value.toUpperCase().replace(/[^A-Z]/g,''))} maxLength={12}/>
          {answer === null && <button type="submit" className="primary-action" disabled={!typedAnswer.trim()}>Check</button>}
        </form> : <div className={unit === 'letter' ? 'options' : 'options word-options'} role="group" aria-label="Answer choices" onKeyDown={e=>{if(/^[1-4]$/.test(e.key)&&answer===null){e.preventDefault();const choice=answerOptions[Number(e.key)-1];if(choice)submitAnswer(choice);}}}>
          {answerOptions.map((choice,index) => <button key={choice} aria-label={`Option ${index+1}: ${direction === 'encode' ? describeSequence(course.id,choice) : choice}${answer !== null ? choice === active.answer ? ', correct' : choice === answer ? ', incorrect' : '' : ''}`} disabled={answer !== null} onClick={() => submitAnswer(choice)} className={answer !== null && choice === active.answer ? 'correct' : answer === choice ? 'incorrect' : ''}>
            {direction === 'encode' ? <SymbolSequence course={course.id} text={choice} mini={unit === 'word'}/> : choice}
            {answer !== null && choice === active.answer && <Check size={16}/>} {answer === choice && choice !== active.answer && <X size={16}/>}
          </button>)}
        </div>}
        <div className="test-bottom">
          {answer !== null ? <><span aria-live="polite" className={testCorrect ? 'feedback right' : 'feedback wrong'}>{testCorrect ? 'Correct!' : `Answer: ${active.answer}`}</span><button ref={nextRef} className="primary-action" onClick={() => {if (effectiveLength === '10' && questionIndex + 1 >= 10) finishTest(); else nextQuestion();}}>Next <ArrowRight size={17}/></button></>
            : <><span className="subtle">{prefs.audioEnabled ? 'Morse audio is an optional clue.' : 'First answer counts toward your grade.'}</span><button className="text-action" onClick={finishTest}>End test</button></>}
        </div>
      </>}

      {mode === 'test' && phase === 'finished' && <>
        <div className="result-hero" ref={resultRef} tabIndex={-1} role="group" aria-label={`Test complete. ${metrics.accuracy} percent accuracy. ${metrics.correct} correct of ${metrics.answered}.`}><Trophy size={40}/><h2>{metrics.accuracy}%</h2><p>{metrics.correct} correct out of {metrics.answered}</p></div>
        {!a11y.accuracyOnly && <div className="result-grid"><div><strong>{metrics.averageSeconds}s</strong><small>avg / answer</small></div><div><strong>{metrics.correctPerMinute}</strong><small>correct / min</small></div><div><strong>{metrics.charactersPerMinute}</strong><small>characters / min</small></div></div>}
        <p className="result-note">Results are saved on this device. {a11y.accuracyOnly ? 'Accuracy includes mistakes.' : 'Speed measures correct answers per elapsed minute; accuracy includes mistakes.'}</p>
        <div className="result-actions"><button className="secondary-action" onClick={() => {setPhase('ready');requestAnimationFrame(()=>startRef.current?.focus());}}>Change settings</button><button className="primary-action" onClick={beginTest}>Try again <ArrowRight size={18}/></button></div>
      </>}

      {mode === 'type' && <>
        <div className="type-toolbar">
          {course.id !== 'asl' ? <div className="segmented"><button aria-pressed={!typeReverse} className={!typeReverse ? 'active' : ''} onClick={() => {setTypeReverse(false);setInput('HELLO WORLD');setBrailleDots([]);}}>Encode</button><button aria-pressed={typeReverse} className={typeReverse ? 'active' : ''} onClick={() => {setTypeReverse(true);setInput('');setBrailleDots([]);}}>Decode</button></div> : <span className="subtle">Finger-spell any message</span>}
          <button className="small-tool" onClick={() => setInput('')}>Clear <X size={15}/></button>
        </div>
        <label className="type-label" htmlFor="free-input">{typeReverse ? course.id === 'morse' ? 'Morse input (spaces between letters, / between words)' : 'Paste Braille Unicode cells' : 'Your text'}</label>
        <textarea id="free-input" rows={2} value={input} onChange={e => setInput(e.target.value.slice(0,120))} maxLength={120} placeholder={typeReverse ? course.id === 'morse' ? '.... . .-.. .-.. ---' : '⠓⠑⠇⠇⠕' : 'Type anything…'} spellCheck={false}/>
        {typeReverse && course.id === 'braille' && <div className="braille-keypad" role="group" aria-label="Braille cell input">
          {[1,4,2,5,3,6].map(dot => <button key={dot} aria-label={`Dot ${dot}`} aria-pressed={brailleDots.includes(dot)}
            onClick={() => setBrailleDots(p => p.includes(dot) ? p.filter(v => v !== dot) : [...p,dot])}>
            {dot}
          </button>)}
          <button disabled={!brailleDots.length} onClick={() => {setInput(v => v + unicodeBraille(brailleDots));setBrailleDots([]);}}>Add cell</button>
          <button onClick={() => setInput(v => v + ' ')}>Space</button>
          <button aria-label="Backspace" onClick={() => setInput(v => v.slice(0,-1))}><Delete size={16}/></button>
        </div>}
        {typeReverse && course.id === 'morse' && <div className="morse-keypad" role="group" aria-label="Morse input keypad">
          <button onClick={() => setInput(v => v + '.')}>· Dit</button><button onClick={() => setInput(v => v + '-')}>− Dah</button>
          <button onClick={() => setInput(v => v + ' ')}>Next letter</button><button onClick={() => setInput(v => v.trimEnd() + ' / ')}>Space</button>
          <button aria-label="Backspace" onClick={() => setInput(v => v.slice(0,-1))}><Delete size={17}/></button>
        </div>}
        <div className="type-output">
          <div className="output-header"><strong>{typeReverse ? 'DECODED TEXT' : 'OUTPUT'}</strong><div className="output-buttons">
            {prefs.audioEnabled && <button onClick={() => void speak(typeReverse ? output : input)}><Volume2 size={16}/> Play Morse</button>}
            <button onClick={() => void copyOutput()}><Copy size={16}/>{copied ? 'Copied' : 'Copy'}</button></div></div>
          <div className="type-output-content" role="region" aria-label="Translation output" tabIndex={0}>{typeReverse ? <div className="decoded-text">{output || '…'}</div> : course.id === 'morse'
            ? <div className="morse-text" role="img" aria-label={describeMorsePattern(output)}>{output.replaceAll('.', '·').replaceAll('-', '−')}</div>
            : <div className="type-sequence">{[...input.toUpperCase()].slice(0,50).map((ch,i) => ch === ' ' ? <span key={i} className="word-gap"/> : course.id === 'braille'
              ? <span className="type-cell" key={i}>{brailleFor(ch)?.map((dots,j) => <BrailleCell key={j} dots={dots}/>) ?? '?'}</span>
              : /^[A-Z]$/.test(ch) ? <SymbolVisual key={i} course="asl" card={courseById.asl.cards.find(c => c.label === ch)!} compact/> : <span key={i}>·</span>)}</div>}
          </div>
        </div>
        <p className="type-hint">{course.id === 'asl' ? 'ASL is a full language; this mode teaches fingerspelling only. J and Z require movement.' : course.id === 'braille' ? 'Visual six-dot Braille; no tactile feedback, contractions or capitalization marks in encoding.' : 'Morse audio is synthesized locally. Enable Audio above to listen.'}</p>
      </>}
      </div>
    </main>
    <footer className="app-footer"><span role="status" aria-live="polite">{
      offlineStatus === 'ready' ? (isOnline ? 'Saved for offline use' : 'Offline mode · ready')
      : offlineStatus === 'preparing' ? 'Preparing offline files…'
      : 'Offline files unavailable · reconnect to install'
    } · Progress saved on this device</span><a href="/learn/asl.html" className="footer-guide">Guides</a>{latest && <span>{pastSessions.length} tests logged</span>}</footer>
    <dialog ref={dialogRef} className="modal" aria-labelledby="settings-title" onCancel={e => {e.preventDefault();setSettings(false);}} onClick={e => {if(e.target === e.currentTarget) {const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)setSettings(false);}}}><div className="modal-top"><h2 id="settings-title">Settings & progress</h2><button className="icon-button" onClick={() => setSettings(false)} aria-label="Close"><X size={18}/></button></div>
      <p>All learning data is saved locally. No account or backend is required.</p>
      <p><strong>{totalMastered} mastered</strong> in {course.name} · {pastSessions.length} saved tests</p>
      {latest && <p>Most recent: {latest.unit}, {latest.direction} · {latest.metrics.accuracy}% accuracy{!a11y.accuracyOnly && ` · ${latest.metrics.averageSeconds}s average`}.</p>}
      <p className="small-print">ASL covers fingerspelling, not ASL grammar or vocabulary. Braille is a visual introduction and does not replace tactile reading. Test word lists omit moving ASL letters J and Z.</p>
      <fieldset className="accessibility-settings"><legend>Accessibility</legend>
        {([['contrast','Enhanced contrast'],['large','Larger text and controls'],['reduceMotion','Reduce motion'],['untimed','Untimed tests only'],['accuracyOnly','Show accuracy only']] as const).map(([key,label]) => <label className="setting-check" key={key}><input type="checkbox" checked={a11y[key]} onChange={e=>updateAccessibility(key,e.target.checked)}/>{label}</label>)}
        <label htmlFor="morse-wpm">Morse playback speed: {a11y.wpm} WPM</label><input id="morse-wpm" type="range" min={5} max={30} value={a11y.wpm} onChange={e=>updateAccessibility('wpm',Number(e.target.value))}/>
        <label htmlFor="morse-volume">Morse volume: {a11y.volume}%</label><input id="morse-volume" type="range" min={0} max={100} value={a11y.volume} onChange={e=>updateAccessibility('volume',Number(e.target.value))}/>
        <button className="secondary-action" onClick={()=>void speak('SOS')}>Preview Morse audio</button>
      </fieldset>
      <button className="secondary-action" onClick={() => void shareCurrentView()}><Link2 size={16}/> {linkCopied ? 'Link copied' : 'Copy link to current view'}</button>
      <nav className="learning-links" aria-label="Learning guides">
        <a href="/learn/asl.html">ASL alphabet guide</a>
        <a href="/learn/braille.html">Braille alphabet guide</a>
        <a href="/learn/morse.html">Morse code guide</a>
      </nav>
      <button className="danger-button" onClick={clearData}>Delete saved progress</button>
    </dialog>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

