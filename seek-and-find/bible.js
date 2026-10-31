// Bible data helpers for Seek & Find: parsing the plain-text Bible files in bibles/, looking up and searching verses,
// parsing typed references, and scoring a guessed reference out of 1000. Pure logic with no DOM access.
(() => {
  "use strict";

  const SCORE_TOTAL = 1000;
  const SCORE_BOOK_EXACT = 400;
  const SCORE_BOOK_NEARBY_MAX = 200;
  const SCORE_CHAPTER_MAX = 300;
  const SCORE_VERSE_MAX = 300;
  const MINIMUM_RANDOM_VERSE_LENGTH = 60;
  const FILLER_WORDS = new Set(["a", "an", "and", "the", "of", "to", "in", "for", "he", "it", "is", "that", "with", "my", "me"]);
  const FIRST_NEW_TESTAMENT_BOOK_INDEX = 39;
  const FILLER_LETTERS = "etaoinshrdlu";
  const VERSE_LINE_PATTERN = /^([0-9A-Z]{3}) (\d+):(\d+) (.*)$/;
  const REFERENCE_PATTERN = /^(.+?)\s*(\d+)?\s*(?:[:.]\s*(\d+)\s*(?:[-–—]\s*(\d+))?)?$/;

  // [file code, name, extra lower-case aliases]. The order is the order of the Bible.
  const BOOK_DEFINITIONS = [
    ["GEN", "Genesis", "gen gn ge"],
    ["EXO", "Exodus", "exod ex"],
    ["LEV", "Leviticus", "lev lv le"],
    ["NUM", "Numbers", "num nm nu"],
    ["DEU", "Deuteronomy", "deut dt de"],
    ["JOS", "Joshua", "josh jsh"],
    ["JDG", "Judges", "judg jg"],
    ["RUT", "Ruth", "rth ru"],
    ["1SA", "1 Samuel", "1sam 1sm"],
    ["2SA", "2 Samuel", "2sam 2sm"],
    ["1KI", "1 Kings", "1kgs 1kin"],
    ["2KI", "2 Kings", "2kgs 2kin"],
    ["1CH", "1 Chronicles", "1chron 1chr"],
    ["2CH", "2 Chronicles", "2chron 2chr"],
    ["EZR", "Ezra", "ezr"],
    ["NEH", "Nehemiah", "neh ne"],
    ["EST", "Esther", "esth es"],
    ["JOB", "Job", "jb"],
    ["PSA", "Psalms", "psalm ps pss psa"],
    ["PRO", "Proverbs", "prov prv pr"],
    ["ECC", "Ecclesiastes", "eccl eccles ecc"],
    ["SOL", "Song of Solomon", "song songofsongs sos ss canticles"],
    ["ISA", "Isaiah", "isa is"],
    ["JER", "Jeremiah", "jer jr"],
    ["LAM", "Lamentations", "lam la"],
    ["EZE", "Ezekiel", "ezek eze"],
    ["DAN", "Daniel", "dan dn"],
    ["HOS", "Hosea", "hos ho"],
    ["JOE", "Joel", "jl"],
    ["AMO", "Amos", "am"],
    ["OBA", "Obadiah", "obad ob"],
    ["JON", "Jonah", "jnh"],
    ["MIC", "Micah", "mic mc"],
    ["NAH", "Nahum", "nah na"],
    ["HAB", "Habakkuk", "hab"],
    ["ZEP", "Zephaniah", "zeph zep"],
    ["HAG", "Haggai", "hag"],
    ["ZEC", "Zechariah", "zech zec"],
    ["MAL", "Malachi", "mal"],
    ["MAT", "Matthew", "matt mt"],
    ["MAR", "Mark", "mrk mk mr"],
    ["LUK", "Luke", "lk"],
    ["JOH", "John", "jn jhn"],
    ["ACT", "Acts", "ac"],
    ["ROM", "Romans", "rom ro rm"],
    ["1CO", "1 Corinthians", "1cor"],
    ["2CO", "2 Corinthians", "2cor"],
    ["GAL", "Galatians", "gal ga"],
    ["EPH", "Ephesians", "eph ephes"],
    ["PHI", "Philippians", "phil php pp"],
    ["COL", "Colossians", "col"],
    ["1TH", "1 Thessalonians", "1thess 1thes"],
    ["2TH", "2 Thessalonians", "2thess 2thes"],
    ["1TI", "1 Timothy", "1tim 1tm"],
    ["2TI", "2 Timothy", "2tim 2tm"],
    ["TIT", "Titus", "tit"],
    ["PHM", "Philemon", "philem phm"],
    ["HEB", "Hebrews", "heb"],
    ["JAM", "James", "jas jm"],
    ["1PE", "1 Peter", "1pet 1pt"],
    ["2PE", "2 Peter", "2pet 2pt"],
    ["1JO", "1 John", "1jn 1jhn"],
    ["2JO", "2 John", "2jn 2jhn"],
    ["3JO", "3 John", "3jn 3jhn"],
    ["JUD", "Jude", "jud"],
    ["REV", "Revelation", "revelations rev rv"]
  ];
  const BOOKS = BOOK_DEFINITIONS.map(([code, name]) => ({ code, name }));
  const BOOK_INDEX_BY_CODE = new Map(BOOKS.map((book, bookIndex) => [book.code, bookIndex]));
  const NORMALIZED_BOOK_NAMES = BOOKS.map(book => normalizeBookName(book.name));
  const BOOK_INDEX_BY_ALIAS = buildAliasIndex();
  const TRANSLATIONS = [
    { id: "kjv", name: "King James Version" },
    { id: "web", name: "World English Bible" },
    { id: "asv", name: "American Standard Version" }
  ];

  function normalizeBookName(text) {
    return text
      .toLowerCase()
      .replace(/^(first|1st|i)[\s.]+/, "1 ")
      .replace(/^(second|2nd|ii)[\s.]+/, "2 ")
      .replace(/^(third|3rd|iii)[\s.]+/, "3 ")
      .replace(/[^a-z0-9]/g, "");
  }

  function buildAliasIndex() {
    const aliasIndex = new Map();

    BOOK_DEFINITIONS.forEach(([code, name, aliases], bookIndex) => {
      const allAliases = [name, code, ...aliases.split(" ")];

      allAliases.forEach(alias => aliasIndex.set(normalizeBookName(alias), bookIndex));
    });

    return aliasIndex;
  }

  function findBookIndex(text) {
    const normalized = normalizeBookName(text);

    if (BOOK_INDEX_BY_ALIAS.has(normalized)) {
      return BOOK_INDEX_BY_ALIAS.get(normalized);
    }

    if (normalized.length < 3) {
      return -1;
    }

    const prefixMatches = NORMALIZED_BOOK_NAMES
      .map((name, bookIndex) => (name.startsWith(normalized) ? bookIndex : -1))
      .filter(bookIndex => bookIndex >= 0);

    return prefixMatches.length === 1 ? prefixMatches[0] : -1;
  }

  // Returns { bookIndex, chapter, verseStart, verseEnd } with null for any part not typed, or null when the text
  // does not start with a recognisable book name.
  function parseReference(text) {
    const match = REFERENCE_PATTERN.exec(text.trim());

    if (!match) {
      return null;
    }

    const bookIndex = findBookIndex(match[1]);

    if (bookIndex < 0) {
      return null;
    }

    const toNumber = value => (value === undefined ? null : Number(value));
    const verseStart = toNumber(match[3]);
    const verseEnd = toNumber(match[4]);

    return {
      bookIndex,
      chapter: toNumber(match[2]),
      verseStart,
      verseEnd: verseEnd === null ? verseStart : verseEnd
    };
  }

  function normalizeSearchText(text) {
    return text
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  // Builds the lookup structures for one translation from its plain-text file (lines like "JOH 3:16 For God so...").
  function parseBibleText(text) {
    const verses = [];
    const indexByKey = new Map();
    const verseCounts = new Map();
    const chapterCounts = BOOKS.map(() => 0);

    for (const line of text.split(/\r?\n/)) {
      const match = VERSE_LINE_PATTERN.exec(line);

      if (!match || !BOOK_INDEX_BY_CODE.has(match[1])) {
        continue;
      }

      const bookIndex = BOOK_INDEX_BY_CODE.get(match[1]);
      const chapter = Number(match[2]);
      const verse = Number(match[3]);
      const verseText = match[4].replace(/[[\]]/g, "");
      const chapterKey = `${bookIndex}:${chapter}`;

      indexByKey.set(`${chapterKey}:${verse}`, verses.length);
      verses.push({ bookIndex, chapter, verse, text: verseText, searchText: normalizeSearchText(verseText) });
      verseCounts.set(chapterKey, Math.max(verseCounts.get(chapterKey) || 0, verse));
      chapterCounts[bookIndex] = Math.max(chapterCounts[bookIndex], chapter);
    }

    return { verses, indexByKey, verseCounts, chapterCounts };
  }

  function formatReference(reference) {
    return `${BOOKS[reference.bookIndex].name} ${reference.chapter}:${reference.verse}`;
  }

  function getChapterCount(bible, bookIndex) {
    return bible.chapterCounts[bookIndex] || 0;
  }

  function getVerseCount(bible, bookIndex, chapter) {
    return bible.verseCounts.get(`${bookIndex}:${chapter}`) || 0;
  }

  function findVerse(bible, bookIndex, chapter, verse) {
    const index = bible.indexByKey.get(`${bookIndex}:${chapter}:${verse}`);

    return index === undefined ? null : bible.verses[index];
  }

  // Resolves a parsed reference to the verses it covers: a whole chapter, one verse, or a verse range.
  function getPassage(bible, reference) {
    if (reference.chapter === null) {
      return [];
    }

    const firstVerse = reference.verseStart === null ? 1 : reference.verseStart;
    const lastVerse = reference.verseStart === null
      ? getVerseCount(bible, reference.bookIndex, reference.chapter)
      : Math.max(reference.verseEnd, firstVerse);
    const passage = [];

    for (let verse = firstVerse; verse <= lastVerse; verse += 1) {
      const foundVerse = findVerse(bible, reference.bookIndex, reference.chapter, verse);

      if (foundVerse) {
        passage.push(foundVerse);
      }
    }

    return passage;
  }

  // Finds verses containing every word typed (ignoring case and punctuation); exact phrase matches come first.
  function searchWords(bible, query) {
    const normalizedQuery = normalizeSearchText(query);
    const words = normalizedQuery.split(" ").filter(Boolean);

    if (!words.length) {
      return [];
    }

    const phraseMatches = [];
    const wordMatches = [];

    for (const verse of bible.verses) {
      if (!words.every(word => verse.searchText.includes(word))) {
        continue;
      }

      if (verse.searchText.includes(normalizedQuery)) {
        phraseMatches.push(verse);
      } else {
        wordMatches.push(verse);
      }
    }

    return [...phraseMatches, ...wordMatches];
  }

  // Combines the same verse found in several translations into one candidate, best-matching translation first.
  function groupIntoCandidates(versionHits) {
    const candidatesByKey = new Map();

    for (const hit of versionHits) {
      const key = `${hit.verse.bookIndex}:${hit.verse.chapter}:${hit.verse.verse}`;

      if (!candidatesByKey.has(key)) {
        const { bookIndex, chapter, verse } = hit.verse;

        candidatesByKey.set(key, { bookIndex, chapter, verse, versions: [], closeness: 0 });
      }

      const candidate = candidatesByKey.get(key);

      candidate.versions.push({ translation: hit.translation, text: hit.verse.text, closeness: hit.closeness });
      candidate.closeness = Math.max(candidate.closeness, hit.closeness);
    }

    for (const candidate of candidatesByKey.values()) {
      candidate.versions.sort((first, second) => second.closeness - first.closeness);
    }

    return [...candidatesByKey.values()];
  }

  function sortCandidates(candidates) {
    return candidates.sort((first, second) => second.closeness - first.closeness
      || first.bookIndex - second.bookIndex
      || first.chapter - second.chapter
      || first.verse - second.verse);
  }

  // Percent closeness of a verse to the typed words: 100 for the exact phrase, otherwise the share of words found.
  function measureCloseness(verse, words, normalizedQuery) {
    if (verse.searchText.includes(normalizedQuery)) {
      return 100;
    }

    const matchedWordCount = words.filter(word => verse.searchText.includes(word)).length;

    return Math.round((matchedWordCount / words.length) * 90);
  }

  // Searches every translation at once and merges the hits into candidate verses ranked by closeness. A verse needs
  // at least half of the typed words (ignoring filler like "the") in some translation to be a candidate.
  function searchAcrossTranslations(biblesByKey, translations, query) {
    const normalizedQuery = normalizeSearchText(query);
    const allWords = normalizedQuery.split(" ").filter(Boolean);
    const meaningfulWords = allWords.filter(word => !FILLER_WORDS.has(word));
    const words = meaningfulWords.length ? meaningfulWords : allWords;
    const versionHits = [];

    if (!words.length) {
      return [];
    }

    for (const translation of translations) {
      for (const verse of biblesByKey.get(translation.id).verses) {
        const closeness = measureCloseness(verse, words, normalizedQuery);

        if (closeness >= 45) {
          versionHits.push({ translation, verse, closeness });
        }
      }
    }

    return sortCandidates(groupIntoCandidates(versionHits));
  }

  // Looks a typed reference up in every translation and merges the verses into candidates.
  function lookupAcrossTranslations(biblesByKey, translations, reference) {
    const versionHits = translations.flatMap(translation => getPassage(biblesByKey.get(translation.id), reference)
      .map(verse => ({ translation, verse, closeness: 100 })));

    return sortCandidates(groupIntoCandidates(versionHits)).sort((first, second) => first.chapter - second.chapter
      || first.verse - second.verse);
  }

  // Splits a verse into segments: typed words and punctuation stay as they are, and every other word becomes a
  // hidden segment holding same-length filler letters instead of the real word, so it can be blurred without leaking.
  function maskVerseSegments(text, typedWords) {
    const wanted = new Set(normalizeSearchText(typedWords.join(" ")).split(" ").filter(Boolean));
    const segments = [];
    let position = 0;

    const addSegment = (segmentText, hidden) => {
      if (segmentText) {
        segments.push({ text: segmentText, hidden });
      }
    };

    for (const match of text.matchAll(/[A-Za-z0-9'’]+/g)) {
      const word = match[0];
      const normalizedWord = normalizeSearchText(word);
      const isMatch = [...wanted].some(typedWord => normalizedWord === typedWord
        || (typedWord.length >= 4 && normalizedWord.includes(typedWord)));

      addSegment(text.slice(position, match.index), false);
      position = match.index + word.length;

      if (isMatch) {
        addSegment(word, false);
      } else {
        const letterCount = word.replace(/['’]/g, "").length;

        addSegment(Array.from({ length: letterCount }, (unused, index) => FILLER_LETTERS[index % FILLER_LETTERS.length]).join(""), true);
      }
    }

    addSegment(text.slice(position), false);

    return segments;
  }

  // Plain-text form of the same mask, with a period for each hidden letter.
  function maskVerseText(text, typedWords) {
    return maskVerseSegments(text, typedWords)
      .map(segment => (segment.hidden ? ".".repeat(segment.text.length) : segment.text))
      .join("");
  }

  function isInTestament(bookIndex, testament) {
    if (testament === "old") {
      return bookIndex < FIRST_NEW_TESTAMENT_BOOK_INDEX;
    }

    return testament === "new" ? bookIndex >= FIRST_NEW_TESTAMENT_BOOK_INDEX : true;
  }

  // Keeps only candidates from the whole Bible ("all"), the Old Testament ("old") or the New Testament ("new").
  function filterByTestament(candidates, testament) {
    return candidates.filter(candidate => isInTestament(candidate.bookIndex, testament));
  }

  function pickRandomVerse(bible, random = Math.random, testament = "all") {
    const candidates = bible.verses.filter(verse => verse.text.length >= MINIMUM_RANDOM_VERSE_LENGTH
      && isInTestament(verse.bookIndex, testament));

    return candidates[Math.min(Math.floor(random() * candidates.length), candidates.length - 1)];
  }

  function scorePart(maximumPoints, distance, span) {
    return Math.round(maximumPoints * Math.max(0, 1 - distance / Math.max(span, 1)));
  }

  // Scores a guess against the answer out of 1000: 400 for the book (partial credit for a nearby book, up to 200),
  // then 300 for the chapter and 300 for the verse, which only count when the earlier part is right.
  function scoreGuess(bible, answer, guess) {
    const bookDistance = Math.abs(answer.bookIndex - guess.bookIndex);
    const chapterDistance = Math.abs(answer.chapter - guess.chapter);
    const verseDistance = Math.abs(answer.verse - guess.verse);
    const result = {
      bookDistance, chapterDistance, verseDistance, bookPoints: 0, chapterPoints: 0, versePoints: 0, total: 0
    };

    if (bookDistance === 0) {
      result.bookPoints = SCORE_BOOK_EXACT;
      result.chapterPoints = scorePart(SCORE_CHAPTER_MAX, chapterDistance, getChapterCount(bible, answer.bookIndex));
    } else {
      result.bookPoints = scorePart(SCORE_BOOK_NEARBY_MAX, bookDistance, BOOKS.length / 2);
    }

    if (bookDistance === 0 && chapterDistance === 0) {
      result.versePoints = scorePart(
        SCORE_VERSE_MAX, verseDistance, getVerseCount(bible, answer.bookIndex, answer.chapter)
      );
    }

    result.total = result.bookPoints + result.chapterPoints + result.versePoints;

    return result;
  }

  function describeScore(total) {
    if (total >= SCORE_TOTAL) {
      return "Spot on!";
    }

    if (total >= 900) {
      return "Almost there";
    }

    if (total >= 700) {
      return "Very close";
    }

    if (total >= 400) {
      return "Right book";
    }

    if (total > 0) {
      return "Nearby";
    }

    return "Way off";
  }

  window.SeekBible = {
    BOOKS,
    TRANSLATIONS,
    SCORE_TOTAL,
    parseReference,
    parseBibleText,
    formatReference,
    getChapterCount,
    getVerseCount,
    findVerse,
    getPassage,
    searchWords,
    searchAcrossTranslations,
    lookupAcrossTranslations,
    filterByTestament,
    maskVerseSegments,
    maskVerseText,
    pickRandomVerse,
    scoreGuess,
    describeScore
  };
})();
