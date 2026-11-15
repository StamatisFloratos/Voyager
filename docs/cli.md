# The Voyager command

The CLI can inspect tabs, run browser commands and manage configuration for a running Voyager instance. Its executable is `voyager`, its package is `voyager-cli`, and its Python sources live in [apps/cli/voyager_cli](../apps/cli/voyager_cli).

There is no published Voyager CLI tarball yet. To try the command from source with Python 3.13, create an isolated environment:

```sh
uv venv --python 3.13 apps/cli/.venv
uv pip install --python apps/cli/.venv/bin/python -e ./apps/cli
apps/cli/.venv/bin/voyager --help
```

Enable CLI control in Voyager’s settings before using browser commands. For a development build, point the command at that instance’s profile:

```sh
VOYAGER_DATA_DIR="$HOME/Library/Application Support/Voyager Dev" apps/cli/.venv/bin/voyager tabs
```

The CLI lists commands and options in `--help`. See [configuration](config.md) and [automation hooks](automation.md) for file formats. The [upstream CLI reference at the fork point](https://github.com/ardia-browser/ardia/blob/v0.2.46/docs/cli.md) documents the original feature set and its release process. Its hosted telemetry, installers, credentials and support links belong to Ardia.
