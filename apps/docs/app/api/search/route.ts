import { source } from '@/lib/source'
import { flexsearchFromSource } from 'fumadocs-core/search/flexsearch'

const server = flexsearchFromSource(source)

export const { GET } = server
