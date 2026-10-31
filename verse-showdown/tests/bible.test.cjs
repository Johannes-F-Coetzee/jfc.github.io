const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

const source = readFileSync(path.join(__dirname, "..", "bible.js"), "utf8");
const window = {};
runInNewContext(source, { window });
const { parseBibleText, parseReference, formatReference, searchVerses, searchAllTranslations, highlightMatchingWords, pickRandomVerse, scoreGuess } = window.VerseShowdownBible;
const kjv = parseBibleText(readFileSync(path.join(__dirname, "..", "bibles", "kjv.txt"), "utf8"));
const translations = ["kjv", "web", "asv", "ylt"].map(id => ({
  id,
  bible: id === "kjv" ? kjv : parseBibleText(readFileSync(path.join(__dirname, "..", "bibles", `${id}.txt`), "utf8"))
}));

function reference(input) {
  return parseReference(input, kjv);
}

function verseAt(input) {
  const { bookIndex, chapter, verse } = reference(input);

  return kjv.verses[kjv.verseIndexByReference.get(`${bookIndex}:${chapter}:${verse}`)];
}

test("parses every translation into 66 books and 31,102 verses", () => {
  for (const { id, bible } of translations) {
    assert.equal(bible.books.length, 66, id);
    assert.equal(bible.verses.length, 31102, id);
  }
});

test("searches every version and ranks verse groups by match percentage", () => {
  const ranked = searchAllTranslations(translations, "spirit of god fluttering");
  const bestGroup = ranked.groups[0];
  assert.equal(formatReference(kjv, bestGroup.matches[0].verse), "Genesis 1:2");
  assert.equal(bestGroup.matchPercent, 100);
  assert.equal(bestGroup.matches[0].translationId, "ylt");
  assert.equal(bestGroup.matches.slice(1).every(match => match.matchPercent === 75), true);
  const percents = [...ranked.groups.map(group => group.matchPercent)];
  assert.deepEqual(percents, [...percents].sort((first, second) => second - first));

  const byReference = searchAllTranslations(translations, "John 3:16");
  assert.deepEqual([...byReference.groups[0].matches.map(match => match.translationId)], ["kjv", "web", "asv", "ylt"]);

  const mixed = searchAllTranslations(translations, "formless", 500);
  const versions = new Set(mixed.groups.flatMap(group => group.matches.map(match => match.translationId)));
  assert.equal(versions.has("web"), true);
  const order = [...mixed.groups.map(group => kjv.verseIndexByReference.get(group.referenceKey))];
  assert.deepEqual(order, [...order].sort((first, second) => first - second));

  assert.match(searchAllTranslations(translations, "John 3:99").error, /36 verses/);
});

test("strips KJV italics brackets from verse text", () => {
  assert.equal(verseAt("Genesis 1:2").text.includes("["), false);
});

test("parses common reference forms", () => {
  assert.equal(formatReference(kjv, reference("John 3:16")), "John 3:16");
  assert.equal(formatReference(kjv, reference("jn 3 16")), "John 3:16");
  assert.equal(formatReference(kjv, reference("1 cor. 13.4")), "1 Corinthians 13:4");
  assert.equal(formatReference(kjv, reference("II Kings 2:11")), "2 Kings 2:11");
  assert.equal(formatReference(kjv, reference("Psalms 23")), "Psalm 23");
  assert.equal(formatReference(kjv, reference("song of songs 2:1")), "Song of Solomon 2:1");
  assert.equal(formatReference(kjv, reference("Jude 5")), "Jude 1:5");
  assert.equal(formatReference(kjv, reference("Isaiah 53:5")), "Isaiah 53:5");
  assert.equal(formatReference(kjv, reference("rev")), "Revelation");
});

test("reports unknown, ambiguous and out-of-range references", () => {
  assert.match(reference("Hezekiah 1:1").error, /not a book/);
  assert.match(reference("ju 1").error, /Judges, Jude/);
  assert.match(reference("John 22:1").error, /21 chapters/);
  assert.match(reference("John 3:99").error, /36 verses/);
  assert.match(reference("").error, /Enter a reference/);
});

test("searches by reference, chapter and words", () => {
  assert.equal(searchVerses(kjv, "John 3:16").verses[0].text.startsWith("For God so loved"), true);
  assert.equal(searchVerses(kjv, "Psalm 23").totalCount, 6);
  const wordResult = searchVerses(kjv, "God so loved", Infinity);
  assert.equal(wordResult.verses.some(verse => verse.chapter === 3 && verse.verse === 16), true);
  assert.equal(wordResult.matches.find(match => match.verse.chapter === 3 && match.verse.verse === 16).matchPercent, 100);
  assert.equal(wordResult.matches.some(match => match.matchPercent === 33), true);
  assert.match(searchVerses(kjv, "John 3:99").error, /36 verses/);
  assert.equal(searchVerses(kjv, "the", 10).verses.length, 10);
  assert.equal(searchVerses(kjv, "xyzzy").totalCount, 0);
});

test("highlights words that start with a search word, ignoring case and apostrophes", () => {
  const parts = [...highlightMatchingWords("For God’s love, they LOVED beloved ones.", "gods love")];
  const matchedWords = parts.filter(part => part.isMatch).map(part => part.text);
  assert.deepEqual([...matchedWords], ["God’s", "love,", "LOVED"]);
  assert.equal(parts.map(part => part.text).join(""), "For God’s love, they LOVED beloved ones.");
});

test("picks a random verse from the whole Bible", () => {
  assert.equal(formatReference(kjv, pickRandomVerse(kjv, () => 0)), "Genesis 1:1");
  assert.equal(formatReference(kjv, pickRandomVerse(kjv, () => 0.9999999)), "Revelation 22:21");
  assert.equal(formatReference(kjv, pickRandomVerse(kjv, () => 0.9999999, "old")), "Malachi 4:6");
  assert.equal(formatReference(kjv, pickRandomVerse(kjv, () => 0, "new")), "Matthew 1:1");
});

test("limits searches to the Old or New Testament", () => {
  const isOldTestament = group => Number(group.referenceKey.split(":")[0]) < 39;
  const oldResult = searchAllTranslations(translations, "love one another", Infinity, "old");
  const newResult = searchAllTranslations(translations, "love one another", Infinity, "new");
  const allResult = searchAllTranslations(translations, "love one another", Infinity);

  assert.equal(oldResult.groups.every(isOldTestament), true);
  assert.equal(newResult.groups.every(group => !isOldTestament(group)), true);
  assert.equal(oldResult.totalCount + newResult.totalCount, allResult.totalCount);
  assert.match(searchAllTranslations(translations, "John 3:16", 5, "old").error, /John is not in the Old Testament/);
  assert.equal(searchAllTranslations(translations, "Genesis 1:1", 5, "old").totalCount, 1);
});

test("scores guesses out of 1000 by closeness", () => {
  const answer = verseAt("John 3:16");
  const score = input => scoreGuess(kjv, input === null ? null : reference(input), answer).score;

  assert.equal(score("John 3:16"), 1000);
  assert.equal(score("John 3:17"), 992);
  assert.equal(score("John 3"), 739);
  assert.equal(score("John 4:16"), 713);
  assert.equal(score("John"), 444);
  assert.equal(score("Luke 3:16"), 133);
  assert.equal(score("Acts 3:16"), 142);
  assert.equal(score("Mark 3:16"), 110);
  assert.equal(score("Genesis 1:1"), 0);
  assert.equal(score(null), 0);
  assert.ok(score("John 3:36") > score("John 4:1"));
});

test("weights book, chapter, verse and word distance evenly at 250 points each", () => {
  const answer = verseAt("John 3:16");
  const breakdown = input => scoreGuess(kjv, reference(input), answer);

  const perfect = breakdown("John 3:16");
  assert.deepEqual(
    [perfect.bookPoints, perfect.chapterPoints, perfect.versePoints, perfect.wordPoints, perfect.wordDistance],
    [250, 250, 250, 250, 0]
  );

  const nextVerse = breakdown("John 3:17");
  assert.equal(nextVerse.wordDistance, verseAt("John 3:16").text.split(/\s+/).length);
  assert.equal(nextVerse.wordPoints, 249);

  const otherBook = breakdown("Acts 3:16");
  assert.equal(otherBook.wordDistance, 19289);
  assert.equal(otherBook.wordPoints, 17);
  assert.equal(breakdown("Genesis 1:1").wordPoints, 0);

  const wholeBook = breakdown("John");
  assert.equal(wholeBook.wordDistance, verseAt("John 3:16").wordOffset - verseAt("John 1:1").wordOffset);
});
