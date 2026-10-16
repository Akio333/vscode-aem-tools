import { Location, Position, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fileURLToPath, pathToFileURL } from 'url';
import * as path from 'path';
import * as fs from 'fs/promises';

import { resolveClientLibAssetPath } from './clientlibTxtCompletion';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolves an HTL include/use path. Absolute paths are relative to the
 * `jcr_root` directory that contains the current file.
 */
function resolveHtlPath(currentDir: string, value: string): string {
  if (value.startsWith('/')) {
    const normalizedDir = currentDir.replace(/\\/g, '/');
    const marker = '/jcr_root';
    const rootIdx = normalizedDir.lastIndexOf(`${marker}/`);
    const rootEnd = rootIdx !== -1
      ? rootIdx + marker.length
      : normalizedDir.endsWith(marker) ? normalizedDir.length : -1;
    if (rootEnd !== -1) {
      return path.join(normalizedDir.substring(0, rootEnd), value);
    }
  }
  return path.join(currentDir, value);
}

/**
 * Parses current file to find the template file path for a Use variable
 */
function findTemplatePathForVar(text: string, varName: string): string | null {
  // Regex: data-sly-use.varName="path.html"
  const regex = new RegExp(`data-sly-use\\.${escapeRegExp(varName)}\\s*=\\s*["']([^"']+)["']`, 'i');
  const match = text.match(regex);
  return match ? match[1] : null;
}

/**
 * Scans a file to find the definition line of `<template data-sly-template.name`
 */
async function findTemplateDefinitionLocation(
  filePath: string,
  templateName: string
): Promise<Location | null> {
  try {
    const text = await fs.readFile(filePath, 'utf-8');
    const lines = text.split(/\r?\n/);
    const regex = new RegExp(`data-sly-template\\.${escapeRegExp(templateName)}\\b`);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(regex);
      if (match && match.index !== undefined) {
        return {
          uri: pathToFileURL(filePath).toString(),
          range: Range.create(i, match.index, i, match.index + match[0].length)
        };
      }
    }
  } catch (err) {
    // File not found or read error
  }
  return null;
}

export async function getDefinitionSupport(
  document: TextDocument,
  position: Position
): Promise<Location | Location[] | null> {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const uri = document.uri;

  // 1. js.txt or css.txt Definition Resolution
  if (uri.endsWith('js.txt') || uri.endsWith('css.txt')) {
    const lines = text.split(/\r?\n/);
    const lineText = lines[position.line] || '';
    const fileUri = await resolveClientLibAssetPath(uri, lineText, text, position.line);
    if (fileUri) {
      return {
        uri: fileUri,
        range: Range.create(0, 0, 0, 0)
      };
    }
    return null;
  }

  // 2. HTL Templates navigation
  if (document.languageId === 'htl' || document.languageId === 'html' || uri.endsWith('.html') || uri.endsWith('.htl')) {
    const currentFile = fileURLToPath(uri);
    const currentDir = path.dirname(currentFile);

    // Get the word/string at the cursor
    // Search backward and forward for quotes or curly braces
    const before = text.substring(0, offset);
    const after = text.substring(offset);

    // Scenario A: Include files, e.g. data-sly-include="header.html" or data-sly-use.h="header.html"
    const quoteBeforeMatch = before.match(/['"]([^'"]*)$/);
    const quoteAfterMatch = after.match(/^([^'"]*)['"]/);

    if (quoteBeforeMatch && quoteAfterMatch) {
      const value = quoteBeforeMatch[1] + quoteAfterMatch[1];
      if (value.endsWith('.html') || value.endsWith('.htl')) {
        const targetPath = resolveHtlPath(currentDir, value);

        try {
          await fs.stat(targetPath);
          return {
            uri: pathToFileURL(targetPath).toString(),
            range: Range.create(0, 0, 0, 0)
          };
        } catch (err) {
          // File not found
        }
      }
    }

    // Scenario B: Template Call, e.g. data-sly-call="${tmpl.name}" or "${name}"
    const exprBeforeMatch = before.match(/\$\{([^}]*)$/);
    const exprAfterMatch = after.match(/^([^}]*)\}/);
    if (exprBeforeMatch && exprAfterMatch) {
      const exprValue = (exprBeforeMatch[1] + exprAfterMatch[1]).trim();
      
      // Matches "tmpl.name" or just "name" (where we call a template)
      // Check if we are inside data-sly-call
      const slyCallIndex = before.lastIndexOf('data-sly-call');
      if (slyCallIndex !== -1 && before.substring(slyCallIndex).includes('${')) {
        
        if (exprValue.includes('.')) {
          // Case tmpl.name
          const parts = exprValue.split('.');
          const varName = parts[0].trim();
          const templateName = parts[1].split('@')[0].trim(); // Remove parameters if any

          const templateRelPath = findTemplatePathForVar(text, varName);
          if (templateRelPath) {
            const templateFullPath = resolveHtlPath(currentDir, templateRelPath);
            const loc = await findTemplateDefinitionLocation(templateFullPath, templateName);
            if (loc) return loc;
          }
        } else {
          // Case local template name
          const templateName = exprValue.split('@')[0].trim();
          const loc = await findTemplateDefinitionLocation(currentFile, templateName);
          if (loc) return loc;
        }
      }
    }
  }

  return null;
}
