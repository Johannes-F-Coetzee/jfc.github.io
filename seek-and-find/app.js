// Seek & Find page: capture every player's name and guessed reference first (or skip answering for everyone), then
// search the Bible for the closest matches, choose a verse, and reveal the answer with scores out of 1000.
// Bible logic lives in bible.js.
(() => {
  "use strict";

  const { BOOKS, TRANSLATIONS, SCORE_TOTAL } = window.SeekBible;
  const bibleLogic = window.SeekBible;
  const TOP_MATCH_COUNT = 5;
  const BASE_TRANSLATION_KEY = "kjv";
  const TESTAMENT_NAMES = { all: "whole Bible", old: "Old Testament", new: "New Testament" };
  const PLAYERS_STORAGE_KEY = "seekAndFind.players";
  const $ = selector => document.querySelector(selector);

  const loadedBibles = new Map();
  let currentBible = null;
  let chosenVerse = null;
  let players = [];
  let skipAll = false;
  let topMatches = [];
  let lastBookIndex = -1;
  let typedWords = [];
  let lastResultsText = "";

  function setStatus(message, kind = "") {
    $("#status").textContent = message;
    $("#status").className = `status ${kind}`;
    $("#status").hidden = !message;
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);

    if (className) {
      element.className = className;
    }

    if (text !== undefined) {
      element.textContent = text;
    }

    return element;
  }

  function pluralize(count, singular) {
    return `${count} ${singular}${count === 1 ? "" : "s"}`;
  }

  async function loadBible(translation) {
    const response = await fetch(`bibles/${translation.id}.txt`);

    if (!response.ok) {
      throw new Error(`The ${translation.name} text could not be loaded (${response.status}).`);
    }

    return bibleLogic.parseBibleText(await response.text());
  }

  async function loadAllBibles() {
    setStatus("Loading all Bible versions…");

    try {
      await Promise.all(TRANSLATIONS.map(async translation => {
        loadedBibles.set(translation.id, await loadBible(translation));
      }));
      currentBible = loadedBibles.get(BASE_TRANSLATION_KEY);
      setStatus("");
      updateAnswerLimits();
    } catch (error) {
      console.error(error);
      setStatus(error.message, "error");
    }
  }

  function appendVersions(container, candidate) {
    candidate.versions.forEach(version => {
      const line = createElement("p", "version-line");

      line.append(createElement("span", "version-label", version.translation.id.toUpperCase()), version.text);
      container.append(line);
    });
  }

  function loadPlayers() {
    try {
      const storedPlayers = JSON.parse(localStorage.getItem(PLAYERS_STORAGE_KEY) || "[]");

      return storedPlayers
        .filter(player => player && typeof player.name === "string" && player.name.trim())
        .map(player => ({
          name: player.name.trim(),
          answer: null,
          totalScore: Number(player.totalScore) || 0,
          roundsPlayed: Number(player.roundsPlayed) || 0,
          appliedScore: null
        }));
    } catch (error) {
      console.error("Could not read the saved players.", error);

      return [];
    }
  }

  function savePlayers() {
    try {
      localStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(players.map(player => ({
        name: player.name, totalScore: player.totalScore, roundsPlayed: player.roundsPlayed
      }))));
    } catch (error) {
      console.error("Could not remember the players on this device.", error);
    }
  }

  function createPlayer(name) {
    return { name, answer: null, totalScore: 0, roundsPlayed: 0, appliedScore: null };
  }

  function getPlayersWithoutAnswer() {
    return players.filter(player => !player.answer);
  }

  // Choosing a verse is allowed once every player's answer is locked in, or answering is skipped for everyone.
  function canChooseVerse() {
    return !chosenVerse && (skipAll || (players.length > 0 && getPlayersWithoutAnswer().length === 0));
  }

  function describeAnswerProgress() {
    if (skipAll) {
      return "Answering is skipped for everyone. Search and choose a verse.";
    }

    if (!players.length) {
      return "Add at least one player, lock in their answers, or skip answering for everyone.";
    }

    const missingNames = getPlayersWithoutAnswer().map(player => player.name).join(", ");

    return missingNames
      ? `Warning: no answer captured yet for ${missingNames}. Lock in every answer, or skip answering for everyone.`
      : "Every answer is locked in. Search and choose a verse.";
  }

  function updateGate() {
    const progress = $("#answer-progress");
    const hasMissingAnswers = !skipAll && getPlayersWithoutAnswer().length > 0;

    progress.textContent = describeAnswerProgress();
    progress.className = `answer-progress ${hasMissingAnswers ? "warning" : ""}`;
    $("#skip-button").textContent = skipAll ? "Answer after all" : "Skip answering for everyone";
    $("#answer-fieldset").disabled = Boolean(chosenVerse);
    $("#roster-fieldset").disabled = Boolean(chosenVerse);
    $("#search-gate-note").hidden = canChooseVerse() || Boolean(chosenVerse);
    $("#random-button").disabled = !canChooseVerse();
    topMatches.forEach((candidate, matchIndex) => {
      $("#search-results").children[matchIndex].querySelector("button").disabled = !canChooseVerse();
    });
  }

  function renderPlayers() {
    const list = $("#player-list");
    const playerSelect = $("#player-name");
    const previousSelection = playerSelect.value;

    list.replaceChildren();
    playerSelect.replaceChildren(new Option("Choose a player", ""));

    players.forEach((player, playerIndex) => {
      const item = createElement("li", "player-item");
      const name = createElement("span", "player-name", player.name);
      const state = createElement(
        "span",
        `player-state ${player.answer ? "locked" : "missing"}`,
        player.answer ? "Answer locked in" : "No answer yet"
      );
      const total = createElement("span", "player-total", `Total ${player.totalScore} (${pluralize(player.roundsPlayed, "round")})`);
      const removeButton = createElement("button", "btn ghost small", "Remove");

      removeButton.type = "button";
      removeButton.disabled = Boolean(chosenVerse);
      removeButton.setAttribute("aria-label", `Remove ${player.name}`);
      removeButton.addEventListener("click", () => {
        players.splice(playerIndex, 1);
        renderPlayers();
      });
      item.append(name, total, state, removeButton);
      list.append(item);

      if (!player.answer) {
        playerSelect.append(new Option(player.name));
      }
    });

    playerSelect.value = [...playerSelect.options].some(option => option.value === previousSelection) ? previousSelection : "";

    savePlayers();
    updateGate();
  }

  function populateBookNames() {
    BOOKS.forEach(book => $("#book-names").append(new Option(book.name)));
  }

  // Reads the free text in the book box: a name or abbreviation ("1 cor"), or a whole reference ("John 3:16").
  function readBookText() {
    const parsedReference = bibleLogic.parseReference($("#answer-book").value);

    return parsedReference || { bookIndex: -1, chapter: null, verseStart: null };
  }

  function updateAnswerLimits() {
    const { bookIndex } = readBookText();
    const chapterInput = $("#answer-chapter");
    const verseInput = $("#answer-verse");
    const chapterCount = bookIndex < 0 ? 0 : bibleLogic.getChapterCount(currentBible, bookIndex);
    const chosenChapter = Number(chapterInput.value);
    const verseCount = chapterCount && chosenChapter >= 1 ? bibleLogic.getVerseCount(currentBible, bookIndex, chosenChapter) : 0;

    chapterInput.max = chapterCount ? String(chapterCount) : "";
    chapterInput.placeholder = chapterCount ? `1 to ${chapterCount}` : "";
    verseInput.max = verseCount ? String(verseCount) : "";
    verseInput.placeholder = verseCount ? `1 to ${verseCount}` : "";
    $("#answer-book").setCustomValidity(bookIndex < 0 && $("#answer-book").value.trim() ? "Book not recognised. Try a name like John or 1 Cor." : "");
  }

  // When the book box loses focus, replace the typed text with the full book name and, if a whole reference was
  // typed, fill in the chapter and verse. Picking a different book clears the old chapter and verse.
  function commitBookText() {
    const { bookIndex, chapter, verseStart } = readBookText();

    if (bookIndex < 0) {
      updateAnswerLimits();
      $("#answer-book").reportValidity();

      return;
    }

    if (bookIndex !== lastBookIndex) {
      $("#answer-chapter").value = "";
      $("#answer-verse").value = "";
    }

    lastBookIndex = bookIndex;
    $("#answer-book").value = BOOKS[bookIndex].name;

    if (chapter !== null) {
      $("#answer-chapter").value = String(chapter);
    }

    if (verseStart !== null) {
      $("#answer-verse").value = String(verseStart);
    }

    updateAnswerLimits();
  }

  function setMessage(selector, message, kind = "") {
    $(selector).textContent = message;
    $(selector).className = `hint ${kind}`;
  }

  function readAnswerForm() {
    const name = $("#player-name").value.trim();
    const typedBook = readBookText();
    const chapter = Number($("#answer-chapter").value || typedBook.chapter);
    const verse = Number($("#answer-verse").value || typedBook.verseStart);

    if (!name) {
      return { error: "Choose a player." };
    }

    if (typedBook.bookIndex < 0) {
      return { error: "Type a book such as John or 1 Cor." };
    }

    const bookIndex = typedBook.bookIndex;
    const chapterCount = bibleLogic.getChapterCount(currentBible, bookIndex);

    if (!Number.isInteger(chapter) || chapter < 1 || chapter > chapterCount) {
      return { error: `${BOOKS[bookIndex].name} has ${chapterCount} chapter(s). Enter one of those.` };
    }

    const verseCount = bibleLogic.getVerseCount(currentBible, bookIndex, chapter);

    if (!Number.isInteger(verse) || verse < 1 || verse > verseCount) {
      return { error: `${BOOKS[bookIndex].name} ${chapter} has ${verseCount} verse(s). Enter one of those.` };
    }

    return { name, answer: { bookIndex, chapter, verse } };
  }

  function addRosterPlayer(event) {
    event.preventDefault();

    const name = $("#roster-name").value.trim();

    if (!name) {
      return;
    }

    if (players.some(player => player.name.toLowerCase() === name.toLowerCase())) {
      setMessage("#roster-message", `${name} is already on the list.`, "error");

      return;
    }

    players.push(createPlayer(name));
    $("#roster-form").reset();
    renderPlayers();
    setMessage("#roster-message", `${name} added.`);
    $("#roster-name").focus();
  }

  function submitAnswer(event) {
    event.preventDefault();

    const result = readAnswerForm();

    if (result.error) {
      setMessage("#player-message", result.error, "error");

      return;
    }

    players.find(player => player.name === result.name).answer = result.answer;
    skipAll = false;
    $("#player-form").reset();
    lastBookIndex = -1;
    updateAnswerLimits();
    renderPlayers();
    setMessage("#player-message", `${result.name}'s answer is locked in and hidden. Next player, please.`);
    $("#player-name").focus();
  }

  function toggleSkipAll() {
    skipAll = !skipAll;
    updateGate();
  }

  // Blurs every word that did not match; the page never holds the real hidden words.
  function createMaskedVerse(verseText) {
    const segments = bibleLogic.maskVerseSegments(verseText, typedWords);
    const hiddenCount = segments.filter(segment => segment.hidden).length;
    const paragraph = createElement("p", "masked-text");

    paragraph.setAttribute("role", "img");
    paragraph.setAttribute("aria-label", `A verse with ${pluralize(hiddenCount, "hidden word")}. Matching words: ${typedWords.join(", ") || "none"}.`);
    segments.forEach(segment => {
      paragraph.append(segment.hidden ? createElement("span", "blurred-word", segment.text) : createElement("span", "shown-word", segment.text));
    });

    return paragraph;
  }

  // Search results hide the verse and its reference: only the rank, percent match and the masked words are shown.
  function renderTopMatches() {
    const list = $("#search-results");

    list.replaceChildren();

    topMatches.forEach((candidate, matchIndex) => {
      const item = createElement("li", "verse-item");
      const body = createElement("div", "verse-body");
      const button = createElement("button", "btn small", "Choose this verse");

      body.append(
        createElement("strong", "verse-reference", `Match ${matchIndex + 1}`),
        createElement("span", "closeness", `${candidate.closeness}% match`),
        createMaskedVerse(candidate.versions[0].text)
      );
      button.type = "button";
      button.addEventListener("click", () => chooseVerse(candidate));
      item.append(body, button);
      list.append(item);
    });

    updateGate();
  }

  function clearSearchResults() {
    topMatches = [];
    $("#search-results").replaceChildren();
    $("#search-summary").hidden = true;
  }

  function runSearch(query) {
    const trimmedQuery = query.trim();

    if (!currentBible || !trimmedQuery || chosenVerse) {
      return;
    }

    const reference = bibleLogic.parseReference(trimmedQuery);
    const isReferenceSearch = reference && reference.chapter !== null;
    const testament = $("#testament-select").value;
    const allCandidates = isReferenceSearch
      ? bibleLogic.lookupAcrossTranslations(loadedBibles, TRANSLATIONS, reference)
      : bibleLogic.searchAcrossTranslations(loadedBibles, TRANSLATIONS, trimmedQuery);
    const candidates = bibleLogic.filterByTestament(allCandidates, testament);

    typedWords = isReferenceSearch ? [] : trimmedQuery.split(/[^A-Za-z0-9'’]+/).filter(Boolean);
    topMatches = candidates.slice(0, TOP_MATCH_COUNT);
    $("#search-summary").textContent = candidates.length
      ? `Top ${topMatches.length} of ${`${candidates.length} ${candidates.length === 1 ? "match" : "matches"}`} across all versions, in the ${TESTAMENT_NAMES[testament]}. Verses stay hidden.`
      : `Nothing came close in the ${TESTAMENT_NAMES[testament]}. Try different words or a reference.`;
    $("#search-summary").hidden = false;
    renderTopMatches();
  }

  function chooseVerse(candidate) {
    if (!canChooseVerse()) {
      return;
    }

    chosenVerse = candidate;
    clearSearchResults();
    $("#search-form").hidden = true;
    $("#chosen-panel").hidden = false;
    renderPlayers();
    $("#reveal-button").focus();
  }

  function chooseDifferentVerse() {
    chosenVerse = null;
    $("#search-form").hidden = false;
    $("#chosen-panel").hidden = true;
    renderPlayers();
    $("#search-input").focus();
  }

  function pickRandomCandidate() {
    const { bookIndex, chapter, verse } = bibleLogic.pickRandomVerse(currentBible, Math.random, $("#testament-select").value);

    return bibleLogic.lookupAcrossTranslations(
      loadedBibles, TRANSLATIONS, { bookIndex, chapter, verseStart: verse, verseEnd: verse }
    )[0];
  }

  function describeBookDistance(score) {
    if (score.bookDistance === 0) {
      return "Book correct";
    }

    return `${pluralize(score.bookDistance, "book")} away`;
  }

  function describeChapterAndVerse(score) {
    if (score.bookDistance !== 0) {
      return "";
    }

    if (score.chapterDistance !== 0) {
      return `, chapter ${pluralize(score.chapterDistance, "chapter")} away`;
    }

    return score.verseDistance === 0 ? ", chapter and verse correct" : `, chapter correct, verse ${pluralize(score.verseDistance, "verse")} away`;
  }

  function scorePlayers() {
    const answered = players
      .filter(player => player.answer)
      .map(player => ({ player, score: bibleLogic.scoreGuess(currentBible, chosenVerse, player.answer) }))
      .sort((first, second) => second.score.total - first.score.total);
    const unanswered = getPlayersWithoutAnswer().map(player => ({ player, score: null }));

    return [...answered, ...unanswered];
  }

  function applyRoundScores(scoredPlayers) {
    scoredPlayers.forEach(entry => {
      const player = entry.player;
      const roundScore = entry.score ? entry.score.total : 0;

      if (player.appliedScore === null) {
        player.roundsPlayed += 1;
      }

      player.totalScore += roundScore - (player.appliedScore || 0);
      player.appliedScore = roundScore;
    });
    renderPlayers();
  }

  function renderTotals() {
    const rankedPlayers = [...players].sort((first, second) => second.totalScore - first.totalScore);

    $("#totals-list").replaceChildren(...rankedPlayers.map(player => {
      const item = createElement("li", "total-item");

      item.append(
        createElement("span", "result-name", player.name),
        createElement("span", "result-score", `${player.totalScore}`),
        createElement("span", "player-state", pluralize(player.roundsPlayed, "round"))
      );

      return item;
    }));
  }

  function renderResultItem(entry, position) {
    const item = createElement("li", "result-item");
    const heading = createElement("div", "result-heading");
    const meter = createElement("div", "meter");
    const meterFill = createElement("div", "meter-fill");
    const total = entry.score ? entry.score.total : 0;

    heading.append(
      createElement("span", "result-rank", `${position}.`),
      createElement("span", "result-name", entry.player.name),
      createElement("span", "result-score", `${total} / ${SCORE_TOTAL}`)
    );
    meterFill.style.width = `${(total / SCORE_TOTAL) * 100}%`;
    meter.append(meterFill);
    meter.setAttribute("role", "img");
    meter.setAttribute("aria-label", `${total} out of ${SCORE_TOTAL}`);
    item.append(heading, meter);

    if (!entry.score) {
      item.append(createElement("p", "result-detail warning", `No answer captured. Total: ${entry.player.totalScore}.`));

      return item;
    }

    const verdict = bibleLogic.describeScore(total).replace(/[.!]$/, "");

    item.append(createElement(
      "p",
      "result-detail",
      `${verdict}. Guessed ${bibleLogic.formatReference(entry.player.answer)}. ${describeBookDistance(entry.score)}${describeChapterAndVerse(entry.score)}. Total: ${entry.player.totalScore}.`
    ));

    return item;
  }

  function buildResultsText(scoredPlayers) {
    const lines = [
      "Seek & Find",
      ...chosenVerse.versions.map(version => `${version.translation.id.toUpperCase()}: “${version.text}”`),
      `Answer: ${bibleLogic.formatReference(chosenVerse)}`,
      ""
    ];

    if (skipAll) {
      lines.push("Answering was skipped, so there are no scores.");

      return lines.join("\n");
    }

    scoredPlayers.forEach((entry, index) => {
      if (!entry.score) {
        lines.push(`${index + 1}. ${entry.player.name}: 0/${SCORE_TOTAL} (no answer captured)`);

        return;
      }

      lines.push(`${index + 1}. ${entry.player.name}: ${entry.score.total}/${SCORE_TOTAL} (guessed ${bibleLogic.formatReference(entry.player.answer)})`);
    });

    lines.push("", "Total scores:");
    [...players]
      .sort((first, second) => second.totalScore - first.totalScore)
      .forEach(player => lines.push(`${player.name}: ${player.totalScore} (${pluralize(player.roundsPlayed, "round")})`));

    return lines.join("\n");
  }

  function revealResults() {
    if (!chosenVerse) {
      return;
    }

    const scoredPlayers = skipAll ? [] : scorePlayers();

    applyRoundScores(scoredPlayers);
    renderTotals();
    $("#results-verse").replaceChildren();
    appendVersions($("#results-verse"), chosenVerse);
    $("#results-reference").textContent = bibleLogic.formatReference(chosenVerse);
    $("#results-skipped").hidden = !skipAll;
    $("#results-list").replaceChildren(...scoredPlayers.map((entry, index) => renderResultItem(entry, index + 1)));
    lastResultsText = buildResultsText(scoredPlayers);
    $("#share-message").textContent = "";
    $("#results-section").hidden = false;
    $("#results-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function copyResults() {
    try {
      await navigator.clipboard.writeText(lastResultsText);
      $("#share-message").textContent = "Results copied. Paste them anywhere to share.";
    } catch (error) {
      console.error("Could not copy the results.", error);
      $("#share-message").textContent = "Copying is not available here. Select the results and copy them by hand.";
    }
  }

  async function shareResults() {
    if (!navigator.share) {
      await copyResults();

      return;
    }

    try {
      await navigator.share({ title: "Seek & Find results", text: lastResultsText });
      $("#share-message").textContent = "Shared.";
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Could not share the results.", error);
        await copyResults();
      }
    }
  }

  function resetRound() {
    chosenVerse = null;
    skipAll = false;
    clearSearchResults();
    $("#search-form").reset();
    $("#search-form").hidden = false;
    $("#chosen-panel").hidden = true;
    $("#results-section").hidden = true;
    setMessage("#player-message", "");
  }

  function playAgain() {
    players.forEach(player => {
      player.answer = null;
      player.appliedScore = null;
    });
    resetRound();
    renderPlayers();
    window.scrollTo({ top: 0, behavior: "smooth" });
    $("#player-name").focus();
  }

  function clearPlayers() {
    if (players.length && !window.confirm("Remove every player and reset all total scores?")) {
      return;
    }

    players = [];
    resetRound();
    renderPlayers();
    $("#roster-name").focus();
  }

  function init() {
    populateBookNames();
    $("#roster-form").addEventListener("submit", addRosterPlayer);
    $("#player-form").addEventListener("submit", submitAnswer);
    $("#answer-book").addEventListener("input", updateAnswerLimits);
    $("#answer-book").addEventListener("change", commitBookText);
    $("#answer-chapter").addEventListener("input", () => updateAnswerLimits());
    $("#skip-button").addEventListener("click", toggleSkipAll);
    $("#search-form").addEventListener("submit", event => {
      event.preventDefault();
      runSearch($("#search-input").value);
    });
    $("#testament-select").addEventListener("change", () => {
      if (topMatches.length && $("#search-input").value.trim()) {
        runSearch($("#search-input").value);
      }
    });
    $("#random-button").addEventListener("click", () => {
      if (currentBible && canChooseVerse()) {
        chooseVerse(pickRandomCandidate());
      }
    });
    $("#reveal-button").addEventListener("click", revealResults);
    $("#change-verse-button").addEventListener("click", chooseDifferentVerse);
    $("#share-button").addEventListener("click", shareResults);
    $("#copy-button").addEventListener("click", copyResults);
    $("#again-button").addEventListener("click", playAgain);
    $("#clear-players-button").addEventListener("click", clearPlayers);
    players = loadPlayers();
    renderPlayers();
    loadAllBibles();
  }

  init();
})();
