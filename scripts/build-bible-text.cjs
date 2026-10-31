"use strict";

// Converts eBible.org "_vpl.txt" files (verse per line) into the compact plain-text
// files used by seek-and-find/. Only the 66 canonical books are kept.
// Usage: node scripts/build-bible-text.cjs <directory containing x-eng-*/ folders> 

const fs = require("fs");
const path = require("path");

const CANONICAL_BOOK_CODES = new Set([
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH",
  "EZR", "NEH", "EST", "JOB", "PSA", "PRO", "ECC", "SOL", "ISA", "JER", "LAM", "EZE", "DAN", "HOS",
  "JOE", "AMO", "OBA", "JON", "MIC", "NAH", "HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT", "MAR", "LUK",
  "JOH", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHI", "COL", "1TH", "2TH", "1TI", "2TI", "TIT",
  "PHM", "HEB", "JAM", "1PE", "2PE", "1JO", "2JO", "3JO", "JUD", "REV"
]);
const TRANSLATIONS = ["kjv", "web", "asv"];
const VERSE_LINE_PATTERN = /^([0-9A-Z]{3}) (\d+:\d+) (.*)$/;

function convertTranslation(sourceDirectory, translationId, outputDirectory) {
  const sourcePath = path.join(sourceDirectory, `x-eng-${translationId}`, `eng-${translationId}_vpl.txt`);
  const outputLines = [];

  for (const line of fs.readFileSync(sourcePath, "utf8").split(/\r?\n/)) {
    const match = VERSE_LINE_PATTERN.exec(line);

    if (!match || !CANONICAL_BOOK_CODES.has(match[1])) {
      continue;
    }

    const verseText = match[3].replace(/¶\s*/g, "").replace(/\s+/g, " ").trim();

    outputLines.push(`${match[1]} ${match[2]} ${verseText}`);
  }

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, `${translationId}.txt`), `${outputLines.join("\n")}\n`);
  console.log(`${translationId}: ${outputLines.length} verses`);
}

const sourceDirectory = process.argv[2];

if (!sourceDirectory) {
  console.error("Usage: node scripts/build-bible-text.cjs <source directory>");
  process.exit(1);
}

for (const translationId of TRANSLATIONS) {
  convertTranslation(sourceDirectory, translationId, path.join(__dirname, "..", "seek-and-find", "bibles"));
}
