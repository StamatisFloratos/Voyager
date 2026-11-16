# Voyager

Voyager is a personal fork of the [Ardia browser](https://github.com/ardia-browser/ardia), based on [Ardia 0.2.46](https://github.com/ardia-browser/ardia/releases/tag/v0.2.46). It brings Ardia’s Chromium engine, sidebar, split views and browser profiles to a separate macOS app named **Voyager**. Its app icon pairs a white orbit and star with a rainbow gradient. [Voyager artwork](docs/brand/voyager/)

## Build on a Mac

Use an Apple Silicon Mac with full Xcode 26 or later, CocoaPods, Node 24 and pnpm 11.1.3. The build fetches the Chromium framework for this checkout and verifies it against the committed SHA-256. Use a Git clone: the engine lookup needs the source tree’s Git identity.

```sh
git clone https://github.com/StamatisFloratos/Voyager.git
cd Voyager
pnpm install --frozen-lockfile
pnpm pods
pnpm dev
```

In a second terminal, run `pnpm macos`. The development app uses its own profile at `~/Library/Application Support/Voyager Dev`. To build a standalone app with its JavaScript bundled, run `pnpm --filter @voyager/browser build`. Its output is `apps/browser/build/Build/Products/Release/Voyager.app`.

This is a development fork. There is no notarized Voyager installer, Homebrew cask or automatic update feed. The personal build uses ad-hoc signing; do not rely on it to store passwords, passkeys or payment details. See [fork notes](docs/voyager.md) before switching your daily browser.

## Source and license

The desktop UI is in [apps/browser](apps/browser), its native integrations in [packages](packages), and the Chromium patches in [engine](engine). The upstream app and bundled engine are distributed under [GPLv3](LICENSE); Ardia’s own source files carry the [Apache 2.0 license](LICENSE.Apache-2.0). Original notices and third-party credits are preserved in [NOTICE](NOTICE).
