# Voyager fork notes

Voyager starts from Ardia’s stable `v0.2.46` tag (commit `4c10c4249ee07c905311444798bdb375f777fee8`). The fork’s default branch is `voyager`; `main` is the upstream development snapshot taken when the fork was created. Use the [Voyager issue tracker](https://github.com/StamatisFloratos/Voyager/issues) for this build.

## Which names change?

The installable Mac product, Xcode project, app menu, settings, localizations, CLI, internal page links and JavaScript package scope use Voyager. The Mac bundle identifier is `com.stamatisfloratos.voyager`. A local development build runs against its own profile and does not migrate an existing Ardia or Netnyahoo installation. Set `VOYAGER_DATA_DIR` to test with a disposable profile.

ArdiaCore is a dependency. The Apache and GPL notices, engine source, hashes, archive filenames and upstream download addresses keep their original names. The Mac framework for this tag has engine key `1c2355ca844e60155f5143097141d9502bfbaa66`. The upstream engine and its compiled interfaces still use names including ArdiaCore. Replacing them as text would invalidate the download or make the app fail at launch. Some engine-owned UI, diagnostic strings and keychain services may still say Ardia. A full engine rebrand requires rebuilding Chromium.

## Development builds and distribution

Voyager uses a separate app and profile, but ad-hoc builds use Chromium’s development keychain mode. Passkeys and payment features that require Apple entitlements are not available as in a properly signed browser. Before a daily-use release, supply your own signing and provisioning, build the engine with fork-owned secure-storage identities, test real credentials with a disposable profile, and configure and test your own signed update feed. Do not install upstream Ardia updates into Voyager.

The existing icon and screenshots are upstream artwork. The old site, videos, release notes and infrastructure under `apps/site`, `apps/videos`, `docs/release-notes` and `infra` describe Ardia, including real downloads and historical releases. They are not a Voyager service or release history. The upstream GitHub deployment, CLA, release and moderation workflows are archived in `.github/upstream-workflows`; they do not run on this branch.
