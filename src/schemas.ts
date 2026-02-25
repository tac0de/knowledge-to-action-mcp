import * as z from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const toJsonSchema = zodToJsonSchema as unknown as (schema: unknown, name: string) => Record<string, unknown>;

const listNotesInputSchema = z.object({
  folder: z.string().optional(),
  glob: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional()
});

const listNotesOutputSchema = z.object({
  notes: z.array(z.string()),
  total: z.number().int().nonnegative()
});

const readNoteInputSchema = z.object({
  path: z.string().min(1),
  maxBytes: z.number().int().min(1).max(10_000_000).optional()
});

const readNoteOutputSchema = z.object({
  path: z.string(),
  content: z.string(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  lineCount: z.number().int().nonnegative()
});

const searchNotesInputSchema = z.object({
  query: z.string(),
  caseSensitive: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).optional()
});

const searchNotesOutputSchema = z.object({
  matches: z.array(
    z.object({
      path: z.string(),
      lineNumber: z.number().int().positive(),
      line: z.string()
    })
  ),
  total: z.number().int().nonnegative()
});

const getMetadataInputSchema = z.object({
  path: z.string().min(1)
});

const getMetadataOutputSchema = z.object({
  path: z.string(),
  title: z.string().optional(),
  tags: z.array(z.string()),
  frontmatter: z.record(z.string(), z.unknown())
});

export const toolSchemas = {
  listNotesInputSchema,
  listNotesOutputSchema,
  readNoteInputSchema,
  readNoteOutputSchema,
  searchNotesInputSchema,
  searchNotesOutputSchema,
  getMetadataInputSchema,
  getMetadataOutputSchema
} as const;

export const toolJsonSchemas = {
  'vault.list_notes': {
    input: toJsonSchema(listNotesInputSchema, 'vault.list_notes.input'),
    output: toJsonSchema(listNotesOutputSchema, 'vault.list_notes.output')
  },
  'vault.read_note': {
    input: toJsonSchema(readNoteInputSchema, 'vault.read_note.input'),
    output: toJsonSchema(readNoteOutputSchema, 'vault.read_note.output')
  },
  'vault.search_notes': {
    input: toJsonSchema(searchNotesInputSchema, 'vault.search_notes.input'),
    output: toJsonSchema(searchNotesOutputSchema, 'vault.search_notes.output')
  },
  'vault.get_metadata': {
    input: toJsonSchema(getMetadataInputSchema, 'vault.get_metadata.input'),
    output: toJsonSchema(getMetadataOutputSchema, 'vault.get_metadata.output')
  }
} as const;
