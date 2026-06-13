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
  description?: string;
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
export function parseMetatypeXml(content: string) {
  let currentOcd: OsgiOcd | null = null;
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
          currentOcd.attributes.set(id, {
            id,
            name: attribs.name,
            type: attribs.type || 'String',
            defaultValue: attribs.default,
            required: attribs.required === 'true',
            description: attribs.description
          });
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
      if (localName === 'OCD') {
        currentOcd = null;
      }
    }
  }, { xmlMode: true, lowerCaseTags: false, lowerCaseAttributeNames: false });

  parser.write(content);
  parser.end();

  // Merge into main maps
  for (const [id, ocd] of localOcds.entries()) {
    ocdMap.set(id, ocd);
    ocdIndex.set(id, ocd); // Default mapping: OCD ID as PID fallback
  }

  for (const des of localDesignates) {
    const targetOcd = ocdMap.get(des.ocdref);
    if (targetOcd) {
      if (des.pid) {
        ocdIndex.set(des.pid, targetOcd);
      }
      if (des.factoryPid) {
        ocdIndex.set(des.factoryPid, targetOcd);
      }
    }
  }
}

/**
 * Scan workspace for OSGi metatypes.
 */
export async function initializeOsgiIndex(workspaceRoots: string[]) {
  ocdIndex.clear();
  ocdMap.clear();

  for (let root of workspaceRoots) {
    if (root.startsWith('file://')) {
      root = fileURLToPath(root);
    }
    const metatypeFiles = await findFiles(root, /\.xml$/);
    for (const filePath of metatypeFiles) {
      if (filePath.includes('OSGI-INF/metatype')) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          parseMetatypeXml(content);
        } catch (err) {
          // Ignore parse errors
        }
      }
    }
  }
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
