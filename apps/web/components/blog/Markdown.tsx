/**
 * Markdown — a small, dependency-free Markdown renderer (server component).
 *
 * Supports the subset used by Sippy blog posts: h2/h3/h4, paragraphs,
 * **bold**, *italic*, `code`, [links](url), - bullet lists, 1. ordered lists,
 * > blockquotes, --- rules, and standalone ![image](src) figures.
 * Content is authored in-repo, so the parser only needs to cover what we write.
 */
import React from 'react'

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // Order matters: link | bold | code | italic. Bold (**) is tried before
  // italic (*) so doubled stars never get misread as emphasis.
  const regex = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g
  let lastIndex = 0
  let i = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    const key = `${keyPrefix}-${i++}`
    if (match[1] !== undefined) {
      const href = match[2]
      const external = /^https?:\/\//.test(href)
      nodes.push(
        <a
          key={key}
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="text-brand-primary underline underline-offset-2 hover:text-brand-primary-hover transition-colors"
        >
          {match[1]}
        </a>
      )
    } else if (match[3] !== undefined) {
      nodes.push(
        <strong key={key} className="font-semibold text-[var(--text-primary)]">
          {match[3]}
        </strong>
      )
    } else if (match[4] !== undefined) {
      nodes.push(
        <code
          key={key}
          className="font-mono text-[0.85em] bg-[var(--bg-tertiary)] text-brand-primary px-1.5 py-0.5 rounded"
        >
          {match[4]}
        </code>
      )
    } else if (match[5] !== undefined) {
      nodes.push(<em key={key}>{match[5]}</em>)
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

const BLOCK_START = /^(#{2,4}\s|>\s?|[-*]\s+|\d+\.\s+|---+\s*$|!\[)/

export default function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') {
      i++
      continue
    }

    if (/^---+\s*$/.test(line)) {
      blocks.push(
        <hr key={key++} className="my-12 border-0 border-t border-[var(--border-strong)]" />
      )
      i++
      continue
    }

    const heading = line.match(/^(#{2,4})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      const txt = heading[2]
      const k = key++
      if (level === 2) {
        blocks.push(
          <h2
            key={k}
            className="font-display font-bold uppercase tracking-tight text-2xl sm:text-3xl text-[var(--text-primary)] mt-14 mb-4"
          >
            {renderInline(txt, `h2-${k}`)}
          </h2>
        )
      } else if (level === 3) {
        blocks.push(
          <h3
            key={k}
            className="font-display font-bold uppercase tracking-tight text-xl sm:text-2xl text-[var(--text-primary)] mt-10 mb-3"
          >
            {renderInline(txt, `h3-${k}`)}
          </h3>
        )
      } else {
        blocks.push(
          <h4
            key={k}
            className="font-display font-bold text-lg text-[var(--text-primary)] mt-8 mb-2"
          >
            {renderInline(txt, `h4-${k}`)}
          </h4>
        )
      }
      i++
      continue
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/)
    if (image) {
      const k = key++
      blocks.push(
        <figure key={k} className="my-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image[2]}
            alt={image[1]}
            className="w-full rounded-lg border border-[var(--border-strong)]"
          />
          {image[1] ? (
            <figcaption className="mt-2 text-center font-mono text-xs uppercase tracking-wider text-[var(--text-muted)]">
              {image[1]}
            </figcaption>
          ) : null}
        </figure>
      )
      i++
      continue
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      const k = key++
      blocks.push(
        <blockquote
          key={k}
          className="my-7 border-l-2 border-brand-primary pl-5 italic text-lg sm:text-xl text-[var(--text-secondary)]"
        >
          {renderInline(quote.join(' '), `bq-${k}`)}
        </blockquote>
      )
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''))
        i++
      }
      const k = key++
      blocks.push(
        <ul
          key={k}
          className="my-5 space-y-2 pl-5 list-disc marker:text-brand-primary text-lg leading-relaxed text-[var(--text-secondary)]"
        >
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `ul-${k}-${idx}`)}</li>
          ))}
        </ul>
      )
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      const k = key++
      blocks.push(
        <ol
          key={k}
          className="my-5 space-y-2 pl-5 list-decimal marker:text-brand-primary marker:font-mono text-lg leading-relaxed text-[var(--text-secondary)]"
        >
          {items.map((it, idx) => (
            <li key={idx} className="pl-1">
              {renderInline(it, `ol-${k}-${idx}`)}
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Paragraph: gather consecutive lines until a blank line or a block starter.
    // The current line is always consumed first, which guarantees forward
    // progress even if it looked like a block starter but matched no branch.
    const para: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() !== '' && !BLOCK_START.test(lines[i])) {
      para.push(lines[i])
      i++
    }
    const k = key++
    blocks.push(
      <p key={k} className="my-5 text-lg leading-relaxed text-[var(--text-secondary)]">
        {renderInline(para.join(' '), `p-${k}`)}
      </p>
    )
  }

  return <>{blocks}</>
}
