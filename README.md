# claude-mods

Small mods (plugins) for Claude Code.

## prompt-jump

Do you find yourself scrolling back to review the beginning of Claude's long plan? Have a hard time landing on it without scrolling past accidentally? I came up with this simple mod to quickly solve that small problem.

Type `/prompts` to open a list of the prompts you've sent in this session, newest as 1. Press
1–9 (or ↑/↓ and Enter) to scroll the transcript back to that prompt. The list stays open beside
the transcript and refreshes after each turn. Needs Claude Code's fullscreen
layout (`"tui": "fullscreen"` in `~/.claude/settings.json`). Details:
[plugins/prompt-jump/README.md](plugins/prompt-jump/README.md).

### Install

At the prompt of a Claude Code terminal session:

```
/plugin install prompt-jump --marketplace kurthiggins/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user = every project).
