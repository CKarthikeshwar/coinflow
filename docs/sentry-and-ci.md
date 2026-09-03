# Maestro, Sentry & CI — a plain-language setup guide

This doc explains three pieces of the project that need a human to finish or run them:

1. **Maestro** — optional end-to-end testing (drives the real app on a real device/emulator).
   One flow written, never run yet.
2. **Sentry** — optional crash reporting. Installed but not wired to an account yet.
3. **CI** — the automatic checker that runs every time you push code to GitHub. Already
   working; this explains what it is and how to read it.

None of the three block development. You can build every feature without touching any of them.

---

## Part 1 — Maestro (a robot that taps through your app for you)

### What Maestro is, in one paragraph

You know how you've been testing the app by installing it and tapping around yourself? Maestro is
a free tool that does that *for* you, automatically. You write down the steps once — "tap this
button, type this number, check that this text shows up" — in a plain text file, and Maestro
replays those exact steps on your phone or emulator, every time, without you touching anything.
It's like a recording of your testing routine that plays itself back.

### Why bother, when you already test by hand?

Because a plain script like `adb` can only say "tap at this exact pixel spot on the screen" — it
has no idea what a button *is*, and it can't check whether the app actually did the right thing
afterward. It just taps blindly. Maestro is smarter: you tell it "tap the button that says Add",
and it finds that button by its label, wherever it happens to be. It can also *check* things —
"after I tap Add, does the word 'Added' show up?" — and tell you pass or fail. That's something
plain `adb` simply can't do.

A lot of the bugs found while building this app (a popup not closing, the phone's Back button not
working, a fast double-tap breaking something) only show up when something is actually running on
a real screen, with real animations and real timing — the kind of thing that's easy to miss when
testing by hand once, but exactly what a repeatable automatic script is good at catching every
time.

### What's already done

- One test script already exists: `e2e/j4-manual-add.yaml`. It walks through adding a transaction
  by hand — open the Add screen, type in an amount, pick a category and a payment method, tap
  Add, check that the "saved" message shows up.
- **It has never actually been run, not even once.** It was written without Maestro installed and
  without a phone/emulator connected, so think of it as a rough first draft. The very first time
  you run it, something will probably not quite match (maybe a button's exact wording is slightly
  off) and it'll need a small fix. That's normal and expected — not a sign anything is broken.

### A couple of words you'll run into

| Word | In plain terms |
|---|---|
| **Maestro CLI** | The actual program you install on your computer, similar to how you already have `adb`. "CLI" just means you type commands for it rather than clicking icons. |
| **Flow** | One script — one text file listing the steps to run. `e2e/j4-manual-add.yaml` is one flow. |
| **Step** | One instruction inside a flow, like "tap this" or "check that this text is visible." |

### How to actually use it, step by step

#### 1. Install Maestro (a one-time thing)

This is separate from the app itself — you don't run `npm install` for it, same as you didn't for
`adb`. The exact install instructions can change, so rather than copy a command from here that
might go out of date, use the official page:

<https://maestro.mobile.dev/getting-started/installing-maestro>

After installing, check it worked by typing this in your terminal:

```bash
maestro --version
```

If it prints a version number, you're set.

#### 2. Get the app running on your phone or emulator

Nothing new here — use the exact same build you've already been testing with. Just make sure
either your phone is plugged in and shows up when you run `adb devices`, or an Android emulator
is open.

#### 3. Run the script

Type this:

```bash
maestro test e2e/j4-manual-add.yaml
```

Maestro will open the app by itself and start tapping through the steps, right in front of you.
You'll see it happening live on the screen. If a step can't find what it's looking for, Maestro
stops and prints exactly which step failed and why.

#### 4. If (when) it fails the first time, fix it

Since nobody has run this script before, expect the first attempt to trip up somewhere — usually
because the text it's looking for doesn't exactly match what's on screen. Read the error message,
open the `e2e/j4-manual-add.yaml` file, and adjust that one line. Then run it again. Repeat until
it gets all the way through.

#### 5. After that, it's done

There's nothing ongoing to maintain. It's not hooked up to run automatically anywhere (see Part 3
below on CI) — you just run the same command by hand whenever you want to double-check that flow
still works, for example right before you plan to ship a build.

### What it's not for

- **You don't need this.** Everything still works fine without it — it's an extra safety net, not
  a requirement. Skipping it entirely costs nothing.
- It doesn't run automatically on GitHub (see Part 3) — it needs a real phone or emulator, which
  GitHub's automatic checks don't have. You run it yourself, by hand, whenever you want to.
- It's separate from the other automatic tests already in this project (the ones that run inside
  `npm test`) — those check the code's logic quickly without needing a phone at all; Maestro
  checks the real, finished app the way a person actually uses it, which is slower but closer to
  the real experience.

### Does it cost anything?

No — the tool itself is free to install and run on your own computer/phone. (Maestro's company
also sells a paid cloud service that runs your scripts on servers instead of your own device —
this project doesn't use that, and you don't need it.)

---

## Part 2 — Sentry (crash reporting)

### What Sentry is, in one paragraph

When an app crashes on a real user's phone, the developer normally has no idea it happened.
Sentry is a service that catches the crash, records the technical details (which line of code
blew up, on what phone, running what app version), and shows it to you on a website dashboard.
You fix bugs you'd otherwise never hear about.

### Why CoinFlow uses it very carefully

CoinFlow holds financial data, so the spec (`SPEC-implementation.md` §33.4, decision D34) locks
down Sentry hard:

- **Off by default.** The code only starts Sentry when the user turns on a "Send crash reports"
  switch in Settings. If they never do, Sentry never runs and the app never talks to the network
  at all.
- **Scrubbed.** Even when on, it sends stack traces only — never a transaction amount, a merchant
  name, an account, or the text of an SMS.

So Sentry is a "nice to have for debugging", not a core dependency. If you skip this whole
section, the app still works; you just won't get crash reports.

### What's already done

- `@sentry/react-native` is installed.
- `app.json` has `"@sentry/react-native"` in the `plugins` list and an empty
  `extra.sentryDsn` string waiting for a value.
- Because there's no account yet, `npx expo` commands print this **harmless warning**:

  ```
  [@sentry/react-native/expo] Missing config for organization, project.
  ```

  That's expected until you do the steps below. It does not break anything.

### Vocabulary you'll hit

| Term | What it actually means |
|---|---|
| **Organization** (org) | Your Sentry account's top-level name. You pick it at signup, e.g. `ck-workforce`. Its short form is the "org slug". |
| **Project** | One app inside your org. You'll make one called `coinflow`. Its short form is the "project slug". |
| **DSN** | A URL that tells the app *where* to send crash reports. Safe to put in the app — it can only *submit* crashes, not read them. Looks like `https://abc123@o456.ingest.sentry.io/789`. |
| **Auth token** | A secret key used **only at build time** to upload "source maps" (files that turn minified crash traces back into readable code). This one is sensitive — never commit it. |

### Step-by-step

#### 1. Make a Sentry account

Go to <https://sentry.io/signup/> and sign up (the free "Developer" plan is plenty). During
setup it asks for an **organization name** — this becomes your org slug.

#### 2. Create the project

- In Sentry: **Projects → Create Project**.
- Platform: choose **React Native**.
- Name it `coinflow`. This becomes your project slug.
- Sentry shows you a **DSN** on the next screen. Copy it. (You can always find it later under
  **Settings → Projects → coinflow → Client Keys (DSN)**.)

#### 3. Put the DSN in the app

Open `app.json` and paste the DSN into the empty field:

```jsonc
"extra": {
  "router": {},
  "sentryDsn": "https://PASTE_YOUR_DSN_HERE@o0.ingest.sentry.io/0",
  "eas": { ... }
}
```

This value is not secret — it's fine to commit it.

#### 4. Fill in the plugin config

Still in `app.json`, change the plugin entry from the bare string:

```jsonc
"@sentry/react-native"
```

to the configured form:

```jsonc
[
  "@sentry/react-native",
  {
    "organization": "your-org-slug",
    "project": "coinflow",
    "url": "https://sentry.io/"
  }
]
```

Keep it **last** in the `plugins` array (it wraps the app's startup code and adds a build hook —
`SPEC-implementation.md` §35.2). After this, the "Missing config" warning goes away.

#### 5. Create the auth token (only needed for real release builds)

You can skip this until you're doing an EAS `production` build.

- Sentry: **Settings → Auth Tokens → Create New Token**.
- Scopes: `project:releases` and `org:read` are enough.
- Copy the token. **Do not put it in `app.json` or any committed file.**
- Give it to EAS as a secret instead:

  ```bash
  npx eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value "your-token"
  ```

  EAS injects it only during cloud builds. Locally, you'd put it in a `.env` file (already
  git-ignored via `.env*.local`) or your shell environment.

#### 6. Confirm the wiring later

When feature work reaches the Settings screen and the crash-reporting toggle
(`SPEC-implementation.md` §33.4), the code path is: toggle ON → `Sentry.init()` runs with the
DSN → force a test crash → the event appears in your Sentry dashboard within a minute, carrying
**no** financial fields. Until that screen exists there's nothing to test.

### One more note: blocked install script

During `npm install` you'll see a warning that `@sentry/cli` has a "postinstall script not yet
covered by allowScripts". That's this machine's npm security setting refusing to auto-run a
downloaded script. `@sentry/cli` is only used to upload source maps during release builds. If a
release build ever complains that the Sentry CLI binary is missing, run:

```bash
npm exec -- sentry-cli --version   # triggers the download once
```

or approve it explicitly with `npm install-scripts approve @sentry/cli`.

---

## Part 3 — CI (the automatic checker)

### Is it a GitHub feature? Yes.

CI here is **GitHub Actions** — a service built into GitHub. There's no separate account, no
extra signup, no server to run. GitHub sees a file at `.github/workflows/ci.yml` in your repo
and starts obeying it automatically.

"CI" stands for *continuous integration*. In practice it means: **every time code lands on
GitHub, a fresh computer in the cloud checks it and tells you pass or fail.**

### What our CI actually does

The file `.github/workflows/ci.yml` says, in English:

> Whenever someone pushes to `master`, or opens a pull request against `master`:
> spin up a clean Ubuntu machine, install Node 22, run `npm ci` to install dependencies
> exactly as locked, then run three checks in order —
>
> 1. `npm run typecheck` — TypeScript compiles with no type errors (`tsc --noEmit`)
> 2. `npm run lint` — ESLint finds no problems (`expo lint`)
> 3. `npm run test:ci` — all Jest unit tests pass (`jest --ci --coverage`)
>
> If any one fails, the whole run is marked failed.

These are the same three commands you can run on your own machine. CI just guarantees nobody
forgets, and that it passes on a clean checkout (not "works on my machine").

### How to read it

- **On GitHub:** every commit gets a tiny ✓ or ✗ next to it. Click it, or open the **Actions**
  tab, to see which step failed and the full logs.
- **On a pull request:** there's a "Checks" section at the bottom. Green = safe to merge.
- **Email:** GitHub emails you when a run you caused fails.

### When CI fails

1. Open the Actions tab, click the red run, click the failed step, read the log.
2. Reproduce locally with the same command (`npm run typecheck` / `npm run lint` / `npm run test`).
3. Fix, commit, push. CI re-runs automatically on the new commit.

### Run the checks before you push (recommended)

```bash
npm run typecheck && npm run lint && npm run test
```

If that passes locally, CI will almost certainly pass too.

### Optional: make CI mandatory

By default CI *reports* pass/fail but doesn't *stop* a broken merge. To block merging when CI is
red:

**GitHub repo → Settings → Branches → Add branch ruleset (or protection rule) for `master` →
enable "Require status checks to pass" → select the `checks` job.**

Do this once you're working with pull requests. For solo direct-to-`master` work it's optional.

### What CI here does NOT do

- No app build, no Android emulator, no Maestro end-to-end tests (Part 1). Those need the native
  SMS module and a dev client, which are too heavy for CI (`SPEC-implementation.md` §34.0).
  They're run by hand against an EAS `development` build before a release.
- It doesn't deploy or publish anything.

### Cost

GitHub Actions is free for public repos. For a private repo you get 2,000 free minutes/month;
this job takes ~2–3 minutes per run, so a normal week is well under the limit.
