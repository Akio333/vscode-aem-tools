import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import { getOcdForPid, OsgiOcd, OsgiAttribute } from '../osgi/osgiIndex';

/**
 * Extract OSGi PID from config file path.
 * Examples:
 * - org.apache.sling.commons.log.LogManager.cfg.json -> org.apache.sling.commons.log.LogManager
 * - org.apache.sling.commons.log.LogManager~factory.cfg.json -> org.apache.sling.commons.log.LogManager
 * - org.apache.sling.commons.log.LogManager.config -> org.apache.sling.commons.log.LogManager
 */
export function getPidFromPath(filePath: string): string {
  const basename = path.basename(filePath);
  // Remove extensions
  let clean = basename.replace(/\.cfg\.json$/, '').replace(/\.config$/, '');
  // Remove factory suffix (after ~)
  clean = clean.split('~')[0];
  return clean;
}

/**
 * Validate OSGi configurations (both .cfg.json and .config)
 */
export function validateOsgiConfig(document: TextDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const text = document.getText();
  const filePath = document.uri;
  
  const pid = getPidFromPath(filePath);
  const ocd = getOcdForPid(pid);

  if (!ocd) {
    // No metatype found for this PID - return empty (silent fallback)
    return [];
  }

  if (filePath.endsWith('.cfg.json')) {
    validateCfgJson(document, text, ocd, diagnostics);
  } else if (filePath.endsWith('.config')) {
    validateFelixConfig(document, text, ocd, diagnostics);
  }

  return diagnostics;
}

function validateCfgJson(
  document: TextDocument,
  text: string,
  ocd: OsgiOcd,
  diagnostics: Diagnostic[]
) {
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch (err: any) {
    // Syntax error diagnostics are usually handled by standard JSON extension,
    // but we can add a basic syntax error if parsing completely fails.
    let line = 0;
    let character = 0;
    const match = err.message.match(/at line (\d+) column (\d+)/);
    if (match) {
      line = parseInt(match[1]) - 1;
      character = parseInt(match[2]) - 1;
    }
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line, character },
        end: { line, character: character + 1 }
      },
      message: `Invalid JSON format: ${err.message}`,
      source: 'aem-tools-osgi'
    });
    return;
  }

  if (typeof json !== 'object' || json === null) {
    return;
  }

  const configuredKeys = new Set<string>();

  // Check types and unknown fields
  for (const key of Object.keys(json)) {
    // Ignore internal configurator properties like ":configurator:resource-version"
    if (key.startsWith(':')) {
      continue;
    }

    configuredKeys.add(key);
    const attr = ocd.attributes.get(key);
    if (!attr) {
      // Find range of the key in JSON text
      const range = findKeyRange(document, text, key);
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range,
        message: `Unknown property "${key}" for OSGi configuration "${ocd.id}".`,
        source: 'aem-tools-osgi'
      });
      continue;
    }

    const value = json[key];
    const typeError = checkValueType(value, attr.type);
    if (typeError) {
      const range = findValueRange(document, text, key);
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: `Type mismatch for "${key}". Expected OSGi ${attr.type}, got: ${typeError}`,
        source: 'aem-tools-osgi'
      });
    }
  }

  // Check required fields
  for (const [attrId, attr] of ocd.attributes.entries()) {
    if (attr.required && !configuredKeys.has(attrId)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 }
        },
        message: `Required property "${attrId}" (${attr.name || attrId}) is missing.`,
        source: 'aem-tools-osgi'
      });
    }
  }
}

function validateFelixConfig(
  document: TextDocument,
  text: string,
  ocd: OsgiOcd,
  diagnostics: Diagnostic[]
) {
  const lines = text.split(/\r?\n/);
  const configuredKeys = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = line.match(/^([a-zA-Z0-9\._\-:]+)\s*=\s*(.+)$/);
    if (!match) {
      // Syntax error or malformed line
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length }
        },
        message: `Malformed line in OSGi Felix config. Expected 'property=value'`,
        source: 'aem-tools-osgi'
      });
      continue;
    }

    const key = match[1].trim();
    const rawVal = match[2].trim();
    configuredKeys.add(key);

    const attr = ocd.attributes.get(key);
    if (!attr) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: key.length }
        },
        message: `Unknown property "${key}" for OSGi configuration "${ocd.id}".`,
        source: 'aem-tools-osgi'
      });
      continue;
    }

    // Basic Felix type check based on prefix
    // I"123" (Integer), L"123" (Long), B"true" (Boolean), D"1.2" (Double), F"1.2" (Float), etc.
    const startChar = line.indexOf(rawVal);
    const range = {
      start: { line: i, character: startChar },
      end: { line: i, character: startChar + rawVal.length }
    };

    const typeError = checkFelixValueType(rawVal, attr.type);
    if (typeError) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: `Type mismatch for "${key}". Expected OSGi ${attr.type}, got: ${typeError}`,
        source: 'aem-tools-osgi'
      });
    }
  }

  // Check required fields
  for (const [attrId, attr] of ocd.attributes.entries()) {
    if (attr.required && !configuredKeys.has(attrId)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 }
        },
        message: `Required property "${attrId}" (${attr.name || attrId}) is missing.`,
        source: 'aem-tools-osgi'
      });
    }
  }
}

function checkValueType(value: any, expectedType: string): string | null {
  const normType = expectedType.toLowerCase();
  
  if (normType === 'boolean') {
    if (typeof value !== 'boolean') {
      return `non-boolean value (${typeof value})`;
    }
  } else if (['integer', 'long', 'short', 'byte', 'float', 'double'].includes(normType)) {
    if (typeof value !== 'number') {
      // Allow number inside string as fallback
      if (typeof value === 'string' && !isNaN(Number(value))) {
        return null;
      }
      return `non-numeric value (${typeof value})`;
    }
  } else if (normType === 'character') {
    if (typeof value !== 'string' || value.length !== 1) {
      return `non-character value`;
    }
  } else {
    // String or array check
    if (Array.isArray(value)) {
      return null; // Arrays are acceptable for multiple values
    }
    if (typeof value !== 'string' && typeof value !== 'boolean' && typeof value !== 'number') {
      return `invalid type (${typeof value})`;
    }
  }
  return null;
}

function checkFelixValueType(rawVal: string, expectedType: string): string | null {
  const normType = expectedType.toLowerCase();

  if (normType === 'boolean') {
    if (!rawVal.startsWith('B"') && rawVal !== 'true' && rawVal !== 'false') {
      return `expected Boolean prefix B"true" or simple true/false`;
    }
  } else if (['integer', 'long', 'short', 'byte'].includes(normType)) {
    if (!rawVal.startsWith('I"') && !rawVal.startsWith('L"') && isNaN(Number(rawVal.replace(/[ILB]"/g, '').replace(/"/g, '')))) {
      return `expected numeric representation`;
    }
  } else if (['float', 'double'].includes(normType)) {
    if (!rawVal.startsWith('F"') && !rawVal.startsWith('D"') && isNaN(Number(rawVal.replace(/[FDB]"/g, '').replace(/"/g, '')))) {
      return `expected numeric representation`;
    }
  }
  return null;
}

function findKeyRange(document: TextDocument, text: string, key: string) {
  const idx = text.indexOf(`"${key}"`);
  if (idx !== -1) {
    return {
      start: document.positionAt(idx + 1),
      end: document.positionAt(idx + 1 + key.length)
    };
  }
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 }
  };
}

function findValueRange(document: TextDocument, text: string, key: string) {
  const idx = text.indexOf(`"${key}"`);
  if (idx !== -1) {
    const nextColon = text.indexOf(':', idx + key.length + 2);
    if (nextColon !== -1) {
      // Find value start (after whitespace or quotes)
      let valStart = nextColon + 1;
      while (valStart < text.length && /\s/.test(text[valStart])) {
        valStart++;
      }
      
      // Find value end
      let valEnd = valStart;
      if (text[valStart] === '"') {
        valEnd = text.indexOf('"', valStart + 1) + 1;
      } else if (text[valStart] === '[') {
        // Find closing bracket
        valEnd = text.indexOf(']', valStart + 1) + 1;
      } else {
        while (valEnd < text.length && !/[,\}\r\n]/.test(text[valEnd])) {
          valEnd++;
        }
      }
      return {
        start: document.positionAt(valStart),
        end: document.positionAt(valEnd)
      };
    }
  }
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 }
  };
}
