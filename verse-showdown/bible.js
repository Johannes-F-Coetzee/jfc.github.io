(() => {
  "use strict";

  const VERSE_LINE_PATTERN = /^(.+?) (\d+):(\d+)\t(.*)$/;
  const REFERENCE_PATTERN = /^(\d?\s*[a-z][a-z ]*?) ?(?:(\d+)(?: ?[: ] ?(\d+))?)?$/;
  const DEFAULT_RESULT_LIMIT = 50;
  const OLD_TESTAMENT_BOOK_COUNT = 39;
  const TESTAMENT_NAMES = { old: "Old Testament", new: "New Testament" };
  const POINTS_PER_TEST = 250;
  const NEARBY_BOOK_POINTS = 125;
  const NEARBY_BOOK_RANGE = 8;
  const WORD_DISTANCE_HALF_LIFE = 5000;
  const MAXIMUM_SCORE = POINTS_PER_TEST * 4;

  // Common abbreviations that are not simple prefixes of a book name (keys have no spaces).
  const BOOK_ALIASES = {
    dt: "Deuteronomy",
    jdg: "Judges",
    ps: "Psalm",
    psa: "Psalm",
    pss: "Psalm",
    psalms: "Psalm",
    prv: "Proverbs",
    songofsongs: "Song of Solomon",
    sos: "Song of Solomon",
    canticles: "Song of Solomon",
    ezk: "Ezekiel",
    mt: "Matthew",
    mk: "Mark",
    mrk: "Mark",
    lk: "Luke",
    jn: "John",
    jhn: "John",
    phil: "Philippians",
    php: "Philippians",
    phm: "Philemon",
    phlm: "Philemon",
    jas: "James",
    jm: "James",
    "1jn": "1 John",
    "2jn": "2 John",
    "3jn": "3 John",
    revelations: "Revelation"
  };

  function toBookKey(name) {
    return name.toLowerCase().replace(/\s+/g, "");
  }

  function parseBibleText(text) {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    const books = [];
    const verses = [];
    const verseIndexByReference = new Map();
    let wordOffset = 0;

    for (const line of lines) {
      const match = VERSE_LINE_PATTERN.exec(line);

      if (!match) {
        continue;
      }

      const [, bookName, chapterText, verseText, verseContent] = match;
      const chapter = Number(chapterText);
      const verse = Number(verseText);

      if (!books.length || books[books.length - 1].name !== bookName) {
        books.push({ name: bookName, key: toBookKey(bookName), chapterVerseCounts: [] });
      }

      const bookIndex = books.length - 1;
      const chapterVerseCounts = books[bookIndex].chapterVerseCounts;
      chapterVerseCounts[chapter - 1] = Math.max(chapterVerseCounts[chapter - 1] || 0, verse);
      verseIndexByReference.set(`${bookIndex}:${chapter}:${verse}`, verses.length);
      // KJV marks translator-supplied words with [brackets]; ASV uses them for disputed text.
      const text = verseContent.replace(/[[\]]/g, "").trim();
      verses.push({ bookIndex, chapter, verse, text, wordOffset });
      wordOffset += text.split(/\s+/).filter(Boolean).length;
    }

    return { books, verses, verseIndexByReference };
  }

  function normalizeReferenceInput(input) {
    return String(input ?? "")
      .toLowerCase()
      .replace(/[.,]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:iii|third) /, "3")
      .replace(/^(?:ii|second) /, "2")
      .replace(/^(?:i|first) /, "1");
  }

  function resolveBook(bookText, books) {
    const key = toBookKey(bookText);
    const exactIndex = books.findIndex(book => book.key === key);

    if (exactIndex !== -1) {
      return { bookIndex: exactIndex };
    }

    if (BOOK_ALIASES[key]) {
      return { bookIndex: books.findIndex(book => book.name === BOOK_ALIASES[key]) };
    }

    const matchingIndexes = books
      .map((book, index) => (book.key.startsWith(key) ? index : -1))
      .filter(index => index !== -1);

    if (matchingIndexes.length === 1) {
      return { bookIndex: matchingIndexes[0] };
    }

    if (!matchingIndexes.length) {
      return { error: `"${bookText}" is not a book of the Bible.` };
    }

    const bookNames = matchingIndexes.map(index => books[index].name).join(", ");

    return { error: `"${bookText}" could be ${bookNames}. Type more of the name.` };
  }

  // Accepts forms such as "John 3:16", "jn 3 16", "1 Cor 13", "I Samuel 3:4" and "Jude 5".
  function parseReference(input, bible) {
    const normalizedInput = normalizeReferenceInput(input);

    if (!normalizedInput) {
      return { error: "Enter a reference." };
    }

    const match = REFERENCE_PATTERN.exec(normalizedInput);

    if (!match) {
      return { error: "Use a reference like John 3:16." };
    }

    const resolvedBook = resolveBook(match[1].trim(), bible.books);

    if (resolvedBook.error) {
      return resolvedBook;
    }

    const bookIndex = resolvedBook.bookIndex;
    const book = bible.books[bookIndex];
    const isSingleChapterBook = book.chapterVerseCounts.length === 1;
    let chapter = match[2] ? Number(match[2]) : null;
    let verse = match[3] ? Number(match[3]) : null;

    if (isSingleChapterBook && verse === null) {
      verse = chapter;
      chapter = 1;
    }

    if (chapter !== null && (chapter < 1 || chapter > book.chapterVerseCounts.length)) {
      return { bookIndex, error: `${book.name} has ${book.chapterVerseCounts.length} chapters.` };
    }

    const verseCount = chapter === null ? 0 : book.chapterVerseCounts[chapter - 1];

    if (verse !== null && (verse < 1 || verse > verseCount)) {
      return { bookIndex, error: `${book.name} ${chapter} has ${verseCount} verses.` };
    }

    return { bookIndex, chapter, verse };
  }

  function formatReference(bible, reference) {
    const bookName = bible.books[reference.bookIndex].name;

    if (reference.chapter === null || reference.chapter === undefined) {
      return bookName;
    }

    if (reference.verse === null || reference.verse === undefined) {
      return `${bookName} ${reference.chapter}`;
    }

    return `${bookName} ${reference.chapter}:${reference.verse}`;
  }

  function findVersesByReference(bible, reference) {
    if (reference.verse !== null) {
      const verseIndex = bible.verseIndexByReference.get(`${reference.bookIndex}:${reference.chapter}:${reference.verse}`);

      return verseIndex === undefined ? [] : [bible.verses[verseIndex]];
    }

    return bible.verses.filter(verse => verse.bookIndex === reference.bookIndex && verse.chapter === reference.chapter);
  }

  // Apostrophes are dropped so "God's", "God’s" and "gods" compare equal.
  function normalizeSearchText(text) {
    return String(text ?? "").toLowerCase().replace(/['’]/g, "");
  }

  function toSearchWords(text) {
    const words = normalizeSearchText(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

    return [...new Set(words)];
  }

  function escapeRegularExpression(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function createSearchResult(matches, limit, isReference = false) {
    const limitedMatches = matches.slice(0, limit);

    return {
      matches: limitedMatches,
      verses: limitedMatches.map(match => match.verse),
      totalCount: matches.length,
      isReference
    };
  }

  // testament is "old", "new" or "all".
  function isInTestament(bookIndex, testament) {
    if (testament === "old") {
      return bookIndex < OLD_TESTAMENT_BOOK_COUNT;
    }

    if (testament === "new") {
      return bookIndex >= OLD_TESTAMENT_BOOK_COUNT;
    }

    return true;
  }

  // A query with a chapter number is treated as a reference; anything else is a word search.
  // Word matches are ranked by the percentage of query words that start a word in the verse.
  function searchVerses(bible, query, limit = DEFAULT_RESULT_LIMIT, testament = "all") {
    const trimmedQuery = String(query ?? "").trim();

    if (!trimmedQuery) {
      return { matches: [], verses: [], totalCount: 0, error: "Enter a reference or some words to search for." };
    }

    const reference = parseReference(trimmedQuery, bible);

    if (!reference.error && reference.chapter !== null) {
      if (!isInTestament(reference.bookIndex, testament)) {
        const bookName = bible.books[reference.bookIndex].name;

        return { matches: [], verses: [], totalCount: 0, error: `${bookName} is not in the ${TESTAMENT_NAMES[testament]}.` };
      }

      const matches = findVersesByReference(bible, reference).map(verse => ({ verse, matchPercent: 100 }));

      return createSearchResult(matches, limit, true);
    }

    if (reference.error && reference.bookIndex !== undefined && /\d/.test(trimmedQuery)) {
      return { matches: [], verses: [], totalCount: 0, error: reference.error };
    }

    const queryWords = toSearchWords(trimmedQuery);
    const wordPatterns = queryWords.map(word => new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegularExpression(word)}`, "u"));
    const matches = [];

    for (const verse of bible.verses) {
      if (!isInTestament(verse.bookIndex, testament)) {
        continue;
      }

      const normalizedText = normalizeSearchText(verse.text);
      const matchedWordCount = wordPatterns.filter(pattern => pattern.test(normalizedText)).length;

      if (matchedWordCount > 0) {
        matches.push({ verse, matchPercent: Math.round((matchedWordCount / queryWords.length) * 100) });
      }
    }

    // Array sort is stable, so equal percentages stay in Bible order.
    matches.sort((first, second) => second.matchPercent - first.matchPercent);

    return createSearchResult(matches, limit);
  }

  // Splits verse text into words and spaces, flagging words that start with a query word.
  function highlightMatchingWords(text, query) {
    const queryWords = toSearchWords(query);

    return text.split(/(\s+)/).filter(Boolean).map(part => {
      if (/^\s+$/.test(part)) {
        return { text: part, isSpace: true, isMatch: false };
      }

      const partWords = toSearchWords(part);
      const isMatch = partWords.some(partWord => queryWords.some(queryWord => partWord.startsWith(queryWord)));

      return { text: part, isSpace: false, isMatch };
    });
  }

  // Searches each { id, bible } translation and groups matches by reference, best match percentage first.
  function searchAllTranslations(translations, query, limit = DEFAULT_RESULT_LIMIT, testament = "all") {
    const firstBible = translations[0].bible;
    const matchesByReference = new Map();
    let isReference = false;

    for (const translation of translations) {
      const result = searchVerses(translation.bible, query, Infinity, testament);

      if (result.error) {
        return { groups: [], totalCount: 0, error: result.error };
      }

      isReference = result.isReference;

      for (const { verse, matchPercent } of result.matches) {
        const referenceKey = `${verse.bookIndex}:${verse.chapter}:${verse.verse}`;

        if (!matchesByReference.has(referenceKey)) {
          matchesByReference.set(referenceKey, { referenceKey, matchPercent: 0, matches: [] });
        }

        const group = matchesByReference.get(referenceKey);
        group.matchPercent = Math.max(group.matchPercent, matchPercent);
        group.matches.push({ translationId: translation.id, verse, matchPercent });
      }
    }

    const orderOf = group => firstBible.verseIndexByReference.get(group.referenceKey) ?? Infinity;
    const groups = [...matchesByReference.values()].sort((first, second) =>
      second.matchPercent - first.matchPercent || orderOf(first) - orderOf(second));

    for (const group of groups) {
      group.matches.sort((first, second) => second.matchPercent - first.matchPercent);
    }

    return { groups: groups.slice(0, limit), totalCount: groups.length, isReference };
  }

  function pickRandomVerse(bible, random = Math.random, testament = "all") {
    const candidateVerses = bible.verses.filter(verse => isInTestament(verse.bookIndex, testament));

    return candidateVerses[Math.floor(random() * candidateVerses.length)];
  }

  function createScore(bookPoints, chapterPoints, versePoints, wordPoints, wordDistance) {
    return {
      score: bookPoints + chapterPoints + versePoints + wordPoints,
      bookPoints,
      chapterPoints,
      versePoints,
      wordPoints,
      wordDistance
    };
  }

  // Words before the guessed spot; a guess without a chapter or verse starts at its first one.
  function findWordOffset(bible, reference) {
    const verseIndex = bible.verseIndexByReference.get(`${reference.bookIndex}:${reference.chapter ?? 1}:${reference.verse ?? 1}`);

    return bible.verses[verseIndex].wordOffset;
  }

  function scoreBook(bookDistance) {
    if (bookDistance === 0) {
      return POINTS_PER_TEST;
    }

    return Math.max(0, Math.round(NEARBY_BOOK_POINTS * (1 - (bookDistance - 1) / NEARBY_BOOK_RANGE)));
  }

  // Four equally weighted tests of 250 points: book, chapter, verse and distance in words.
  function scoreGuess(bible, guess, answer) {
    if (!guess) {
      return createScore(0, 0, 0, 0, null);
    }

    const wordDistance = Math.abs(findWordOffset(bible, guess) - findWordOffset(bible, answer));
    const wordPoints = Math.round(POINTS_PER_TEST * 0.5 ** (wordDistance / WORD_DISTANCE_HALF_LIFE));
    const bookDistance = Math.abs(guess.bookIndex - answer.bookIndex);
    const bookPoints = scoreBook(bookDistance);

    if (bookDistance > 0 || guess.chapter === null) {
      return createScore(bookPoints, 0, 0, wordPoints, wordDistance);
    }

    const chapterVerseCounts = bible.books[answer.bookIndex].chapterVerseCounts;
    const chapterDistance = Math.abs(guess.chapter - answer.chapter);
    const chapterPoints = Math.round(POINTS_PER_TEST * (1 - chapterDistance / chapterVerseCounts.length));

    if (chapterDistance > 0 || guess.verse === null) {
      return createScore(bookPoints, chapterPoints, 0, wordPoints, wordDistance);
    }

    const verseDistance = Math.abs(guess.verse - answer.verse);
    const versePoints = Math.round(POINTS_PER_TEST * (1 - verseDistance / chapterVerseCounts[answer.chapter - 1]));

    return createScore(bookPoints, chapterPoints, versePoints, wordPoints, wordDistance);
  }

  window.VerseShowdownBible = {
    MAXIMUM_SCORE,
    parseBibleText,
    parseReference,
    formatReference,
    searchVerses,
    searchAllTranslations,
    highlightMatchingWords,
    pickRandomVerse,
    scoreGuess
  };
})();
