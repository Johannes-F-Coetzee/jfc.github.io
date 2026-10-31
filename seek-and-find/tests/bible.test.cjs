const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

const SEEK_DIRECTORY = path.join(__dirname, "..");
const window = {};

runInNewContext(readFileSync(path.join(SEEK_DIRECTORY, "bible.js"), "utf8"), { window });

const bibleLogic = window.SeekBible;
const plain = value => JSON.parse(JSON.stringify(value));

function loadBible(translationId) {
  return bibleLogic.parseBibleText(readFileSync(path.join(SEEK_DIRECTORY, "bibles", `${translationId}.txt`), "utf8"));
}

const kingJames = loadBible("kjv");
const referenceOf = (bookName, chapter, verse) => ({
  bookIndex: bibleLogic.BOOKS.findIndex(book => book.name === bookName), chapter, verse
});

test("every translation holds the 66 books and about 31,100 verses", () => {
  for (const translation of bibleLogic.TRANSLATIONS) {
    const bible = loadBible(translation.id);

    assert.equal(bible.chapterCounts.filter(Boolean).length, 66, translation.id);
    assert.ok(bible.verses.length >= 31100 && bible.verses.length <= 31110, translation.id);
  }

  assert.equal(kingJames.chapterCounts[18], 150);
  assert.equal(bibleLogic.getVerseCount(kingJames, 18, 119), 176);
});

test("references parse from names, abbreviations and numbered books", () => {
  const parse = text => plain(bibleLogic.parseReference(text));

  assert.deepEqual(parse("John 3:16"), { bookIndex: 42, chapter: 3, verseStart: 16, verseEnd: 16 });
  assert.deepEqual(parse("jn3.16"), { bookIndex: 42, chapter: 3, verseStart: 16, verseEnd: 16 });
  assert.deepEqual(parse("1 Cor 13:4-7"), { bookIndex: 45, chapter: 13, verseStart: 4, verseEnd: 7 });
  assert.deepEqual(parse("I John 4"), { bookIndex: 61, chapter: 4, verseStart: null, verseEnd: null });
  assert.deepEqual(parse("Psalm 23"), { bookIndex: 18, chapter: 23, verseStart: null, verseEnd: null });
  assert.equal(parse("Isaiah").bookIndex, 22);
  assert.equal(parse("revel").bookIndex, 65);
  assert.equal(parse("the Lord is my shepherd"), null);
  assert.equal(parse("jo 3:1"), null);
});

test("passages resolve to a single verse, a range or a whole chapter", () => {
  const passageOf = text => bibleLogic.getPassage(kingJames, bibleLogic.parseReference(text));

  assert.equal(passageOf("John 3:16").length, 1);
  assert.match(passageOf("John 3:16")[0].text, /^For God so loved the world/);
  assert.equal(passageOf("Romans 8:28-30").length, 3);
  assert.equal(passageOf("Psalm 117").length, 2);
  assert.equal(passageOf("Genesis 99").length, 0);
});

test("word search needs every word, ignores case and punctuation, and lists phrase matches first", () => {
  const results = bibleLogic.searchWords(kingJames, "God SO loved the world");

  assert.equal(bibleLogic.formatReference(results[0]), "John 3:16");
  assert.deepEqual(plain(bibleLogic.searchWords(kingJames, "zzzxqj")), []);
  assert.deepEqual(plain(bibleLogic.searchWords(kingJames, "   ")), []);
});

test("a perfect guess scores 1000 and a guess in the wrong place scores less", () => {
  const answer = referenceOf("John", 3, 16);
  const perfect = bibleLogic.scoreGuess(kingJames, answer, answer);

  assert.equal(perfect.total, 1000);
  assert.equal(bibleLogic.describeScore(perfect.total), "Spot on!");
  assert.ok(bibleLogic.scoreGuess(kingJames, answer, referenceOf("John", 3, 17)).total < 1000);
  assert.ok(bibleLogic.scoreGuess(kingJames, answer, referenceOf("John", 3, 17)).total >= 900);
});

test("scores fall as the guess drifts from the verse, chapter and book", () => {
  const answer = referenceOf("John", 3, 16);
  const scoreOf = guess => bibleLogic.scoreGuess(kingJames, answer, guess).total;

  assert.ok(scoreOf(referenceOf("John", 3, 17)) > scoreOf(referenceOf("John", 3, 30)));
  assert.ok(scoreOf(referenceOf("John", 3, 30)) > scoreOf(referenceOf("John", 4, 16)));
  assert.ok(scoreOf(referenceOf("John", 4, 16)) > scoreOf(referenceOf("John", 20, 1)));
  assert.ok(scoreOf(referenceOf("John", 20, 1)) > scoreOf(referenceOf("Luke", 3, 16)));
  assert.ok(scoreOf(referenceOf("Luke", 3, 16)) > scoreOf(referenceOf("Matthew", 3, 16)));
  assert.ok(scoreOf(referenceOf("Matthew", 3, 16)) > scoreOf(referenceOf("Genesis", 3, 16)));
  assert.ok(scoreOf(referenceOf("Genesis", 3, 16)) <= 200);
});

test("scores never exceed 1000 or go below 0", () => {
  const answer = referenceOf("Psalms", 119, 176);

  for (const guess of [referenceOf("Genesis", 1, 1), referenceOf("Revelation", 22, 21), referenceOf("Psalms", 1, 1)]) {
    const { total } = bibleLogic.scoreGuess(kingJames, answer, guess);

    assert.ok(total >= 0 && total <= 1000);
  }
});

test("the testament filter limits candidates and random verses to the Old or New Testament", () => {
  const biblesByKey = new Map(bibleLogic.TRANSLATIONS.map(translation => [translation.id, loadBible(translation.id)]));
  const candidates = bibleLogic.searchAcrossTranslations(biblesByKey, bibleLogic.TRANSLATIONS, "in the beginning");
  const oldOnly = bibleLogic.filterByTestament(candidates, "old");
  const newOnly = bibleLogic.filterByTestament(candidates, "new");

  assert.ok(oldOnly.length > 0 && newOnly.length > 0);
  assert.ok(oldOnly.every(candidate => candidate.bookIndex < 39));
  assert.ok(newOnly.every(candidate => candidate.bookIndex >= 39));
  assert.equal(bibleLogic.filterByTestament(candidates, "all").length, candidates.length);
  assert.equal(oldOnly.length + newOnly.length, candidates.length);

  for (const randomValue of [0, 0.5, 0.9999999]) {
    assert.ok(bibleLogic.pickRandomVerse(kingJames, () => randomValue, "old").bookIndex < 39);
    assert.ok(bibleLogic.pickRandomVerse(kingJames, () => randomValue, "new").bookIndex >= 39);
  }
});

test("a random verse is long enough to be guessable", () => {
  assert.ok(bibleLogic.pickRandomVerse(kingJames, () => 0).text.length >= 60);
  assert.ok(bibleLogic.pickRandomVerse(kingJames, () => 0.9999999).text.length >= 60);
});

test("a search across all versions merges the same verse and ranks the closest first", () => {
  const biblesByKey = new Map(bibleLogic.TRANSLATIONS.map(translation => [translation.id, loadBible(translation.id)]));
  const candidates = bibleLogic.searchAcrossTranslations(biblesByKey, bibleLogic.TRANSLATIONS, "God so loved the world");

  assert.equal(bibleLogic.formatReference(candidates[0]), "John 3:16");
  assert.equal(candidates[0].closeness, 100);
  assert.equal(candidates[0].versions.length, 3);
  assert.ok(candidates.every((candidate, index) => index === 0 || candidates[index - 1].closeness >= candidate.closeness));
  assert.ok(new Set(candidates.map(candidate => bibleLogic.formatReference(candidate))).size === candidates.length);

  const partial = bibleLogic.searchAcrossTranslations(biblesByKey, bibleLogic.TRANSLATIONS, "God loved zzzxqj the world");

  assert.ok(partial.length > 0 && partial[0].closeness < 100);
  assert.equal(bibleLogic.searchAcrossTranslations(biblesByKey, bibleLogic.TRANSLATIONS, "zzzxqj").length, 0);
});

test("a reference lookup returns each verse once with every version", () => {
  const biblesByKey = new Map(bibleLogic.TRANSLATIONS.map(translation => [translation.id, loadBible(translation.id)]));
  const passage = bibleLogic.lookupAcrossTranslations(
    biblesByKey, bibleLogic.TRANSLATIONS, bibleLogic.parseReference("Romans 8:28-30")
  );

  assert.deepEqual(plain(passage.map(candidate => candidate.verse)), [28, 29, 30]);
  assert.ok(passage.every(candidate => candidate.versions.length === 3));
});

test("masked segments blur hidden words without keeping them", () => {
  const segments = plain(bibleLogic.maskVerseSegments("For God so loved the world", ["god", "world"]));

  assert.deepEqual(segments.map(segment => segment.hidden), [true, false, false, false, true, false, true, false, true, false, false]);
  assert.equal(segments.filter(segment => segment.hidden).map(segment => segment.text).join(" "), "eta et etaoi eta");
  assert.equal(segments.map(segment => segment.text).join("").length, "For God so loved the world".length);
  assert.ok(!JSON.stringify(segments).includes("loved"));
});

test("masking keeps the typed words and turns every other word into periods", () => {
  assert.equal(
    bibleLogic.maskVerseText("For God so loved the world, that he gave", ["god", "world"]),
    "... God .. ..... ... world, .... .. ...."
  );
  assert.equal(bibleLogic.maskVerseText("God’s sheep", ["gods"]), "God’s .....");
  assert.equal(bibleLogic.maskVerseText("The shepherds went", ["shepherd"]), "... shepherds ....");
  assert.equal(bibleLogic.maskVerseText("In the beginning", []), ".. ... .........");
});
