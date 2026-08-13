import { describe, it, expect, afterEach } from 'vitest';
import { screenFromPath, pathForScreen } from './routes';
import { FEATURES, applyServerFeatures } from './features';
import { UNASSIGNED_DECK, cardInDeck } from './data/initialData';

describe('flashcards URLs round-trip their ids', () => {
  const roundTrip = (screen, params) => {
    const url = pathForScreen(screen, null, params);
    const [pathname, search] = url.split('?');
    return { url, parsed: screenFromPath(pathname, search ? `?${search}` : '') };
  };

  it('keeps the deck a study session was started for', () => {
    const { url, parsed } = roundTrip('flashcards-study', { studyDeckId: 'deck-7' });
    expect(url).toBe('/flashcards/study?deck=deck-7');
    expect(parsed).toMatchObject({ screen: 'flashcards-study', deckId: 'deck-7' });
  });

  it('keeps the unassigned bucket', () => {
    const { parsed } = roundTrip('flashcards-study', { studyDeckId: UNASSIGNED_DECK });
    expect(parsed.deckId).toBe(UNASSIGNED_DECK);
  });

  it('keeps the card the editor is editing', () => {
    const { url, parsed } = roundTrip('flashcards-editor', { editorCardId: 'card-1' });
    expect(url).toBe('/flashcards/editor?card=card-1');
    expect(parsed).toMatchObject({ screen: 'flashcards-editor', cardId: 'card-1' });
  });

  it('keeps the preselected deck for a brand-new card', () => {
    const { parsed } = roundTrip('flashcards-editor', { editorPresetDeckId: 'deck-3' });
    expect(parsed).toMatchObject({ cardId: null, deckId: 'deck-3' });
  });

  it('escapes ids that need it', () => {
    const { parsed } = roundTrip('flashcards-study', { studyDeckId: 'a b&c=d' });
    expect(parsed.deckId).toBe('a b&c=d');
  });

  it('leaves the plain screens alone', () => {
    expect(pathForScreen('flashcards', null, {})).toBe('/flashcards');
    expect(pathForScreen('dashboard', null, {})).toBe('/dashboard');
    expect(pathForScreen('detail', 'p1', {})).toBe('/problems/p1');
    expect(screenFromPath('/problems/p1')).toMatchObject({ screen: 'detail', id: 'p1' });
    expect(screenFromPath('/revise/x')).toMatchObject({ screen: 'revise' });
  });

  it('reads a study URL with no deck as "everything"', () => {
    expect(screenFromPath('/flashcards/study')).toMatchObject({
      screen: 'flashcards-study',
      deckId: null,
    });
  });
});

describe('applyServerFeatures', () => {
  afterEach(() => {
    FEATURES.flashcards = true;
  });

  it('turns a feature off when the API says it is off', () => {
    applyServerFeatures({ flashcards: false });
    expect(FEATURES.flashcards).toBe(false);
  });

  it('leaves flags alone when the API agrees, is silent, or is unreachable', () => {
    applyServerFeatures({ flashcards: true });
    expect(FEATURES.flashcards).toBe(true);
    applyServerFeatures({});
    expect(FEATURES.flashcards).toBe(true);
    applyServerFeatures(null);
    expect(FEATURES.flashcards).toBe(true);
  });

  it('cannot turn a build-time-disabled feature back on', () => {
    FEATURES.flashcards = false;
    applyServerFeatures({ flashcards: true });
    expect(FEATURES.flashcards).toBe(false);
  });
});

describe('cardInDeck', () => {
  const inDeck = { deckId: 'd1' };
  const loose = { deckId: null };

  it('matches a real deck id', () => {
    expect(cardInDeck(inDeck, 'd1')).toBe(true);
    expect(cardInDeck(loose, 'd1')).toBe(false);
  });

  it('treats the unassigned id as "cards with no deck"', () => {
    expect(cardInDeck(loose, UNASSIGNED_DECK)).toBe(true);
    expect(cardInDeck(inDeck, UNASSIGNED_DECK)).toBe(false);
  });

  it('matches everything when no deck is given', () => {
    expect(cardInDeck(inDeck, null)).toBe(true);
    expect(cardInDeck(loose, undefined)).toBe(true);
  });
});
