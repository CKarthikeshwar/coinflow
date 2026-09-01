# Building CoinFlow on your own machine and running it on your phone

A plain-language, step-by-step guide for building the app **locally** (on your Windows laptop)
instead of on Expo's cloud, and installing it on a **physical Android phone** over USB.

Written for someone who has just installed Android Studio and hasn't done Android development
before. Follow it top to bottom the first time. After that, only **Part 4** matters day to day.

---

## 0. What we're doing, and why

CoinFlow is a **custom native app**. It has a small piece of Kotlin code (`modules/coinflow-sms/`)
that listens for incoming SMS, plus the Expo **dev client**. Because of that:

- **The "Expo Go" app cannot run CoinFlow.** It only runs plain JavaScript apps.
- We need to **compile** the app ourselves into an `.apk` (an Android app file) and install it.

There are two ways to compile:

| Way | What it is | Do we use it? |
|---|---|---|
| **EAS cloud build** (`eas build`) | Expo compiles it on their servers, you download the result. | Works, but slow (long free-tier queue) and you already hit their outages. |
| **Local build** (`npx expo run:android`) | Your laptop compiles it, using the Android tools that came with Android Studio, and installs it straight onto your plugged-in phone. | **Yes — this guide.** Faster feedback, no queue, no upload. |

> **Note on `eas build --local`:** that command only works on macOS and Linux, **not Windows**.
> On Windows the equivalent is `npx expo run:android`, which is what we use here. (If you ever
> really want `eas build --local`, you'd have to install WSL2 + the Android SDK inside Ubuntu —
> see Part 7. Not worth it for normal development.)

### The big picture of what `npx expo run:android` does

When you run it, four things happen in order:

1. **Prebuild** — Expo generates a native `android/` folder from `app.json` + the config
   plugins (this is where your SMS permissions and the `<receiver>` get written into the Android
   manifest). This folder is disposable and is **git-ignored** — never commit it.
2. **Gradle build** — Android's build tool (Gradle) compiles the Java/Kotlin/C++ and your JS
   bundle into `app-debug.apk`. First time: 15–40 min and ~1–2 GB of downloads. After that:
   1–5 min.
3. **Install** — it pushes the `.apk` onto your connected phone over USB.
4. **Start Metro** — the JavaScript dev server starts so the app can load your code and
   hot-reload it as you edit.

Local builds use the **files currently on your disk** (not git), so uncommitted changes are
included.

---

## Part 1 — One-time computer setup

You do this section **once**. Open **Windows PowerShell** for the commands.

### 1.1 Check Node.js

```powershell
node --version
```

You should see `v20`, `v22`, or similar. If not, install the LTS from <https://nodejs.org>.
(You've been running `npm` already, so this is almost certainly fine.)

### 1.2 Install Java 17 (JDK)

Android's build needs **JDK 17** specifically — not 21, not 11.

1. Download **Eclipse Temurin JDK 17 (LTS)** for Windows x64 from
   <https://adoptium.net/temurin/releases/?version=17>. Pick the `.msi` installer.
2. Run it. Accept the defaults. It installs to something like
   `C:\Program Files\Eclipse Adoptium\jdk-17.0.xx-hotspot\`.

> You *can* instead point at the JDK bundled inside Android Studio
> (`C:\Program Files\Android\Android Studio\jbr`), but recent Android Studio ships JDK 21, which
> can cause odd Gradle errors with this React Native version. Installing Temurin 17 is the
> reliable path.

### 1.3 Install the Android SDK pieces (via Android Studio)

Open **Android Studio** → on the welcome screen click **More Actions ▸ SDK Manager**
(or inside a project: **File ▸ Settings ▸ Languages & Frameworks ▸ Android SDK**).

**Note the "Android SDK Location" shown at the top** — usually
`C:\Users\<you>\AppData\Local\Android\Sdk`. You'll need it in step 1.4.

**Tab "SDK Platforms":**
- Tick **Android 16 (API level 36)**.

**Tab "SDK Tools"** — tick the box **"Show Package Details"** (bottom right), then select:
- **Android SDK Build-Tools** → `36.0.0`
- **NDK (Side by side)** → `27.1.12297006`  *(the C++ toolchain; the animation libraries need it)*
- **CMake** → the newest listed (e.g. `3.22.1` or `3.31.x`)
- **Android SDK Command-line Tools (latest)**
- **Android SDK Platform-Tools**  *(this contains `adb`, the tool that talks to your phone)*
- **Android Emulator** — optional; you're using a real phone, but leaving it ticked does no harm.

Click **Apply** and let it download.

### 1.4 Set environment variables (so the tools can find each other)

Paste this into **PowerShell**, editing the two paths if yours differ (from step 1.2 and 1.3):

```powershell
# --- Android SDK location (from the SDK Manager window) ---
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")

# --- Java 17 location (check the exact folder name under Eclipse Adoptium) ---
$jdk = (Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Directory | Where-Object Name -like "jdk-17*" | Select-Object -First 1).FullName
[Environment]::SetEnvironmentVariable("JAVA_HOME", $jdk, "User")

# --- add the tool folders to your PATH ---
$sdk  = "$env:LOCALAPPDATA\Android\Sdk"
$path = [Environment]::GetEnvironmentVariable("Path", "User")
foreach ($d in @("$sdk\platform-tools", "$sdk\cmdline-tools\latest\bin", "$sdk\emulator", "$jdk\bin")) {
  if ($path -notlike "*$d*") { $path = "$path;$d" }
}
[Environment]::SetEnvironmentVariable("Path", $path, "User")
```

**Close and reopen PowerShell** (and VS Code, if open) so the new variables take effect.

### 1.5 Accept the Android SDK licenses

```powershell
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --licenses
```

Press `y` and Enter for each prompt until it says all licenses are accepted. (Skipping this
gives a "You have not accepted the license agreements" error mid-build.)

### 1.6 Verify everything

```powershell
node --version                # v20 / v22
java -version                 # must say "17.0.x"  (look at the first line)
adb --version                 # "Android Debug Bridge version 1.0.xx"
echo $env:ANDROID_HOME        # your SDK path
echo $env:JAVA_HOME           # your JDK 17 path
```

Then, from the project folder:

```powershell
cd D:\IISc\Projects\coinflow
npx expo-doctor
```

`expo-doctor` checks the project for common problems. A few warnings are OK; hard errors it
prints in red should be fixed before building.

---

## Part 2 — One-time phone setup

### 2.1 Turn on Developer Options

On the phone: **Settings ▸ About phone ▸ Build number**. Tap **Build number** 7 times.
It says "You are now a developer!".

(On some phones Build number is under **Settings ▸ About phone ▸ Software information**.)

### 2.2 Turn on USB debugging

**Settings ▸ System ▸ Developer options** (on Samsung: **Settings ▸ Developer options**):
- Enable **USB debugging**.
- Enable **Install via USB** if your phone has it (Xiaomi/Oppo/Vivo do).

### 2.3 Connect the phone and authorize it

1. Plug the phone into the laptop with a **data-capable USB cable** (some cables are
   charge-only and won't work).
2. On the phone, a dialog pops up: **"Allow USB debugging?"** — tick **"Always allow from this
   computer"** and tap **Allow**.
3. Check the laptop sees it:

   ```powershell
   adb devices
   ```

   You want:

   ```
   List of devices attached
   ABCD1234XYZ     device
   ```

   - `unauthorized` → you didn't tap **Allow** on the phone. Unplug, replug, watch for the popup.
   - Nothing listed → try another cable / USB port; on Xiaomi/Oppo also enable "Install via USB".

---

## Part 3 — Build and run CoinFlow (first time)

From the project root, in your reopened PowerShell:

```powershell
cd D:\IISc\Projects\coinflow

# 1. make sure JS dependencies are installed
npm install

# 2. build the app, install it on the phone, and start the dev server
npx expo run:android
```

What you'll see:

- `› Building app…` and a long stream of Gradle `> Task :…` lines. **First run is 15–40 min.**
  Let it work. It's downloading Gradle, the Android build plugin, and compiling native code
  (including your `coinflow-sms` module).
- If more than one device/emulator is connected it asks which to use — pick your phone.
  (Or force it: `npx expo run:android --device`.)
- When it finishes: the **coinflow** app opens on your phone by itself, and the terminal now
  shows the **Metro** dev server ("Waiting on http://localhost:8081", a QR code, a menu).

The app right now is just a placeholder Home screen ("CoinFlow — Home coming soon"). That's
expected — the screens get built in the next implementation steps. What matters is that it
**builds, installs, and launches**.

Leave the Metro terminal running while you work. Press `r` in it to reload the app, `j` to open
the debugger, `m` to toggle the dev menu.

---

## Part 4 — Everyday workflow (after the first build)

This is the part you'll actually use repeatedly.

### If you only changed JavaScript / TypeScript / styles / images

**No rebuild needed.** Just run the dev server:

```powershell
npx expo start --dev-client
```

Then open the **coinflow** app on your phone (with the phone on the **same Wi-Fi** as the
laptop, or still plugged in via USB). It connects to Metro and your changes hot-reload in a
second or two. Save a file → the app updates.

If it doesn't connect, with the phone plugged in run:

```powershell
adb reverse tcp:8081 tcp:8081
```

then reopen the app.

### If you changed anything "native", you must rebuild

Run `npx expo run:android` again. "Native" changes are:

| Changed… | Rebuild? |
|---|---|
| Anything in `modules/coinflow-sms/` (the Kotlin files, `app.plugin.js`) | **Yes** |
| `app.json` (permissions, plugins, name, icons, package) | **Yes** |
| Added / removed / upgraded a dependency that has native code (any `expo-*`, `react-native-*`) | **Yes** |
| `package.json` `main`, `babel.config.js`, `metro.config.js` | Usually yes (safest to rebuild) |
| `.ts` / `.tsx` / `.js` app code, JSON, assets, `src/**` | No — just Metro |

### Force a clean rebuild (when things act weird)

```powershell
npx expo prebuild --clean        # deletes and regenerates the android/ folder
npx expo run:android
```

or simply delete the `android` folder and run `npx expo run:android` again.

---

## Part 5 — Getting an `.apk` file you can share or keep

After a successful `npx expo run:android`, the installable file is at:

```
D:\IISc\Projects\coinflow\android\app\build\outputs\apk\debug\app-debug.apk
```

You can copy that to another phone and install it (that phone needs "Install unknown apps"
allowed for your file manager). This is a **debug** APK — it needs Metro running to load JS
unless you also bundle it, and it's signed with a throwaway debug key. A proper standalone
**release** APK (self-contained, signed for distribution) is a later concern covered by the
`SPEC/PLAN.md` §12 step 7 "Ship" task; don't worry about it now.

---

## Part 6 — Troubleshooting

| Symptom | Fix |
|---|---|
| `SDK location not found` / `ANDROID_HOME is not set` | Env var missing or terminal not restarted. Redo **1.4**, open a fresh PowerShell. |
| `You have not accepted the license agreements` | Run the `sdkmanager --licenses` command from **1.5**. |
| `java -version` shows 21 or 11, build fails with `Unsupported class file major version` / `invalid source release: 17` | Wrong JDK. Set `JAVA_HOME` to the **JDK 17** folder (redo **1.4**), reopen PowerShell, confirm `java -version` says 17. |
| `NDK not found` / `No version of NDK matched` | Install **NDK 27.1.12297006** in SDK Manager (**1.3**), or make sure licenses are accepted so Gradle can fetch it. |
| Gradle fails with `Java heap space` / `OutOfMemoryError` | Close Chrome/other heavy apps and retry; the build wants ~4–8 GB free RAM. |
| `adb devices` shows `unauthorized` | Unplug, replug, tap **Allow** (+ "Always allow") on the phone. |
| `adb devices` shows nothing | Charge-only cable, dead USB port, or missing OEM driver. Try another cable/port; on Xiaomi/Oppo/Vivo also enable **Install via USB**. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` / `signatures do not match` | An old copy is installed. `adb uninstall com.ckworkforce.coinflow`, then rebuild. |
| App opens but shows **"Could not connect to development server"** (red screen) | Metro isn't running or unreachable. Start `npx expo start --dev-client`; with USB run `adb reverse tcp:8081 tcp:8081`; make sure laptop + phone are on the same Wi-Fi. |
| Windows firewall popup for **Node.js** on first `expo start` | Click **Allow access** (at least for Private networks) so the phone can reach Metro. |
| Build errors about long paths (`Filename too long`) | Run once in an **admin** PowerShell: `git config --system core.longpaths true`, and enable Windows long paths (Settings ▸ search "long paths"). |
| `expo run:android` picks an emulator instead of the phone | `npx expo run:android --device` and choose your phone from the list. |
| It opened the **Expo Go** app, not CoinFlow | Expo Go can't run this app. Open the **coinflow** app icon directly. If Expo Go was installed, ignore it. |

---

## Part 7 — (Optional) `eas build --local` via WSL2

Only if you specifically want to reproduce the **cloud** build on your machine. `eas build
--local` needs Linux or macOS.

1. Install **WSL2** with Ubuntu: in an admin PowerShell, `wsl --install`, reboot.
2. Inside Ubuntu: install Node 22, Java 17 (`sudo apt install openjdk-17-jdk`), and the Android
   command-line tools; set `ANDROID_HOME` / `ANDROID_SDK_ROOT` and accept licenses (same idea as
   Part 1, Linux paths).
3. Clone the repo *inside* the WSL filesystem (`~/coinflow`, **not** `/mnt/d/...` — that's slow),
   `npm install`, then:
   ```bash
   npx eas-cli build --profile development --platform android --local
   ```
4. The finished `.apk` lands in the project folder; install it with
   `adb install -r <file>.apk` (adb works from WSL if `usbipd` is set up, or just copy the file
   to Windows and install with the Windows `adb`).

For day-to-day work, **`npx expo run:android` from Windows (Parts 3–4) is simpler and faster** —
use that unless you have a concrete reason not to.

---

## Appendix — CoinFlow-specific facts to remember

- **Package name / app id:** `com.ckworkforce.coinflow`. Uninstall with
  `adb uninstall com.ckworkforce.coinflow`.
- **This is a dev-client build.** It contains the Expo dev menu (shake the phone or press `m` in
  Metro). It is *not* the same as Expo Go.
- **`android/` and `ios/` are generated** by prebuild and are in `.gitignore`. If you see them in
  `git status`, something added them by mistake — don't commit them.
- **The `coinflow-sms` native module** is picked up automatically (Expo autolinking finds
  anything under `modules/` with an `expo-module.config.json`). No manual linking.
- **SMS permissions** (`RECEIVE_SMS`, `READ_SMS`) are declared in the manifest via the module's
  config plugin. The app will ask for them at runtime in a later step; for now nothing prompts.
- **`.easignore`** only affects EAS *cloud* builds. Local builds ignore it.
- **Local builds use your working tree**, so you don't have to commit before building — but do
  commit before an **EAS** build, because that one uploads from git.
