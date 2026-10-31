(() => {
  "use strict";

  const PLAYERS_STORAGE_KEY = "verseShowdown.players";
  const MAXIMUM_PLAYER_NAME_LENGTH = 40;
  const SEARCH_RESULT_LIMIT = 5;
  const TRANSLATIONS = [
    { id: "kjv", name: "King James Version" },
    { id: "web", name: "World English Bible" },
    { id: "asv", name: "American Standard Version" },
    { id: "ylt", name: "Young's Literal Translation" }
  ];
  const { MAXIMUM_SCORE, parseBibleText, parseReference, formatReference, searchAllTranslations, highlightMatchingWords,
    pickRandomVerse, scoreGuess } = window.VerseShowdownBible;

  const playersDetails = document.getElementById("players-details");
  const playerForm = document.getElementById("player-form");
  const playerNameInput = document.getElementById("player-name");
  const playerStatus = document.getElementById("player-status");
  const playersEmptyMessage = document.getElementById("players-empty");
  const scoreboardTable = document.getElementById("scoreboard");
  const scoreboardRows = document.getElementById("scoreboard-rows");
  const resetScoresButton = document.getElementById("reset-scores");
  const searchPanel = document.getElementById("search-panel");
  const testamentSelect = document.getElementById("testament");
  const searchForm = document.getElementById("search-form");
  const searchQueryInput = document.getElementById("search-query");
  const searchButton = document.getElementById("search-button");
  const randomVerseButton = document.getElementById("random-verse");
  const searchStatus = document.getElementById("search-status");
  const searchResultsList = document.getElementById("search-results");
  const answerPanel = document.getElementById("answer-panel");
  const answerHeading = document.getElementById("answer-heading");
  const challengeText = document.getElementById("challenge-text");
  const challengeTranslation = document.getElementById("challenge-translation");
  const answerForm = document.getElementById("answer-form");
  const answerEmptyMessage = document.getElementById("answer-empty");
  const answerFields = document.getElementById("answer-fields");
  const answerStatus = document.getElementById("answer-status");
  const changeVerseButton = document.getElementById("change-verse");
  const lockAnswersButton = document.getElementById("lock-answers");
  const selectPanel = document.getElementById("select-panel");
  const selectHeading = document.getElementById("select-heading");
  const selectStatus = document.getElementById("select-status");
  const revealPanel = document.getElementById("reveal-panel");
  const revealHeading = document.getElementById("reveal-heading");
  const revealReference = document.getElementById("reveal-reference");
  const revealText = document.getElementById("reveal-text");
  const revealRows = document.getElementById("reveal-rows");
  const nextRoundButton = document.getElementById("next-round");
  const bookNamesList = document.getElementById("book-names");

  const answersByPlayerName = new Map();
  let players = loadPlayers();
  let loadedTranslations = [];
  let currentBible = null;
  let currentVerse = null;
  let currentTranslationId = null;
  let currentSearchResult = null;
  let lockedAnswers = [];
  let areAnswersLocked = false;
  let currentSearchQuery = "";

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

  function formatPoints(points) {
    return points.toLocaleString();
  }

  function loadPlayers() {
    try {
      const storedPlayers = JSON.parse(localStorage.getItem(PLAYERS_STORAGE_KEY) || "[]");

      if (!Array.isArray(storedPlayers)) {
        return [];
      }

      return storedPlayers
        .filter(player => player && typeof player.name === "string" && player.name.trim())
        .map(player => ({
          name: player.name.trim().slice(0, MAXIMUM_PLAYER_NAME_LENGTH),
          totalScore: Number.isFinite(player.totalScore) ? player.totalScore : 0,
          roundsPlayed: Number.isFinite(player.roundsPlayed) ? player.roundsPlayed : 0,
          roundScores: Array.isArray(player.roundScores) ? player.roundScores : []
        }));
    } catch {
      return [];
    }
  }

  function savePlayers() {
    try {
      localStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(players));
    } catch {
      // Storage can be unavailable (private browsing); the game still works for this visit.
    }
  }

  function findPlayer(name) {
    const lowerCaseName = name.toLowerCase();

    return players.find(player => player.name.toLowerCase() === lowerCaseName);
  }

  function renderScoreboard() {
    const rankedPlayers = [...players].sort((first, second) => second.totalScore - first.totalScore);
    scoreboardRows.replaceChildren(...rankedPlayers.map((player, index) => {
      const row = createElement("tr", "scoreboard-row");
      const rank = index + 1;
      let rankMedal = "";
      let rankClass = "rank-other";
      let rankDisplay = rank;

      if (rank === 1) {
        rankMedal = "🥇";
        rankClass = "rank-gold";
        rankDisplay = rankMedal;
      } else if (rank === 2) {
        rankMedal = "🥈";
        rankClass = "rank-silver";
        rankDisplay = rankMedal;
      } else if (rank === 3) {
        rankMedal = "🥉";
        rankClass = "rank-bronze";
        rankDisplay = rankMedal;
      }

      const highestScore = player.roundScores && player.roundScores.length > 0
        ? Math.max(...player.roundScores)
        : 0;
      const roundAverage = player.roundsPlayed > 0
        ? Math.round(player.totalScore / player.roundsPlayed)
        : 0;

      const rankCell = createElement("td", rankClass, rankDisplay);
      const nameCell = createElement("td", "", player.name);
      const pointsCell = createElement("td", "", formatPoints(player.totalScore));
      const highestCell = createElement("td", "", formatPoints(highestScore));
      const averageCell = createElement("td", "", formatPoints(roundAverage));

      const removeLink = createElement("a", "remove-link", "✕");
      removeLink.href = "#";
      removeLink.setAttribute("aria-label", `Remove ${player.name}`);
      removeLink.title = `Remove ${player.name}`;
      removeLink.addEventListener("click", (event) => {
        event.preventDefault();
        removePlayer(player.name);
      });
      const removeCell = createElement("td", "remove-cell");
      removeCell.append(removeLink);

      row.append(rankCell, nameCell, pointsCell, highestCell, averageCell, removeCell);

      return row;
    }));
    scoreboardTable.hidden = players.length === 0;
    playersEmptyMessage.hidden = players.length > 0;
    resetScoresButton.hidden = players.length === 0;
  }

  function refreshPlayers() {
    savePlayers();
    renderScoreboard();

    if (!answerPanel.hidden) {
      renderAnswerFields();
    }
  }

  function addPlayer(event) {
    event.preventDefault();
    const name = playerNameInput.value.trim().replace(/\s+/g, " ");

    if (!name) {
      playerStatus.textContent = "Enter a name.";
      playerNameInput.focus();

      return;
    }

    if (findPlayer(name)) {
      playerStatus.textContent = `${name} is already playing.`;
      playerNameInput.select();

      return;
    }

    players.push({ name, totalScore: 0, roundsPlayed: 0, roundScores: [] });
    playerNameInput.value = "";
    playerStatus.textContent = `${name} added.`;
    refreshPlayers();
    playerNameInput.focus();
  }

  function removePlayer(name) {
    if (!window.confirm(`Remove ${name} and their score?`)) {
      return;
    }

    players = players.filter(player => player.name !== name);
    answersByPlayerName.delete(name);
    playerStatus.textContent = `${name} removed.`;
    refreshPlayers();
    playerNameInput.focus();
  }

  function resetScores() {
    if (!window.confirm("Reset every player's score to zero?")) {
      return;
    }

    players = players.map(player => ({ ...player, totalScore: 0, roundsPlayed: 0, roundScores: [] }));
    playerStatus.textContent = "Scores reset.";
    refreshPlayers();
  }

  function setSearchEnabled(isEnabled) {
    searchQueryInput.disabled = !isEnabled;
    searchButton.disabled = !isEnabled;
    randomVerseButton.disabled = !isEnabled;
  }

  function updateBookAutocomplete() {
    const testament = testamentSelect.value;
    const oldTestamentBookCount = 39;
    const filteredBooks = currentBible.books.filter((book, index) => {
      if (testament === "all") {
        return true;
      }

      if (testament === "old") {
        return index < oldTestamentBookCount;
      }

      if (testament === "new") {
        return index >= oldTestamentBookCount;
      }

      return false;
    });
    bookNamesList.replaceChildren(...filteredBooks.map(book => {
      const option = document.createElement("option");
      option.value = book.name;

      return option;
    }));
  }

  async function fetchTranslation(translation) {
    const response = await fetch(`bibles/${translation.id}.txt`);

    if (!response.ok) {
      throw new Error(`${translation.name}: HTTP ${response.status}`);
    }

    return { ...translation, bible: parseBibleText(await response.text()) };
  }

  async function loadTranslations() {
    setSearchEnabled(false);
    searchStatus.innerHTML = `<span class="loading-spinner"></span>Loading ${TRANSLATIONS.length} Bible versions…`;

    try {
      loadedTranslations = await Promise.all(TRANSLATIONS.map(fetchTranslation));
    } catch (error) {
      searchStatus.textContent = `Could not load the Bible texts (${error.message}). Check your connection and reload the page.`;

      return;
    }

    currentBible = loadedTranslations[0].bible;
    updateBookAutocomplete();
    const translationIds = loadedTranslations.map(translation => translation.id.toUpperCase()).join(", ");
    searchStatus.textContent = `Searching all versions: ${translationIds}.`;
    setSearchEnabled(true);
  }

  function runSearch(event) {
    event.preventDefault();
    const query = searchQueryInput.value.trim();

    searchStatus.innerHTML = '<span class="loading-spinner"></span>Searching...';
    searchButton.classList.add("is-loading");
    searchButton.disabled = true;

    const result = searchAllTranslations(loadedTranslations, query, SEARCH_RESULT_LIMIT, testamentSelect.value);

    searchButton.classList.remove("is-loading");
    searchButton.disabled = false;

    if (result.error) {
      searchStatus.textContent = result.error;

      return;
    }

    if (!result.totalCount) {
      searchStatus.textContent = "No verses found in any version. Try different words or a reference like John 3:16.";

      return;
    }

    searchStatus.textContent = "";

    if (result.isReference) {
      startReferenceChallenge(result);

      return;
    }

    startChallenge({ clue: `"${query}"`, clueSource: "Search across all versions", searchResult: result, searchQuery: query });
  }

  // Showing a reference query would give the answer away, so the verse text becomes the clue instead.
  function startReferenceChallenge(result) {
    if (result.totalCount !== 1) {
      searchStatus.textContent = "Search for a single verse, such as Psalm 23:1, or search by words.";

      return;
    }

    const firstMatch = result.groups[0].matches[0];
    const translation = TRANSLATIONS.find(candidate => candidate.id === firstMatch.translationId);
    startChallenge({ clue: firstMatch.verse.text, clueSource: translation.name, verse: firstMatch.verse, translationId: translation.id });
  }

  function updateSelectStatus() {
    const result = currentSearchResult;
    const countText = result.totalCount > result.groups.length
      ? `Showing the closest ${result.groups.length} of ${formatPoints(result.totalCount)} matching references.`
      : `${result.totalCount} matching ${result.totalCount === 1 ? "reference" : "references"}.`;
    const actionText = areAnswersLocked
      ? "Choose the one this round is about."
      : "Lock in answers to choose the one this round is about.";
    selectStatus.textContent = `${countText} ${actionText}`;
  }

  // Each group's matches are sorted best first, so one row per reference shows its closest wording.
  function renderSearchResults(result) {
    searchResultsList.replaceChildren(...result.groups.map((group, groupIndex) => {
      const item = createElement("li", "result-item");
      item.append(renderSearchMatch(group.matches[0], `search-result-${groupIndex}`));

      return item;
    }));
  }

  function renderHighlightedText(container, verseText) {
    for (const part of highlightMatchingWords(verseText, currentSearchQuery)) {
      if (part.isSpace) {
        container.append(part.text);
      } else if (part.isMatch) {
        container.append(createElement("mark", "matching-word", part.text));
      } else {
        const hiddenWord = createElement("span", "hidden-word", part.text);
        hiddenWord.setAttribute("aria-hidden", String(!areAnswersLocked));
        container.append(hiddenWord);
      }
    }
  }

  function renderSearchMatch(match, textId) {
    const row = createElement("div", "result-match");
    const text = createElement("p", "result-text");
    const useButton = createElement("button", "", "Use this verse");
    text.id = textId;
    text.append(createElement("span", "match-percent", `${match.matchPercent}% match`), " ");
    renderHighlightedText(text, match.verse.text);
    useButton.type = "button";
    useButton.disabled = !areAnswersLocked;
    useButton.setAttribute("aria-describedby", text.id);
    useButton.addEventListener("click", () => finishRound(match.verse, match.translationId));
    row.append(text, useButton);

    return row;
  }

  function pickRandomChallenge() {
    randomVerseButton.classList.add("is-loading");
    randomVerseButton.disabled = true;

    const translation = loadedTranslations[Math.floor(Math.random() * loadedTranslations.length)];
    const verse = pickRandomVerse(translation.bible, Math.random, testamentSelect.value);

    randomVerseButton.classList.remove("is-loading");
    randomVerseButton.disabled = false;

    startChallenge({ clue: verse.text, clueSource: translation.name, verse, translationId: translation.id });
  }

  function showPanel(panelToShow) {
    for (const panel of [searchPanel, answerPanel, selectPanel, revealPanel]) {
      panel.hidden = panel !== panelToShow;
    }
  }

  function setAnswersLocked(isLocked) {
    areAnswersLocked = isLocked;
    lockAnswersButton.disabled = isLocked;

    for (const input of answerFields.querySelectorAll("input")) {
      input.disabled = isLocked;
    }

    for (const useButton of searchResultsList.querySelectorAll("button")) {
      useButton.disabled = !isLocked;
    }

    for (const hiddenWord of searchResultsList.querySelectorAll(".hidden-word")) {
      hiddenWord.setAttribute("aria-hidden", String(!isLocked));
    }

    searchResultsList.classList.toggle("is-blurred", !isLocked);

    if (currentSearchResult) {
      updateSelectStatus();
    }
  }

  // A challenge has either a known verse (random or reference) or search results to choose from after answering.
  function startChallenge(challenge) {
    currentVerse = challenge.verse || null;
    currentTranslationId = challenge.translationId || null;
    currentSearchResult = challenge.searchResult || null;
    currentSearchQuery = challenge.searchQuery || "";
    lockedAnswers = [];
    answersByPlayerName.clear();
    challengeText.textContent = challenge.clue;
    challengeTranslation.textContent = challenge.clueSource;
    answerStatus.textContent = "";
    searchResultsList.replaceChildren();

    if (currentSearchResult) {
      renderSearchResults(currentSearchResult);
    }

    renderAnswerFields();
    setAnswersLocked(false);
    playersDetails.open = false;
    showPanel(answerPanel);
    selectPanel.hidden = !currentSearchResult;
    answerHeading.focus();
  }

  function describeAnswer(value) {
    if (!value.trim()) {
      return { message: "No answer yet." };
    }

    const reference = parseReference(value, currentBible);

    if (reference.error) {
      return { message: reference.error, isError: true };
    }

    if (reference.chapter === null) {
      reference.chapter = 1;
    }

    if (reference.verse === null) {
      reference.verse = 1;
    }

    return { message: `Reads as ${formatReference(currentBible, reference)}.`, reference };
  }

  function renderAnswerFields() {
    answerFields.replaceChildren(...players.map((player, index) => {
      const field = createElement("div", "answer-field");
      const inputId = `answer-${index}`;
      const label = createElement("label", "", `${player.name}'s answer`);
      const input = createElement("input");
      const hint = createElement("p", "field-message small");
      label.htmlFor = inputId;
      input.id = inputId;
      input.type = "text";
      input.autocomplete = "off";
      input.placeholder = "e.g. John 3:16";
      input.setAttribute("list", "book-names");
      input.setAttribute("aria-describedby", `${inputId}-hint`);
      input.value = answersByPlayerName.get(player.name) || "";
      input.disabled = areAnswersLocked;
      hint.id = `${inputId}-hint`;

      const updateHint = () => {
        const description = describeAnswer(input.value);
        hint.textContent = description.message;
        hint.classList.toggle("error", Boolean(description.isError));
        input.setAttribute("aria-invalid", description.isError ? "true" : "false");
      };

      input.addEventListener("input", () => {
        answersByPlayerName.set(player.name, input.value);
        updateHint();
      });
      updateHint();
      field.append(label, input, hint);

      return field;
    }));
    answerEmptyMessage.hidden = players.length > 0;
  }

  function lockAnswers(event) {
    event.preventDefault();

    if (!players.length) {
      answerStatus.textContent = "Add at least one player before locking in answers.";
      playerNameInput.focus();

      return;
    }

    const playerAnswers = players.map(player => {
      const answerText = (answersByPlayerName.get(player.name) || "").trim();

      return { player, description: describeAnswer(answerText) };
    });
    const invalidIndex = playerAnswers.findIndex(playerAnswer => playerAnswer.description.isError);

    if (invalidIndex !== -1) {
      answerStatus.textContent = `Fix ${players[invalidIndex].name}'s answer before locking in.`;
      document.getElementById(`answer-${invalidIndex}`).focus();

      return;
    }

    answerStatus.textContent = "";
    lockedAnswers = playerAnswers.map(playerAnswer => ({
      player: playerAnswer.player,
      guess: playerAnswer.description.reference || null
    }));

    if (currentVerse) {
      finishRound(currentVerse, currentTranslationId);

      return;
    }

    if (currentSearchResult.totalCount === 1) {
      const onlyMatch = currentSearchResult.groups[0].matches[0];
      finishRound(onlyMatch.verse, onlyMatch.translationId);

      return;
    }

    setAnswersLocked(true);
    selectHeading.focus();
  }

  function finishRound(verse, translationId) {
    currentVerse = verse;
    currentTranslationId = translationId;
    const results = lockedAnswers.map(lockedAnswer => {
      const score = scoreGuess(currentBible, lockedAnswer.guess, verse);
      lockedAnswer.player.totalScore += score.score;
      lockedAnswer.player.roundsPlayed += 1;
      if (!lockedAnswer.player.roundScores) {
        lockedAnswer.player.roundScores = [];
      }
      lockedAnswer.player.roundScores.push(score.score);

      return { name: lockedAnswer.player.name, guess: lockedAnswer.guess, score };
    });
    lockedAnswers = [];
    refreshPlayers();
    renderReveal(results);
    showPanel(revealPanel);
    revealHeading.focus();
  }

  function renderReveal(results) {
    revealReference.textContent = `${formatReference(currentBible, currentVerse)} (${currentTranslationId.toUpperCase()})`;
    revealText.textContent = currentVerse.text;
    const rankedResults = [...results].sort((first, second) => second.score.score - first.score.score);
    revealRows.replaceChildren(...rankedResults.map(result => {
      const row = document.createElement("tr");
      const scoreCell = createElement("td", "score-cell");
      const wordDistanceText = result.score.wordDistance === null ? "" : ` (${formatPoints(result.score.wordDistance)} words away)`;
      const breakdown = `Book ${result.score.bookPoints} · Chapter ${result.score.chapterPoints} · Verse ${result.score.versePoints} · Words ${result.score.wordPoints}${wordDistanceText}`;
      scoreCell.append(
        createElement("strong", "", `${formatPoints(result.score.score)} / ${formatPoints(MAXIMUM_SCORE)}`),
        createElement("span", "muted small score-breakdown", breakdown)
      );
      row.classList.toggle("perfect-score", result.score.score === MAXIMUM_SCORE);
      row.append(
        createElement("th", "", result.name),
        createElement("td", "", result.guess ? formatReference(currentBible, result.guess) : "No answer"),
        scoreCell
      );
      row.firstChild.scope = "row";

      return row;
    }));
  }

  function startNextRound() {
    currentVerse = null;
    currentSearchResult = null;
    answersByPlayerName.clear();
    searchResultsList.replaceChildren();
    searchStatus.textContent = "";
    searchQueryInput.value = "";
    playersDetails.open = true;
    showPanel(searchPanel);
    searchQueryInput.focus();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function returnToSearch() {
    currentVerse = null;
    currentSearchResult = null;
    playersDetails.open = true;
    showPanel(searchPanel);
    searchQueryInput.focus();
  }

  playerForm.addEventListener("submit", addPlayer);
  resetScoresButton.addEventListener("click", resetScores);
  testamentSelect.addEventListener("change", updateBookAutocomplete);
  searchForm.addEventListener("submit", runSearch);
  randomVerseButton.addEventListener("click", pickRandomChallenge);
  answerForm.addEventListener("submit", lockAnswers);
  changeVerseButton.addEventListener("click", returnToSearch);
  nextRoundButton.addEventListener("click", startNextRound);

  renderScoreboard();
  loadTranslations();
})();
