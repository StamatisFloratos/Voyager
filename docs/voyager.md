# Voyager fork notes

Voyager starts from Ardia’s stable `v0.2.46` tag (commit `4c10c4249ee07c905311444798bdb375f777fee8`). The fork’s default branch is `voyager`; `main` is the upstream development snapshot taken when the fork was created. Use the [Voyager issue tracker](https://github.com/StamatisFloratos/Voyager/issues) for this build.

## Which names change?

The installable Mac product, Xcode project, app menu, settings, localizations, CLI, internal page links and JavaScript package scope use Voyager. The Mac bundle identifier is `com.stamatisfloratos.voyager`. A local development build runs against its own profile and does not migrate an existing Ardia or Netnyahoo installation. Set `VOYAGER_DATA_DIR` to test with a disposable profile.

ArdiaCore is a dependency. The Apache and GPL notices, engine source, hashes, archive filenames and upstream download addresses keep their original names. The Mac framework for this tag has engine key `1c2355ca844e60155f5143097141d9502bfbaa66`. The upstream engine and its compiled interfaces still use names including ArdiaCore. Replacing them as text would invalidate the download or make the app fail at launch. Some engine-owned UI, diagnostic strings and keychain services may still say Ardia. A full engine rebrand requires rebuilding Chromium.

## Development builds and distribution

Voyager uses a separate app and profile, but ad-hoc builds use Chromium’s development keychain mode. Passkeys and payment features that require Apple entitlements are not available as in a properly signed browser. Before a daily-use release, supply your own signing and provisioning, build the engine with fork-owned secure-storage identities, test real credentials with a disposable profile, and configure and test your own signed update feed. Do not install upstream Ardia updates into Voyager.

The [Voyager app icon and traced mark](brand/voyager/) supply the browser and its companion targets. Historical screenshots, the old site, dashboard, videos, release notes and infrastructure describe Ardia, including its downloads and releases. The upstream GitHub deployment, CLA, release and moderation workflows are archived in `.github/upstream-workflows`; they do not run on this branch.

## Page loading on macOS

On a slow fresh navigation, the macOS pane can start its mesh while the new page is still connecting. A page that paints before the mesh starts stays visible as its remaining content loads. This also applies to cached reloads. Once the mesh appears, it covers the web view and its scrollbar, builds over 135 ms and stays opaque for at least 200 ms including its entrance. It dissolves over 185 ms once the viewport is usable. Time spent waiting for the page counts toward the minimum; it does not delay the network or the page.

After a restart, a saved tab that first opens in the foreground mounts an opaque backing with its web view. If the viewport is usable within the first 100 ms, the backing clears immediately. Otherwise it becomes the mesh and uses the same reveal. A tab already handed to the launch window or loaded in the background opens directly on selection.

Visible hero images, video posters and artwork in a gallery's visible cards count toward readiness. Small, read-only color samples update the mesh independently. Below-the-fold assets and background requests can continue after the reveal, and a stalled renderer or missing resource has a bounded wait. Clicks, typing and scrolling pass through to the page throughout. Reduce Motion skips the mesh. Normal reload (⌘R) uses the browser cache.

CSS colors and gradients are sampled without opening a drawing surface in the page. Only a decoded, same-origin photo can use a pixel read, after first contentful paint and within the sampling budget. On supported Chromium GPUs, Voyager enables the separate display compositor to reduce interruptions when a page reads pixels back during a scroll. [Measurements and offline reproduction](perf/first-scroll-readback.md)

## ChatGPT in the command bar

Choosing ChatGPT opens a normal chat with your prompt filled in. Press Send in ChatGPT when you’re ready. The same behavior applies to `!chatgpt` and `!cgpt`.
