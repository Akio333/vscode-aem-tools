import * as fs from 'fs/promises';
import * as path from 'path';
import { Parser } from 'htmlparser2';
import { fileURLToPath } from 'url';

export interface OsgiAttribute {
  id: string;
  name?: string;
  type: string;
  defaultValue?: string;
  required: boolean;
  cardinality: number;
  options: OsgiOption[];
  description?: string;
}

export interface OsgiOption {
  value: string;
  label?: string;
}

export interface OsgiOcd {
  id: string;
  name?: string;
  description?: string;
  attributes: Map<string, OsgiAttribute>;
}

// Maps PID -> OCD configuration definition
const ocdIndex = new Map<string, OsgiOcd>();

// Internal map of ocdId -> OsgiOcd
const ocdMap = new Map<string, OsgiOcd>();

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

/**
 * Parses a single OSGi metatype XML file content and populates the index.
 */
export function parseMetatypeXml(
  content: string,
  targetIndex: Map<string, OsgiOcd> = ocdIndex,
  targetOcds: Map<string, OsgiOcd> = ocdMap
) {
  let currentOcd: OsgiOcd | null = null;
  let currentAttribute: OsgiAttribute | null = null;
  const localOcds = new Map<string, OsgiOcd>();
  const localDesignates: { pid?: string; factoryPid?: string; ocdref: string }[] = [];

  const parser = new Parser({
    onopentag(name, attribs) {
      const localName = name.split(':').pop() || '';
      
      if (localName === 'OCD') {
        const id = attribs.id;
        if (id) {
          currentOcd = {
            id,
            name: attribs.name,
            description: attribs.description,
            attributes: new Map()
          };
          localOcds.set(id, currentOcd);
        }
      } else if (localName === 'AD' && currentOcd) {
        const id = attribs.id;
        if (id) {
          currentAttribute = {
            id,
            name: attribs.name,
            type: attribs.type || 'String',
            defaultValue: attribs.default,
            // The OSGi Metatype default is true when the attribute is omitted.
            required: attribs.required !== 'false',
            cardinality: Number.parseInt(attribs.cardinality || '0', 10) || 0,
            options: [],
            description: attribs.description
          };
          currentOcd.attributes.set(id, currentAttribute);
        }
      } else if (localName === 'Option' && currentAttribute) {
        const value = attribs.value;
        if (value !== undefined) {
          currentAttribute.options.push({ value, label: attribs.label });
        }
      } else if (localName === 'Designate') {
        const pid = attribs.pid;
        const factoryPid = attribs.factoryPid;
        const ocdref = attribs.ocdref;
        if (ocdref && (pid || factoryPid)) {
          localDesignates.push({ pid, factoryPid, ocdref });
        }
      } else if (localName === 'Object' && localDesignates.length > 0) {
        // Double check ocdref if inside Object tag
        const ocdref = attribs.ocdref;
        if (ocdref) {
          localDesignates[localDesignates.length - 1].ocdref = ocdref;
        }
      }
    },
    onclosetag(name) {
      const localName = name.split(':').pop() || '';
      if (localName === 'AD') {
        currentAttribute = null;
      }
      if (localName === 'OCD') {
        currentOcd = null;
      }
    }
  }, { xmlMode: true, lowerCaseTags: false, lowerCaseAttributeNames: false });

  parser.write(content);
  parser.end();

  // Merge into main maps
  for (const [id, ocd] of localOcds.entries()) {
    targetOcds.set(id, ocd);
    targetIndex.set(id, ocd); // Default mapping: OCD ID as PID fallback
  }

  for (const des of localDesignates) {
    const targetOcd = targetOcds.get(des.ocdref);
    if (targetOcd) {
      if (des.pid) {
        targetIndex.set(des.pid, targetOcd);
      }
      if (des.factoryPid) {
        targetIndex.set(des.factoryPid, targetOcd);
      }
    }
  }
}

let indexGeneration = 0;

/**
 * Scan workspace for OSGi metatypes. The new index is built on the side and
 * swapped in at the end so lookups never see a half-built index, and a scan
 * superseded by a newer one is discarded.
 */
export async function initializeOsgiIndex(workspaceRoots: string[]) {
  const generation = ++indexGeneration;
  const nextIndex = new Map<string, OsgiOcd>();
  const nextOcds = new Map<string, OsgiOcd>();

  for (let root of workspaceRoots) {
    if (root.startsWith('file://')) {
      root = fileURLToPath(root);
    }
    const metatypeFiles = await findFiles(root, /\.xml$/);
    for (const filePath of metatypeFiles) {
      // Normalise separators so the check also matches on Windows.
      if (filePath.replace(/\\/g, '/').includes('OSGI-INF/metatype')) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          parseMetatypeXml(content, nextIndex, nextOcds);
        } catch (err) {
          // Ignore parse errors
        }
      }
    }
    if (generation !== indexGeneration) {
      return;
    }
  }

  if (generation !== indexGeneration) {
    return;
  }
  ocdIndex.clear();
  ocdMap.clear();
  nextIndex.forEach((ocd, pid) => ocdIndex.set(pid, ocd));
  nextOcds.forEach((ocd, id) => ocdMap.set(id, ocd));
}

/**
 * Retrieves the OCD definition matching a PID or Factory PID.
 */
export function getOcdForPid(pid: string): OsgiOcd | undefined {
  return ocdIndex.get(pid);
}

/**
 * Returns all indexed PIDs.
 */
export function getAllPids(): string[] {
  return Array.from(ocdIndex.keys());
}
