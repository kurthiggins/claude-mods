# prompt-jump

A Claude Code mod for jumping back to one of your earlier prompts in a long session.

Type `/prompts` to open a list of the prompts you've sent in this session, newest selected.
↑/↓ choose, Enter scrolls the transcript back to that prompt, Esc closes the list.

- Needs the fullscreen layout (`"tui": "fullscreen"` in `~/.claude/settings.json`); in the
  classic layout the transcript lives in the terminal's own scrollback and can't be scrolled.
- Prompts and their row ids are read from the session's transcript file with `grep`
  (the file outgrows a mod's 4 MiB read cap). Only your own prompts are listed — typed or an
  accepted suggestion; slash commands and system notices are left out.
- Mods can't register a key of their own, so there is no keyboard shortcut; `/pro` + Tab is close.
