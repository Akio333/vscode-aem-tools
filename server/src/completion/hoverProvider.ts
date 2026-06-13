import { Hover, MarkupKind, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fileURLToPath } from 'url';
import * as path from 'path';

// Imports from existing completion providers
import { 
  SLY_ATTRIBUTES, 
  SLY_TAGS, 
  HTL_GLOBALS, 
  HTL_OPTIONS, 
  getDeclaredVariables, 
  getUseDeclarations 
} from './htlCompletion';
import { getOcdForPid } from '../osgi/osgiIndex';
import { getPidFromPath } from '../validation/osgiValidation';
import { getClientLibByCategory } from '../clientlibs/clientlibIndex';

/**
 * Helper to extract word under cursor
 */
function getWordAtOffset(text: string, offset: number): string {
  let start = offset;
  while (start > 0 && /[a-zA-Z0-9_\-\.:\$@']/.test(text[start - 1])) {
    start--;
  }
  let end = offset;
  while (end < text.length && /[a-zA-Z0-9_\-\.:\$@']/.test(text[end])) {
    end++;
  }
  return text.substring(start, end);
}

/**
 * Hover provider delegates to different languages
 */
export async function getHoverSupport(
  document: TextDocument,
  position: Position
): Promise<Hover | null> {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const uri = document.uri;

  const word = getWordAtOffset(text, offset);
  if (!word) return null;

  // 1. OSGi Config Hover
  const isOsgiJson = uri.endsWith('.cfg.json');
  const isOsgiFelix = uri.endsWith('.config');
  if (isOsgiJson || isOsgiFelix) {
    const pid = getPidFromPath(uri);
    const ocd = getOcdForPid(pid);
    if (ocd) {
      // Find clean property key (remove quotes and equals)
      const propKey = word.replace(/['"=]/g, '').trim();
      const attr = ocd.attributes.get(propKey);
      if (attr) {
        const markdown = [
          `**Property:** \`${attr.id}\``,
          attr.name ? `**Name:** ${attr.name}` : '',
          `**Type:** \`${attr.type}\``,
          `**Required:** \`${attr.required}\``,
          attr.defaultValue ? `**Default:** \`${attr.defaultValue}\`` : '',
          attr.description ? `\n*Description:*\n${attr.description}` : ''
        ].filter(Boolean).join('\n\n');

        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: markdown
          }
        };
      }
    }
    return null;
  }

  // 2. JCR XML (Classic UI Dialog / Component / Clientlib / Editconfig) Hover
  if (uri.endsWith('.xml')) {
    // If hovering over an xtype value (e.g. "textfield")
    const cleanWord = word.replace(/['"]/g, '');
    
    // Check if it matches Classic UI xtype or attributes
    const xtypes = [
      'textfield', 'textarea', 'numberfield', 'datefield', 'selection', 
      'pathfield', 'multifield', 'richtext', 'checkbox', 'dialogfield', 
      'panel', 'tabpanel', 'hidden', 'datetime', 'combobox', 'browsefield', 
      'tags', 'cq.tagspanel', 'static'
    ];
    
    if (xtypes.includes(cleanWord)) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**Classic UI Widget xtype: \`${cleanWord}\`**\n\nIdentifies ExtJS widget in Classic UI dialog.xml.`
        }
      };
    }
    return null;
  }

  // 3. HTL / HTML Sightly Hover
  if (document.languageId === 'htl' || document.languageId === 'html' || uri.endsWith('.html') || uri.endsWith('.htl')) {
    const textBeforeCursor = text.substring(0, offset);
    const lastOpen = textBeforeCursor.lastIndexOf('${');
    const lastClose = textBeforeCursor.lastIndexOf('}');
    const isInsideExpression = lastOpen > lastClose;

    const cleanWord = word.replace(/['"]/g, '').trim();

    if (isInsideExpression) {
      // Hover inside HTL expression
      
      // Check if it's a global variable
      const glob = HTL_GLOBALS.find(g => g.label === cleanWord);
      if (glob) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `**HTL Global: \`${glob.label}\`**\n\n${glob.documentation}`
          }
        };
      }

      // Check if it's an expression option
      const opt = HTL_OPTIONS.find(o => o.label === cleanWord);
      if (opt) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `**HTL Option: \`${opt.label}\`**\n\n${opt.documentation}`
          }
        };
      }

      // Check if it is a local variable
      const declared = getDeclaredVariables(text);
      const decVar = declared.find(v => v.name === cleanWord);
      if (decVar) {
        const useDecls = getUseDeclarations(text);
        if (useDecls.has(cleanWord)) {
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: `**HTL Use Bean: \`${cleanWord}\`**\n\nResolves to Java/JS class:\n\`${useDecls.get(cleanWord)}\``
            }
          };
        }
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `**HTL Local Variable: \`${cleanWord}\`**\n\nDeclaration type: \`${decVar.detail}\``
          }
        };
      }

      // Check if it is a clientlib category (e.g. 'wknd.site')
      const cl = getClientLibByCategory(cleanWord);
      if (cl) {
        const markdown = [
          `**AEM Client Library:** \`${cleanWord}\``,
          `**Path:** \`${cl.folderPath.substring(cl.folderPath.indexOf('/jcr_root') + 9)}\``,
          cl.dependencies.length > 0 ? `**Dependencies:** ${cl.dependencies.join(', ')}` : '',
          cl.embed.length > 0 ? `**Embed:** ${cl.embed.join(', ')}` : '',
          `**Proxy Enabled:** \`${cl.allowProxy}\``
        ].filter(Boolean).join('\n\n');

        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: markdown
          }
        };
      }
    } else {
      // Hover outside expression (Sly attributes/tags)
      
      // Match block statements
      const slyAttr = SLY_ATTRIBUTES.find(a => cleanWord.startsWith(a.label));
      if (slyAttr) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `**HTL Block Statement: \`${slyAttr.label}\`**\n\n${slyAttr.documentation}`
          }
        };
      }

      // Match sly tag
      if (cleanWord === 'sly' || cleanWord === '<sly>') {
        const slyTag = SLY_TAGS[0];
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `**Special HTL Tag: \`<sly>\`**\n\n${slyTag.documentation}`
          }
        };
      }
    }
  }

  return null;
}
