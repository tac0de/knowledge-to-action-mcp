import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { VaultError } from './errors.js';

export type ListNotesInput = {
  folder?: string;
  glob?: string;
  limit?: number;
};

export type ReadNoteInput = {
  path: string;
  maxBytes?: number;
};

export type SearchNotesInput = {
  query: string;
  caseSensitive?: boolean;
  limit?: number;
};

export type GetMetadataInput = {
  path: string;
};

export type ReadNoteOutput = {
  path: string;
  content: string;
  bytes: number;
  sha256: string;
  lineCount: number;
};

export type SearchMatch = {
  path: string;
  lineNumber: number;
  line: string;
};

export type MetadataOutput = {
  path: string;
  title?: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
};

export class VaultReader {
  readonly rootPath: string;
  readonly maxFileBytes: number;

  private constructor(rootPath: string, maxFileBytes: number) {
    this.rootPath = rootPath;
    this.maxFileBytes = maxFileBytes;
  }

  static async create(rootPath: string, maxFileBytes: number): Promise<VaultReader> {
    const resolved = path.resolve(rootPath);
    let stat;

    try {
      stat = await fs.stat(resolved);
    } catch {
      throw new VaultError('E_FILE_NOT_FOUND', `Vault root does not exist: ${rootPath}`);
    }

    if (!stat.isDirectory()) {
      throw new VaultError('E_INVALID_FOLDER', `Vault root is not a directory: ${rootPath}`);
    }

    const realRoot = await fs.realpath(resolved);
    return new VaultReader(realRoot, maxFileBytes);
  }

  async listNotes(input: ListNotesInput): Promise<{ notes: string[]; total: number }> {
    const limit = clampLimit(input.limit, 100, 1, 1000);
    const folder = input.folder ?? '.';
    const globPattern = input.glob?.trim() || '**/*.md';
    const folderAbs = await this.resolveExistingDirectory(folder);

    const notesInFolder = await fg([globPattern], {
      cwd: folderAbs,
      onlyFiles: true,
      absolute: false,
      dot: false,
      followSymbolicLinks: false,
      unique: true,
      suppressErrors: false
    });

    const mapped = notesInFolder
      .map((relativeInFolder) => {
        const fullPath = path.resolve(folderAbs, relativeInFolder);
        const relFromRoot = path.relative(this.rootPath, fullPath);
        return toPosixPath(relFromRoot);
      })
      .filter((value) => value.length > 0)
      .sort();

    const notes = mapped.slice(0, limit);
    return {
      notes,
      total: mapped.length
    };
  }

  async readNote(input: ReadNoteInput): Promise<ReadNoteOutput> {
    const maxBytes = input.maxBytes ?? this.maxFileBytes;
    const absolute = await this.resolveExistingFile(input.path);

    const stats = await fs.stat(absolute);
    if (stats.size > maxBytes) {
      throw new VaultError('E_MAX_BYTES_EXCEEDED', `File exceeds maxBytes (${stats.size} > ${maxBytes})`);
    }

    const buffer = await fs.readFile(absolute);
    const content = buffer.toString('utf8');

    return {
      path: toPosixPath(path.relative(this.rootPath, absolute)),
      content,
      bytes: buffer.byteLength,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      lineCount: content === '' ? 0 : content.split(/\r?\n/).length
    };
  }

  async searchNotes(input: SearchNotesInput): Promise<{ matches: SearchMatch[]; total: number }> {
    const query = input.query.trim();
    if (!query) {
      throw new VaultError('E_EMPTY_QUERY', 'Query must not be empty');
    }

    const limit = clampLimit(input.limit, 50, 1, 500);
    const caseSensitive = input.caseSensitive ?? false;
    const needle = caseSensitive ? query : query.toLowerCase();

    const { notes } = await this.listNotes({ glob: '**/*.md', limit: 5000 });
    const matches: SearchMatch[] = [];

    for (const notePath of notes) {
      const absolute = await this.resolveExistingFile(notePath);
      const stats = await fs.stat(absolute);
      if (stats.size > this.maxFileBytes) {
        continue;
      }

      const text = await fs.readFile(absolute, 'utf8');
      const lines = text.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const hay = caseSensitive ? line : line.toLowerCase();
        if (hay.includes(needle)) {
          matches.push({
            path: notePath,
            lineNumber: index + 1,
            line: line.trimEnd()
          });
        }
      }
    }

    const sorted = matches.sort((a, b) => {
      if (a.path === b.path) {
        return a.lineNumber - b.lineNumber;
      }
      return a.path.localeCompare(b.path);
    });

    return {
      matches: sorted.slice(0, limit),
      total: sorted.length
    };
  }

  async getMetadata(input: GetMetadataInput): Promise<MetadataOutput> {
    const absolute = await this.resolveExistingFile(input.path);
    const stats = await fs.stat(absolute);
    if (stats.size > this.maxFileBytes) {
      throw new VaultError('E_MAX_BYTES_EXCEEDED', `File exceeds maxBytes (${stats.size} > ${this.maxFileBytes})`);
    }

    const text = await fs.readFile(absolute, 'utf8');
    const parsed = matter(text);
    const normalizedFrontmatter = normalizeValue(parsed.data) as Record<string, unknown>;

    const titleFromFrontmatter = typeof normalizedFrontmatter.title === 'string' ? normalizedFrontmatter.title : undefined;
    const titleFromHeading = extractHeading(text);

    return {
      path: toPosixPath(path.relative(this.rootPath, absolute)),
      title: titleFromFrontmatter ?? titleFromHeading,
      tags: normalizeTags(normalizedFrontmatter.tags),
      frontmatter: normalizedFrontmatter
    };
  }

  private async resolveExistingDirectory(relativePath: string): Promise<string> {
    const safe = await this.resolveInsideRoot(relativePath || '.');
    let stat;
    try {
      stat = await fs.stat(safe);
    } catch {
      throw new VaultError('E_FILE_NOT_FOUND', `Directory not found: ${relativePath}`);
    }

    if (!stat.isDirectory()) {
      throw new VaultError('E_INVALID_FOLDER', `Not a directory: ${relativePath}`);
    }

    return safe;
  }

  private async resolveExistingFile(relativePath: string): Promise<string> {
    const safe = await this.resolveInsideRoot(relativePath);
    let stat;
    try {
      stat = await fs.stat(safe);
    } catch {
      throw new VaultError('E_FILE_NOT_FOUND', `File not found: ${relativePath}`);
    }

    if (!stat.isFile()) {
      throw new VaultError('E_INVALID_PATH', `Not a file: ${relativePath}`);
    }

    return safe;
  }

  private async resolveInsideRoot(relativePath: string): Promise<string> {
    if (!relativePath || typeof relativePath !== 'string') {
      throw new VaultError('E_INVALID_PATH', 'Path is required');
    }

    if (path.isAbsolute(relativePath)) {
      throw new VaultError('E_PATH_TRAVERSAL', 'Absolute paths are not allowed');
    }

    const normalized = path.normalize(relativePath);
    const candidate = path.resolve(this.rootPath, normalized);
    const rootWithSep = this.rootPath.endsWith(path.sep) ? this.rootPath : `${this.rootPath}${path.sep}`;

    if (!(candidate === this.rootPath || candidate.startsWith(rootWithSep))) {
      throw new VaultError('E_PATH_TRAVERSAL', 'Path traversal is not allowed');
    }

    try {
      const real = await fs.realpath(candidate);
      if (!(real === this.rootPath || real.startsWith(rootWithSep))) {
        throw new VaultError('E_PATH_TRAVERSAL', 'Symlink path traversal is not allowed');
      }
      return real;
    } catch {
      return candidate;
    }
  }
}

function clampLimit(value: number | undefined, fallback: number, min: number, max: number): number {
  const chosen = value ?? fallback;
  if (!Number.isFinite(chosen)) {
    return fallback;
  }
  const integer = Math.floor(chosen);
  return Math.max(min, Math.min(max, integer));
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function extractHeading(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : undefined;
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0)
      .sort();
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .sort();
  }

  return [];
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const next: Record<string, unknown> = {};
    for (const key of keys) {
      next[key] = normalizeValue(record[key]);
    }
    return next;
  }

  return value;
}
