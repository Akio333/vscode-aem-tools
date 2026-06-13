import * as fs from 'fs/promises';
import * as path from 'path';
import { Parser } from 'htmlparser2';
import { fileURLToPath } from 'url';

export interface ClientLib {
  categories: string[];
  dependencies: string[];
  embed: string[];
  allowProxy: boolean;
  folderPath: string;
}

const clientLibsCache = new Map<string, ClientLib>(); // folderPath -> ClientLib
const categoryMap = new Map<string, ClientLib>();     // category -> ClientLib

function parseJcrArray(val: string): string[] {
  if (!val) return [];
  const trimmed = val.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
  }
  return [trimmed];
}

async function findFiles(dir: string, pattern: RegExp): Promise<string[]> {
  const results: string[] = [];
  try {
    const list = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of list) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'target') {
          results.push(...(await findFiles(fullPath, pattern)));
        }
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    // Ignore error
  }
  return results;
}

export async function scanClientLibFile(filePath: string) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    let isClientLib = false;
    let categories: string[] = [];
    let dependencies: string[] = [];
    let embed: string[] = [];
    let allowProxy = false;

    const parser = new Parser({
      onopentag(name, attribs) {
        if (name === 'jcr:root' || name.split(':').pop() === 'root') {
          if (attribs['jcr:primaryType'] === 'cq:ClientLibraryFolder') {
            isClientLib = true;
            categories = parseJcrArray(attribs['categories'] || '');
            dependencies = parseJcrArray(attribs['dependencies'] || '');
            embed = parseJcrArray(attribs['embed'] || '');
            allowProxy = attribs['allowProxy'] === '{Boolean}true' || attribs['allowProxy'] === 'true';
          }
        }
      }
    }, { xmlMode: true, lowerCaseTags: false, lowerCaseAttributeNames: false });

    parser.write(content);
    parser.end();

    if (isClientLib) {
      const folderPath = path.dirname(filePath);
      const cl: ClientLib = {
        categories,
        dependencies,
        embed,
        allowProxy,
        folderPath
      };
      clientLibsCache.set(folderPath, cl);
      for (const cat of categories) {
        categoryMap.set(cat, cl);
      }
    }
  } catch (err) {
    // Ignore parse errors
  }
}

/**
 * Scan workspace for ClientLibraries.
 */
export async function initializeClientLibsIndex(workspaceRoots: string[]) {
  clientLibsCache.clear();
  categoryMap.clear();

  for (let root of workspaceRoots) {
    if (root.startsWith('file://')) {
      root = fileURLToPath(root);
    }
    const contentXmlFiles = await findFiles(root, /\.content\.xml$/);
    for (const filePath of contentXmlFiles) {
      await scanClientLibFile(filePath);
    }
  }
}

export function getAllClientLibs(): ClientLib[] {
  return Array.from(clientLibsCache.values());
}

export function getClientLibByCategory(category: string): ClientLib | undefined {
  return categoryMap.get(category);
}

export function getClientLibByPath(folderPath: string): ClientLib | undefined {
  return clientLibsCache.get(folderPath);
}

export function getAllCategories(): string[] {
  return Array.from(categoryMap.keys());
}
