#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { toolSchemas } from './schemas.js';
import { toMcpError } from './errors.js';
import { VaultReader } from './vault.js';

const SERVER_NAME = 'obsidian-mcp';
const SERVER_VERSION = '0.1.0';
const DEFAULT_MAX_FILE_BYTES = 262_144;

function getEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function getMaxFileBytes(): number {
  const raw = process.env.MAX_FILE_BYTES;
  if (!raw) {
    return DEFAULT_MAX_FILE_BYTES;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('MAX_FILE_BYTES must be a positive number');
  }
  return Math.floor(parsed);
}

function toToolResult<T extends object>(payload: T) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2)
      }
    ],
    structuredContent: payload
  };
}

export async function createServer(): Promise<McpServer> {
  const vaultRoot = getEnv('OBSIDIAN_VAULT_ROOT');
  const maxFileBytes = getMaxFileBytes();
  const reader = await VaultReader.create(vaultRoot, maxFileBytes);

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });

  server.registerTool(
    'vault.list_notes',
    {
      description: 'List notes in the vault using deterministic ordering.',
      annotations: { readOnlyHint: true, openWorldHint: false },
      inputSchema: toolSchemas.listNotesInputSchema.shape,
      outputSchema: toolSchemas.listNotesOutputSchema.shape
    },
    async (input) => {
      try {
        const output = await reader.listNotes(input);
        return toToolResult(output);
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.registerTool(
    'vault.read_note',
    {
      description: 'Read one note from the vault and return stable hash metadata.',
      annotations: { readOnlyHint: true, openWorldHint: false },
      inputSchema: toolSchemas.readNoteInputSchema.shape,
      outputSchema: toolSchemas.readNoteOutputSchema.shape
    },
    async (input) => {
      try {
        const output = await reader.readNote(input);
        return toToolResult(output);
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.registerTool(
    'vault.search_notes',
    {
      description: 'Search note contents in deterministic order.',
      annotations: { readOnlyHint: true, openWorldHint: false },
      inputSchema: toolSchemas.searchNotesInputSchema.shape,
      outputSchema: toolSchemas.searchNotesOutputSchema.shape
    },
    async (input) => {
      try {
        const output = await reader.searchNotes(input);
        return toToolResult(output);
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.registerTool(
    'vault.get_metadata',
    {
      description: 'Return frontmatter and metadata from a note.',
      annotations: { readOnlyHint: true, openWorldHint: false },
      inputSchema: toolSchemas.getMetadataInputSchema.shape,
      outputSchema: toolSchemas.getMetadataOutputSchema.shape
    },
    async (input) => {
      try {
        const output = await reader.getMetadata(input);
        return toToolResult(output);
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  return server;
}

async function main() {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} ${SERVER_VERSION} running on stdio`);
}

main().catch((error) => {
  console.error('FATAL', error);
  process.exit(1);
});
