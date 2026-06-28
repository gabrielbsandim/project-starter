import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const errors = []
const read = (p) => readFileSync(join(root, p), 'utf8')

function parseFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  const fields = {}
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
    if (m) fields[m[1]] = m[2].trim()
  }
  return fields
}

if (!existsSync(join(root, 'SKILL.md'))) {
  errors.push('SKILL.md is missing')
} else {
  const skill = read('SKILL.md')
  const fm = parseFrontmatter(skill)
  if (!fm) {
    errors.push('SKILL.md has no YAML frontmatter')
  } else {
    if (!fm.name) errors.push('SKILL.md frontmatter is missing "name"')
    if (fm.name && fm.name !== 'new-project') errors.push(`SKILL.md name should be "new-project", got "${fm.name}"`)
    if (!fm.description) errors.push('SKILL.md frontmatter is missing "description"')
    if (fm.description && fm.description.length > 1024) errors.push('SKILL.md description exceeds 1024 chars')
  }

  const referenced = new Set([...skill.matchAll(/references\/[\w-]+\.md/g)].map((m) => m[0]))
  for (const ref of referenced) {
    if (!existsSync(join(root, ref))) errors.push(`SKILL.md references "${ref}" which does not exist`)
  }

  const onDisk = existsSync(join(root, 'references'))
    ? readdirSync(join(root, 'references')).filter((f) => f.endsWith('.md'))
    : []
  for (const file of onDisk) {
    if (!referenced.has(`references/${file}`)) errors.push(`references/${file} exists but is not linked from SKILL.md`)
  }
}

if (errors.length > 0) {
  console.error('Skill validation failed:')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log('Skill validation passed.')
