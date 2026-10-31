# jfc.github.io

Static GitHub Pages site.

| Page | Path |
|------|------|
| Home | [`index.html`](index.html) |
| Fitness tracker | [`fitness/`](fitness/) |
| Fitness trends | [`fitness/trends.html`](fitness/trends.html) |
| Fitness tracking | [`fitness/track.html`](fitness/track.html) |
| Fitness plan | [`fitness/plan.html`](fitness/plan.html) |
| Seek & Find | [`seek-and-find/`](seek-and-find/) |
| Verse Showdown | [`verse-showdown/`](verse-showdown/) |


## Fitness tracker

`fitness/` is a mobile-friendly workout tracker: log workouts, record body measurements, plan routine cycles, and view trends. Data is stored in Google Forms and Sheets, and sign-in uses Google Identity Services. This README covers setup and publishing; per-page behaviour and data formats live in [`fitness/docs/`](fitness/docs/):

| Topic | Doc |
|-------|-----|
| Log page, routine configurations, JSON export | [`log.md`](fitness/docs/log.md) |
| Track page (measurements) | [`track.md`](fitness/docs/track.md) |
| Plan page and plan snapshots | [`plan.md`](fitness/docs/plan.md) |
| Trends page | [`trends.md`](fitness/docs/trends.md) |
| Shared sign-in and Forms modules | [`integration.md`](fitness/docs/integration.md) |

### Setup

1. **Create the Google Form**
   - Open <https://script.google.com>, create a new project, and paste in [`fitness/setup/create-form.gs`](fitness/setup/create-form.gs).
   - Run `createWorkoutForm` and grant access. This creates the form plus a linked response spreadsheet.
   - Copy the logged `form: {...}` block into [`fitness/config.js`](fitness/config.js).
   - Prefer to build the form by hand? Add one *Short answer* question per field listed in `config.js`. Then open **⋮ → Get pre-filled link**, fill in each field, and copy the `entry.NNN` IDs from the generated URL. The action URL is the form's `/viewform` URL with `viewform` replaced by `formResponse`.
   - The form must be **published**, must **not** require sign-in, and must **not** collect email addresses or limit responses to one per person. Otherwise the anonymous POST from the site is rejected.

2. **Create the shared configuration Google Form**
   - In the same Apps Script project, run `createWorkoutConfigurationForm` from [`fitness/setup/create-form.gs`](fitness/setup/create-form.gs).
   - Copy its logged `configurationForm: {...}` block into [`fitness/config.js`](fitness/config.js). This is a separate form from the workout log; do not replace the existing `form` block.
   - Apply the same publishing/anonymous-response settings as the logging form.
   - Share the configuration form with **every tracker user as an editor**. As with trends, the Forms API requires edit access to read responses. The site reads every user's configurations, with no author filter. Form editors can modify data directly in Google Forms, even though the site provides no edit/delete controls.

3. **Create the Google OAuth client ID**
   - In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), configure the OAuth consent screen, then go to **Create credentials → OAuth client ID → Web application**.
   - Under *Authorized JavaScript origins*, add `https://johannes-f-coetzee.github.io` (and both `http://localhost` and `http://localhost:8000` for local testing).
   - Put the client ID in `googleClientId` in [`fitness/config.js`](fitness/config.js).
   - Optionally, list permitted accounts in `allowedEmails`. This only hides the interface from other accounts; it is not access control (see *Security notes*).

4. **Enable configuration loading and the trends page**
   - Set `form.formId` in [`fitness/config.js`](fitness/config.js). This is the ID in the form **editor** URL (`docs.google.com/forms/d/<formId>/edit`), not the `/d/e/...` published ID. `create-form.gs` logs it for you.
   - In Cloud Console, enable the **Google Forms API** (*APIs & Services → Library*).
   - On the OAuth consent screen, add the scopes `https://www.googleapis.com/auth/forms.body.readonly` and `https://www.googleapis.com/auth/forms.responses.readonly`. While the app is in *Testing*, also add each user as a *test user*.
   - These scopes are required for shared configuration loading/saving too. Choose **Routine actions → Refresh routines** on the tracker or **Load my data** on Trends to grant consent; afterward, data loads automatically on sign-in while the permission token is valid. After the first successful Forms read, missing, rejected, or expired tokens can trigger another permission popup.

5. **Publish**: commit and push, and make sure GitHub Pages is enabled for the branch under *Settings → Pages*. The tracker is served at `https://johannes-f-coetzee.github.io/jfc.github.io/fitness/`.

Local testing: `python -m http.server 8000`, then open <http://localhost:8000/fitness/>. Use an HTTP origin authorized for the OAuth client rather than opening the page directly with `file://`.

Style checks (Node.js, no dependencies): `npm run lint`. Lint plus every regression test: `npm run check`.

Offline support: [`fitness/sw.js`](fitness/sw.js) caches the app shell. **Bump `CACHE_VERSION` in `sw.js` whenever you add, remove or rename a page or script**, and keep its `APP_SHELL` list in sync (a test checks this). Pages load their scripts with plain `<script>` tags; the service worker revalidates every request, so a deploy is picked up as soon as the device is online.

Local data: the Log page keeps the draft workout, unsent sets and recent workouts in this browser. Use **Export my data** and **Import data** under *Recent workouts* to move them between devices or keep a copy. Exports belong to one account and can only be imported by that account.

Configuration regression tests (Node.js): `node --test fitness/tests/routines.test.cjs`.
Plan snapshot regression tests (Node.js): `node --test fitness/tests/plans.test.cjs`.
Theme/settings regression tests (Node.js): `node --test fitness/tests/settings.test.cjs`.
Track page regression tests (Node.js): `node --test fitness/tests/track.test.cjs`.
Google authentication and Forms integration regression tests (Node.js): `node --test fitness/tests/auth.test.cjs fitness/tests/google-forms.test.cjs`.
All fitness regression tests (Node.js): `npm test` (or `node --test fitness/tests`).

### Security notes

- `allowedEmails` is enforced in the browser only. Anyone can read the page source, so it is a convenience filter, not a security boundary. The real boundary is who has edit access to the Google Forms.
- The Google Forms access token is kept in `sessionStorage` for up to about 55 minutes. Script injection on this origin could read it, so every page ships a Content-Security-Policy (`<meta http-equiv>`) that only allows this site's scripts plus Google Identity, and HTML built from data is escaped through `WorkoutUtilities`. If you add a new third-party host (analytics, fonts, a CDN), add it to the policy in all four pages.
- A completed form submission is not a confirmed save. Google Forms replies opaquely to the browser, so "sent" means the request left this device. Routine and plan saves read their data back to confirm; for workout logs, check the Trends page.

GitHub Pages is static hosting, so sign-in gates only the user interface. All Google Forms' `formResponse` URLs are public in the page source, and anyone who finds them could submit data directly. Share form-edit access only with trusted tracker users, keep the response spreadsheets private, and treat the `email` columns as claimed attribution, not proof of who logged or saved a workout or measurement.

## Seek & Find

`seek-and-find/` is a Bible search game that runs entirely on GitHub Pages: no server, accounts or build step.

- **Players** are added first, then **Answers** are captured: pick each player and lock in their guess of the book (free text: a name, an abbreviation like `1 cor`, or a whole reference like `John 3:16`), chapter and verse (answers stay hidden), or skip answering for everyone. A warning names anyone still without an answer.
- **Find a scripture** across all three versions at once, optionally limited to the Old or New Testament (this also applies to Random verse). Results show only the five closest as a percent match with the matching words (other words are blurred), never the verse or its reference. Choosing is unlocked once every answer is locked in or answering is skipped.
- **Reveal and score** shows the answer and each player's score out of 1000 (ranked, with running total scores that persist on this device, along with the player list), and a *Share results* button (Web Share, falling back to copying text). When answering was skipped there are no scores.

Scoring: 400 points for the right book (a nearby book earns up to 200), plus 300 for the chapter and 300 for the verse. Chapter and verse points shrink the further the guess is from the answer, and the verse only counts when the chapter is right.

Bible texts live in `seek-and-find/bibles/` as plain text, one verse per line (`JOH 3:16 For God so loved...`): King James Version, World English Bible and American Standard Version, all public domain, from [eBible.org](https://ebible.org/). Regenerate them from eBible's `_vpl.txt` downloads with `node scripts/build-bible-text.cjs <folder>`.

## Verse Showdown

`verse-showdown/` is a static party game: pick a verse, let everyone guess where it is, then reveal and score.

1. **Players**: add everyone's name. Running totals are kept in this browser's `localStorage` (`verseShowdown.players`).
2. **Search**: search every version at once by words, by a single-verse reference (`John 3:16`, `jn 3 16`), or press *Random verse*. A word search matches verses containing any of the words (as the start of a word, so `love` also finds `loved`), ranked by the percentage of search words found. A reference or random verse is shown as its text only. The *Part of the Bible* dropdown limits searches and random verses to the Old or New Testament.
3. **Answers**: each player types where they think it is; a hint shows how the answer was read (`Reads as John 3:16.`). For word searches, the closest 5 unique references (text only, using whichever version matches best, with no version shown) are listed below the answers with each match percentage, the matching words highlighted, the other words blurred, and the *Use* buttons disabled. *Lock in answers* when everyone is done; answers can no longer be edited.
4. **Choose the verse**: once answers are locked, the full text is unblurred, the *Use* buttons are enabled and the host picks the verse the round is about. A single match, reference or random verse skips this step.
5. **Reveal**: the reference is shown with each player's score out of 1000, from four equally weighted tests of 250 points: the right book (a nearby book earns up to 125), the chapter (when the book is right), the verse (when the chapter is right), and the distance in words between the answer and the verse (KJV word count; points halve every 5,000 words). Chapter and verse points shrink with distance.

Bible texts in `verse-showdown/bibles/` are public-domain plain text from [openbible.com/textfiles](https://openbible.com/textfiles/), one verse per line (`Book chapter:verse<TAB>text` after a two-line header): KJV, WEB, ASV and YLT. Regression tests: `node --test verse-showdown/tests`.
