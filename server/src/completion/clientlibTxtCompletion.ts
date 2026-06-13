import * as fs from 'fs/promises';
import * as path from 'path';
import { CompletionItem, CompletionItemKind, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fileURLToPath } from 'url';

export async function getClientLibTxtCompletions(
  document: TextDocument,
  position: Position
): Promise<CompletionItem[]> {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const filePath = fileURLToPath(document.uri);
  const clientlibFolder = path.dirname(filePath);

  const lines = text.split(/\r?\n/);
  const currentLine = lines[position.line] || '';
  const textBeforeCursor = currentLine.substring(0, position.character).trim();

  // If line starts with # or base instruction, no file completions (except maybe #base=)
  if (textBeforeCursor.startsWith('#') && !textBeforeCursor.startsWith('#base=')) {
    return [];
  }

  // Find active #base in the document up to the current line
  let baseDir = clientlibFolder;
  for (let i = 0; i < position.line; i++) {
    const l = lines[i].trim();
    if (l.startsWith('#base=')) {
      const baseName = l.substring(6).trim();
      baseDir = path.join(clientlibFolder, baseName);
    }
  }

  // Determine typed prefix path
  let typedSegment = textBeforeCursor;
  if (typedSegment.startsWith('#base=')) {
    typedSegment = typedSegment.substring(6).trim();
    baseDir = clientlibFolder; // #base= folder is relative to clientlib root itself
  }

  // Resolve directory where we should search
  const lastSlash = typedSegment.lastIndexOf('/');
  let searchDir = baseDir;
  let filterPrefix = typedSegment;

  if (lastSlash !== -1) {
    const subPath = typedSegment.substring(0, lastSlash);
    searchDir = path.join(baseDir, subPath);
    filterPrefix = typedSegment.substring(lastSlash + 1);
  }

  const isJsTxt = filePath.endsWith('js.txt');
  const targetExtension = isJsTxt ? '.js' : '.css';

  const completions: CompletionItem[] = [];

  try {
    const entries = await fs.readdir(searchDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      
      const isDirectory = entry.isDirectory();
      const isTargetFile = entry.isFile() && entry.name.endsWith(targetExtension);

      if (isDirectory) {
        completions.push({
          label: entry.name,
          kind: CompletionItemKind.Folder,
          detail: 'Directory',
          insertText: entry.name + '/'
        });
      } else if (isTargetFile) {
        completions.push({
          label: entry.name,
          kind: CompletionItemKind.File,
          detail: isJsTxt ? 'JavaScript Source' : 'CSS Source'
        });
      }
    }
  } catch (err) {
    // Directory not found or inaccessible
  }

  return completions;
}

/**
 * Resolve target file for Go to Definition inside js.txt / css.txt.
 */
export async function resolveClientLibAssetPath(
  documentUri: string,
  lineText: string,
  fullText: string,
  lineIndex: number
): Promise<string | null> {
  const trimmed = lineText.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const clientlibFolder = path.dirname(fileURLToPath(documentUri));

  // Find active #base
  let baseFolder = clientlibFolder;
  const lines = fullText.split(/\r?\n/);
  for (let i = 0; i < lineIndex; i++) {
    const l = lines[i].trim();
    if (l.startsWith('#base=')) {
      const baseName = l.substring(6).trim();
      baseFolder = path.join(clientlibFolder, baseName);
    }
  }

  const assetPath = path.join(baseFolder, trimmed);
  try {
    const stat = await fs.stat(assetPath);
    if (stat.isFile()) {
      return `file://${assetPath}`;
    }
  } catch (err) {
    // File not found
  }
  return null;
}
