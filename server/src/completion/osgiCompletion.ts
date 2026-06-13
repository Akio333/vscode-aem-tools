import { CompletionItem, CompletionItemKind, InsertTextFormat, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getOcdForPid, OsgiOcd, OsgiAttribute } from '../osgi/osgiIndex';
import { getPidFromPath } from '../validation/osgiValidation';

export function getOsgiCompletions(
  document: TextDocument,
  position: Position
): CompletionItem[] {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const filePath = document.uri;

  const pid = getPidFromPath(filePath);
  const ocd = getOcdForPid(pid);

  if (!ocd) {
    return [];
  }

  // Get current line context
  const lines = text.split(/\r?\n/);
  const currentLine = lines[position.line] || '';
  const textBeforeCursor = currentLine.substring(0, position.character);

  const isJson = filePath.endsWith('.cfg.json');
  const isFelix = filePath.endsWith('.config');

  if (isJson) {
    // Basic context check: if the line has a colon, we are typing the value
    const hasColon = textBeforeCursor.includes(':');
    if (hasColon) {
      // Find the key to determine type
      const keyMatch = textBeforeCursor.match(/"([^"]+)"\s*:/);
      if (keyMatch) {
        const key = keyMatch[1];
        const attr = ocd.attributes.get(key);
        if (attr && attr.type.toLowerCase() === 'boolean') {
          return [
            { label: 'true', kind: CompletionItemKind.Value },
            { label: 'false', kind: CompletionItemKind.Value }
          ];
        }
      }
      return [];
    }

    // We are typing a key. Parse keys already configured in the document
    const configuredKeys = new Set<string>();
    const keyRegex = /"([^"]+)"\s*:/g;
    let match;
    while ((match = keyRegex.exec(text)) !== null) {
      configuredKeys.add(match[1]);
    }

    const completions: CompletionItem[] = [];
    for (const [attrId, attr] of ocd.attributes.entries()) {
      if (configuredKeys.has(attrId)) {
        continue;
      }
      
      let insertText = `"${attrId}": `;
      if (attr.type.toLowerCase() === 'boolean') {
        insertText += '${1:true}';
      } else if (['integer', 'long', 'short', 'byte', 'float', 'double'].includes(attr.type.toLowerCase())) {
        insertText += `${attr.defaultValue || 0}`;
      } else {
        insertText += `"\${1:${attr.defaultValue || ''}}"`;
      }

      completions.push({
        label: attrId,
        kind: CompletionItemKind.Property,
        detail: `${attr.type} (${attr.name || attrId})`,
        documentation: attr.description || `OSGi property ${attrId}`,
        insertText,
        insertTextFormat: InsertTextFormat.Snippet
      });
    }
    return completions;

  } else if (isFelix) {
    // Basic context check: if the line has an equals sign, we are typing a value
    const hasEquals = textBeforeCursor.includes('=');
    if (hasEquals) {
      const keyMatch = textBeforeCursor.match(/^([a-zA-Z0-9\._\-:]+)\s*=/);
      if (keyMatch) {
        const key = keyMatch[1].trim();
        const attr = ocd.attributes.get(key);
        if (attr) {
          const type = attr.type.toLowerCase();
          if (type === 'boolean') {
            return [
              { label: 'B"true"', kind: CompletionItemKind.Value, documentation: 'Boolean True' },
              { label: 'B"false"', kind: CompletionItemKind.Value, documentation: 'Boolean False' }
            ];
          } else if (['integer', 'long', 'short', 'byte'].includes(type)) {
            return [
              { label: 'I"0"', kind: CompletionItemKind.Value, insertText: 'I"${1:0}"', insertTextFormat: InsertTextFormat.Snippet, documentation: 'Integer Value' }
            ];
          } else if (type === 'double' || type === 'float') {
            return [
              { label: 'D"0.0"', kind: CompletionItemKind.Value, insertText: 'D"${1:0.0}"', insertTextFormat: InsertTextFormat.Snippet, documentation: 'Decimal Value' }
            ];
          } else {
            return [
              { label: '"value"', kind: CompletionItemKind.Value, insertText: '"${1:value}"', insertTextFormat: InsertTextFormat.Snippet, documentation: 'String Value' }
            ];
          }
        }
      }
      return [];
    }

    // We are typing a key
    const configuredKeys = new Set<string>();
    const keyRegex = /^\s*([a-zA-Z0-9\._\-:]+)\s*=/gm;
    let match;
    while ((match = keyRegex.exec(text)) !== null) {
      configuredKeys.add(match[1]);
    }

    const completions: CompletionItem[] = [];
    for (const [attrId, attr] of ocd.attributes.entries()) {
      if (configuredKeys.has(attrId)) {
        continue;
      }
      
      let insertText = `${attrId}=`;
      const type = attr.type.toLowerCase();
      if (type === 'boolean') {
        insertText += 'B"${1:true}"';
      } else if (['integer', 'long', 'short', 'byte'].includes(type)) {
        insertText += `I"\${1:${attr.defaultValue || 0}}"`;
      } else if (type === 'double' || type === 'float') {
        insertText += `D"\${1:${attr.defaultValue || '0.0'}}"`;
      } else {
        insertText += `"\${1:${attr.defaultValue || ''}}"`;
      }

      completions.push({
        label: attrId,
        kind: CompletionItemKind.Property,
        detail: `${attr.type} (${attr.name || attrId})`,
        documentation: attr.description || `OSGi property ${attrId}`,
        insertText,
        insertTextFormat: InsertTextFormat.Snippet
      });
    }
    return completions;
  }

  return [];
}
