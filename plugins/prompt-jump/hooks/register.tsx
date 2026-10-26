import type { Register } from 'claude-code'

const PANE = 'prompt-jump'
const MAX_ROWS = 20
const MAX_ENTRIES = 100

type Prompt = { id: string; text: string }

// Filled from the transcript file each time the list opens. A prompt's `uuid`
// there is its transcript row's requestId, which $.ui.scroll targets.
let prompts: Prompt[] = []

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
  return found.slice(-MAX_ENTRIES)
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
    const { stdout } = await $.process.run(['sh', '-c', GREP_TYPED, 'sh', await $.session.id()])
    prompts = parsePrompts(stdout)
    if (prompts.length === 0) return { text: 'No prompts in this session yet.' }
    await $.ui.open({
      id: PANE,
      title: 'Recent prompts',
      focus: true,
      closeOnEscape: true,
      rows: Math.min(prompts.length, MAX_ROWS) + 1,
    })
    $.ui.invalidate('ui.render')
    return { text: '' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const width = Math.max(10, e.props.bodyColumns - 6)

    const jump = async (id: string) => {
      const moved = await $.ui.scroll({ to: { requestId: id }, block: 'start' })
      await $.ui.close({ id: PANE })
      if ('deny' in moved && moved.deny) $.ui.toast(`Couldn't scroll there: ${moved.deny}`)
    }

    return (
      <Box flexDirection="column">
        <Text dimColor>↑/↓ choose · Enter jump · Esc close</Text>
        {prompts.map(({ id, text }, i) => (
          <Button
            key={`p:${id}`}
            label={`${String(i + 1).padStart(2)} ${oneLine(text, width)}`}
            plain
            autoFocus={i === prompts.length - 1 ? true : undefined}
            onPress={() => void jump(id)}
          />
        ))}
      </Box>
    )
  })
}
