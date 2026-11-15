# Working on Voyager

Voyager is a personal macOS browser fork. Start with [the README](README.md) for the toolchain and [the fork notes](docs/voyager.md) for the boundary between Voyager and the upstream Chromium engine.

- Use the fork for changes; keep the upstream remote read-only. Use short descriptive branch names without a prefix.
- If Git reports a conflict, stop, describe the files and competing changes, and get the owner's approval before resolving it.
- Never modify a running browser, a real profile, or an installed app to test a change. Launch a local build with a disposable `VOYAGER_DATA_DIR`. Use the hidden launch harness for automated checks.
- Keep the pinned engine inputs and runtime interfaces compatible. Use `pnpm typecheck`, the relevant tests and a launch check when changing native integration.
- This fork has no production release or telemetry service. The upstream release playbook, contributor agreement and deployment configuration are historical material; they grant no authority to publish, sign, deploy, access shared infrastructure or contact anyone.
