import type { EngineInterface, Register } from 'claude-code'

const PANE = 'prompt-jump'
const MAX_ROWS = 20
const MAX_ENTRIES = 100

type Prompt = { id: string; text: string }

// Filled from the transcript file each time the list opens. A prompt's `uuid`
// there is its transcript row's requestId, which $.ui.scroll targets.
let prompts: Prompt[] = []
// One color per prompt row, newest first; set with the list.
let colors: string[] = []
const HOTKEYS = 9 // prompts 1–9 take a number key; 10 and up are arrows only

// ── Row colors ──────────────────────────────────────────────────────────────
// A mod can name a theme color but not read its value, so the accent ("claude",
// the theme's highlight) and the background are looked up from the theme's name.
// The newest prompt gets the accent; older ones step lighter, never past the
// point where the text drops below WCAG AA contrast (4.5:1) on the background.
type RGB = [number, number, number]

const ACCENT: Record<string, RGB> = {
  dark: [215, 119, 87],
  light: [215, 119, 87],
  'dark-daltonized': [255, 153, 51],
  'light-daltonized': [255, 153, 51],
}
const BACKGROUND = { dark: [30, 30, 30] as RGB, light: [255, 255, 255] as RGB }
const MIN_CONTRAST = 4.5
const START_CONTRAST = 7 // a light background darkens the accent to this first
const MAX_LIGHTEN = 0.6 // past this the rows read as gray, not as the accent

const mix = (from: RGB, to: RGB, t: number): RGB =>
  [0, 1, 2].map(k => Math.round(from[k]! + (to[k]! - from[k]!) * t)) as RGB

const luminance = (c: RGB) => {
  const [r, g, b] = c.map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as RGB
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: RGB, b: RGB) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const hex = (c: RGB) => `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`

const rowColors = (theme: string, count: number): string[] => {
  const accent = ACCENT[theme] ?? ACCENT[theme.startsWith('light') ? 'light' : 'dark']!
  // ANSI themes have 16 colors and can't blend: every row takes the theme key.
  if (theme.endsWith('-ansi') || count === 0) return Array(count).fill('claude')
  // "auto" follows the terminal, which a mod can't read; most are dark.
  const isLight = theme.startsWith('light')
  const bg = isLight ? BACKGROUND.light : BACKGROUND.dark

  // On a light background lightening lowers contrast, so start from a darker accent.
  let start = accent
  for (let t = 0.05; isLight && contrast(start, bg) < START_CONTRAST && t <= 1; t += 0.05) {
    start = mix(accent, [0, 0, 0], t)
  }
  let maxT = 0
  for (let t = 0.02; t <= MAX_LIGHTEN && contrast(mix(start, [255, 255, 255], t), bg) >= MIN_CONTRAST; t += 0.02) {
    maxT = t
  }
  return Array.from({ length: count }, (_, i) => {
    const age = count === 1 ? 0 : i / (count - 1) // 0 newest … 1 oldest
    return hex(mix(start, [255, 255, 255], maxT * age))
  })
}

const oneLine = (text: string, width: number) => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > width ? `${line.slice(0, Math.max(1, width - 1))}…` : line
}

const contentText = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(block => (block && typeof block === 'object' && 'text' in block ? String(block.text) : ''))
    .join(' ')
}

// The transcript outgrows $.fs.read's 4 MiB cap, so grep (in command.run) hands
// back only the person's prompt lines (typed or an accepted suggestion). Slash
// commands and engine notices start with a tag.
const GREP_TYPED = 'grep -h -F \'"origin":{"kind":"human"}\' "$HOME"/.claude/projects/*/"$1".jsonl'

const parsePrompts = (stdout: string): Prompt[] => {
  const found: Prompt[] = []
  for (const line of stdout.split('\n')) {
    if (!line) continue
    try {
      const row = JSON.parse(line)
      const text = contentText(row?.message?.content).trim()
      if (row?.type === 'user' && row.uuid && text && !text.startsWith('<')) found.push({ id: row.uuid, text })
    } catch {
      // a partial line mid-write; skip it
    }
  }
  return found.slice(-MAX_ENTRIES).reverse() // newest first: the last prompt is 1
}

// Re-read the prompts and the theme, then redraw the pane.
const refresh = async ($: EngineInterface) => {
  const { stdout } = await $.process.run(['sh', '-c', GREP_TYPED, 'sh', await $.session.id()])
  prompts = parsePrompts(stdout)
  const theme = (await $.config.list()).find(row => row.key === 'theme')?.value
  colors = rowColors(typeof theme === 'string' ? theme : 'dark', prompts.length)
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prompts',
      description: 'Pick a recent prompt (↑/↓, Enter) and scroll back to it',
    })
    return next(e)
  })

  on('command.run', { command: 'prompts' }, async $ => {
    await refresh($)
    if (prompts.length === 0) return { text: 'No prompts in this session yet.' }
    // No closeOnEscape: Esc hands the keys back and the pane stays, as a tab
    // beside other plugins' panes; its close mark (or ctrl+x x) closes it.
    await $.ui.open({
      id: PANE,
      title: 'Prompts',
      focus: true,
      rows: Math.min(prompts.length, MAX_ROWS) + 1,
    })
    return { text: '' }
  })

  // Keep an open list current: the prompt just answered becomes 1.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && (await $.ui.panes()).some(pane => pane.id === PANE)) await refresh($)
    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const width = Math.max(10, e.props.bodyColumns - 6)

    // The pane stays open after a jump, so another number or arrow follows on.
    const jump = async (id: string) => {
      // Scroll first: a transcript row moves only while the call answers the
      // person's key, and an awaited focus move before it spends that.
      const moved = await $.ui.scroll({ to: { requestId: id }, block: 'start' })
      // A number key presses its row without moving the ring; put the ring on
      // the row the transcript now shows, so ↑/↓ carry on from there.
      await $.ui.focus({ requestId: PANE, key: `p:${id}` })
      if ('deny' in moved && moved.deny) $.ui.toast(`Couldn't scroll there: ${moved.deny}`)
    }

    return (
      <Box flexDirection="column">
        <Text dimColor>1–9 or ↑/↓ + Enter jump · Esc back to prompt · 1 = latest</Text>
        {prompts.map(({ id, text }, i) => {
          // A plain Button draws its hotkey as `1: `; rows past the hotkeys
          // write their number the same way.
          const line = i < HOTKEYS ? oneLine(text, width) : `${i + 1}: ${oneLine(text, width - 1)}`
          return (
          <Button
            key={`p:${id}`}
            label={line}
            plain
            hotkey={i < HOTKEYS ? String(i + 1) : undefined}
            autoFocus={i === 0 ? true : undefined}
            onPress={() => void jump(id)}
          >
            <Text color={colors[i] ?? 'claude'}>{line}</Text>
          </Button>
          )
        })}
      </Box>
    )
  })
}
