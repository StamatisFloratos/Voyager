# Config and themes

When the user wants a setting changed for good, or set up from their dotfiles, edit `~/.config/voyager/config.json`
with `voyager config` instead of clicking through Settings. Voyager reads the file at launch and whenever it changes,
and never writes it; these commands don't need Voyager running.

```sh
voyager config init
voyager config list
voyager config set tabLayout top
voyager config set shortcuts.newTab cmd+shift+n
voyager config unset tabLayout
voyager config check
```

`init` creates the folder, `config.json` and the schemas; `list` shows every setting with its allowed values,
default and file value; shortcuts are one per command (`''` unbinds); `unset` leaves Voyager's current value in place;
`check` reports what Voyager would complain about.

Themes are colour overrides in `~/.config/voyager/themes/NAME.json`. `voyager theme new NAME` writes every dark and light
role with Voyager's values, so change only the ones the user asked about and delete the rest if they like;
`voyager theme use NAME` (or `none`) picks one, and `voyager theme check` checks it. Ask before replacing the user's
own theme or config values. Settings that grant control or send data somewhere (`cliControl`, custom search URLs,
page engines) can't go in the file; tell the user where they are in Settings instead.

To land on a new tab at launch while keeping the session, set `launchActions`:
`voyager config set launchActions '["newTab"]'`.
