import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult
} from 'vscode-languageserver/node';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';

import {
  TextDocument
} from 'vscode-languageserver-textdocument';

// Create a connection for the server, using Node's IPC as a transport.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. 
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['<', '.', '$', '{', '@', ' ']
      },
      definitionProvider: true
    }
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true
      }
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log('Workspace folder change event received.');
    });
  }
});

import { Parser } from 'htmlparser2';

// ... (keep the imports and connection setup)
documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  // 1. Basic HTML/HTL expression attribute validation (using htmlparser2)
  const parser = new Parser({
    onattribute(name: string, value: string) {
      if (name.startsWith('data-sly-')) {
        // Basic HTL expression validation (check for unclosed expressions)
        const openBraces = (value.match(/\$\{/g) || []).length;
        const closeBraces = (value.match(/\}/g) || []).length;
        
        if (openBraces !== closeBraces) {
          const index = text.indexOf(value);
          if (index !== -1) {
            const diagnostic: Diagnostic = {
              severity: DiagnosticSeverity.Warning,
              range: {
                start: textDocument.positionAt(index),
                end: textDocument.positionAt(index + value.length)
              },
              message: `Unclosed HTL expression in attribute ${name}.`,
              source: 'aem-tools'
            };
            diagnostics.push(diagnostic);
          }
        }
      }
    }
  }, { xmlMode: false, lowerCaseTags: false, lowerCaseAttributeNames: false });

  parser.write(text);
  parser.end();

  // 2. Full HTL syntax and compile-time validation (using @adobe/htlengine)
  try {
    const { Compiler } = require('@adobe/htlengine');
    const compiler = new Compiler()
      .withDirectory('.')
      .includeRuntime(true)
      .withRuntimeVar(Object.keys({}))
      .withRuntimeGlobalName('global');

    // Wrap the default script resolver to avoid crashing on unresolved dependencies (e.g. Java/AEM Core Components)
    const defaultResolver = (compiler as any)._scriptResolver;
    if (typeof defaultResolver === 'function') {
      (compiler as any).withScriptResolver(async (baseDir: string, uri: string) => {
        try {
          return await defaultResolver(baseDir, uri);
        } catch (err) {
          // Fallback to a mock path instead of throwing an error
          return `mock-unresolved://${uri}`;
        }
      });
    }

    // Wrap the default template loader to return an empty template for unresolved scripts
    const defaultLoader = (compiler as any)._templateLoader;
    if (typeof defaultLoader === 'function') {
      (compiler as any).withTemplateLoader(async (filePath: string, id: string) => {
        if (filePath.startsWith('mock-unresolved://')) {
          return {
            data: '',
            path: filePath
          };
        }
        return await defaultLoader(filePath, id);
      });
    }

    await compiler.compileToString(text);
  } catch (err: any) {
    if (err && err.token) {
      // The error contains detailed token locations (1-indexed)
      const line = (err.token.line || 1) - 1;
      const col = (err.token.col || 1) - 1;
      
      // Calculate token length or default to 1 character
      const tokenVal = err.token.value || '';
      const length = tokenVal.length || 1;

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: line, character: col },
          end: { line: line, character: col + length }
        },
        message: err.message || 'HTL compilation error',
        source: 'aem-tools-compiler'
      };
      diagnostics.push(diagnostic);
    } else if (err && err.message) {
      // General error without token location info
      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 }
        },
        message: err.message,
        source: 'aem-tools-compiler'
      };
      diagnostics.push(diagnostic);
    }
  }

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

import {
  RequestType,
  Location,
  InsertTextFormat
} from 'vscode-languageserver/node';

// Define the custom request type
const FindClassFileRequest = new RequestType<{ className: string }, string | null, void>('aem/findClassFile');

const SLY_TAGS: CompletionItem[] = [
  { label: 'data-sly-use', kind: CompletionItemKind.Property, detail: 'HTL Block Statement', insertText: 'data-sly-use.${1:name}="${2:model}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'data-sly-test', kind: CompletionItemKind.Property, detail: 'HTL Block Statement', insertText: 'data-sly-test="${${1:condition}}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'data-sly-list', kind: CompletionItemKind.Property, detail: 'HTL Block Statement', insertText: 'data-sly-list.${1:item}="${${2:collection}}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'data-sly-resource', kind: CompletionItemKind.Property, detail: 'HTL Block Statement', insertText: 'data-sly-resource="${${1:path}}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'data-sly-include', kind: CompletionItemKind.Property, detail: 'HTL Block Statement', insertText: 'data-sly-include="${${1:path}}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'data-sly-template', kind: CompletionItemKind.Property, detail: 'HTL Block Statement', insertText: 'data-sly-template.${1:name}', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'data-sly-call', kind: CompletionItemKind.Property, detail: 'HTL Block Statement', insertText: 'data-sly-call="${${1:template}}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'data-sly-unwrap', kind: CompletionItemKind.Property, detail: 'HTL Block Statement', insertText: 'data-sly-unwrap' },
  { label: 'data-sly-text', kind: CompletionItemKind.Property, detail: 'HTL Block Statement', insertText: 'data-sly-text="${${1:text}}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'data-sly-element', kind: CompletionItemKind.Property, detail: 'HTL Block Statement', insertText: 'data-sly-element="${${1:elementName}}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'data-sly-attribute', kind: CompletionItemKind.Property, detail: 'HTL Block Statement', insertText: 'data-sly-attribute="${${1:map}}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'data-sly-repeat', kind: CompletionItemKind.Property, detail: 'HTL Block Statement', insertText: 'data-sly-repeat.${1:item}="${${2:collection}}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: 'data-sly-set', kind: CompletionItemKind.Property, detail: 'HTL Block Statement', insertText: 'data-sly-set.${1:name}="${${2:value}}"', insertTextFormat: InsertTextFormat.Snippet }
];

const HTL_GLOBALS: CompletionItem[] = [
  'properties', 'pageProperties', 'inheritedPageProperties',
  'currentPage', 'resourcePage',
  'request', 'response', 'log', 'out',
  'resource', 'resourceDesign', 'currentDesign',
  'component', 'componentContext', 'currentSession', 'currentNode'
].map(v => ({ label: v, kind: CompletionItemKind.Variable }));

const HTL_OPTIONS: CompletionItem[] = [
  'context', 'scheme', 'domain', 'extension', 'selectors', 
  'prependPath', 'appendPath', 'fragment', 'i18n', 
  'locale', 'hint', 'basename', 'format', 'timezone', 'join', 'type'
].map(v => ({ label: v, kind: CompletionItemKind.Field }));

const HTL_CONTEXTS: CompletionItem[] = [
  'html', 'text', 'elementName', 'attributeName', 'attribute',
  'uri', 'scriptToken', 'scriptString', 'scriptComment',
  'styleToken', 'styleString', 'unsafe'
].map(v => ({
  label: v,
  kind: CompletionItemKind.EnumMember,
  insertText: `'${v}'`,
  detail: 'HTL Context Option'
}));

async function parseDialogProperties(dialogXmlPath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(dialogXmlPath, 'utf-8');
    const properties: string[] = [];
    const parser = new Parser({
      onattribute(name: string, value: string) {
        if (name === 'name') {
          const cleanName = value.replace(/^\.\//, '');
          if (cleanName && !cleanName.includes('/') && !cleanName.includes(':')) {
            properties.push(cleanName);
          }
        }
      }
    }, { xmlMode: true, lowerCaseTags: false, lowerCaseAttributeNames: false });
    parser.write(content);
    parser.end();
    return Array.from(new Set(properties));
  } catch (err) {
    return [];
  }
}

async function getComponentProperties(htmlFilePath: string): Promise<CompletionItem[]> {
  const componentDir = path.dirname(htmlFilePath);
  const touchUiDialogPath = path.join(componentDir, '_cq_dialog', '.content.xml');
  const classicUiDialogPath = path.join(componentDir, 'dialog.xml');
  
  const properties = new Set<string>();
  
  const touchUiProps = await parseDialogProperties(touchUiDialogPath);
  touchUiProps.forEach(p => properties.add(p));
  
  const classicUiProps = await parseDialogProperties(classicUiDialogPath);
  classicUiProps.forEach(p => properties.add(p));
  
  return Array.from(properties).map(p => ({
    label: p,
    kind: CompletionItemKind.Field,
    detail: 'Dialog Property'
  }));
}

function getUseDeclarations(text: string): Map<string, string> {
  const decls = new Map<string, string>();
  const regex = /data-sly-use\.([a-zA-Z0-9_]+)\s*=\s*["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    decls.set(match[1], match[2]);
  }
  return decls;
}

async function parseJavaGetters(javaFilePath: string): Promise<string[]> {
  try {
    let localPath = javaFilePath;
    if (localPath.startsWith('file://')) {
      localPath = fileURLToPath(localPath);
    }
    const content = await fs.readFile(localPath, 'utf-8');
    const properties: string[] = [];
    
    const regex = /(?:public\s+)?(?:[a-zA-Z0-9_<>\?\[\]]+\s+)?(get|is)([A-Z][a-zA-Z0-9_]*)\s*\(\s*\)\s*(?:\{|;|\n)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const prefix = match[1];
      const name = match[2];
      const propName = name.charAt(0).toLowerCase() + name.slice(1);
      
      if (propName !== 'class' && propName !== 'hashCode') {
        properties.push(propName);
      }
    }
    return Array.from(new Set(properties));
  } catch (err) {
    return [];
  }
}

connection.onCompletion(
  async (textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) return [];

    const text = document.getText();
    const offset = document.offsetAt(textDocumentPosition.position);
    const textBeforeCursor = text.substring(0, offset);

    const lastOpen = textBeforeCursor.lastIndexOf('${');
    const lastClose = textBeforeCursor.lastIndexOf('}');
    const isInsideExpression = lastOpen > lastClose;

    if (isInsideExpression) {
      const exprContext = textBeforeCursor.substring(lastOpen);
      
      if (exprContext.includes('@')) {
        if (/context\s*=\s*['"]?$/i.test(textBeforeCursor)) {
          return HTL_CONTEXTS;
        }
        return HTL_OPTIONS;
      }
      
      const exprText = exprContext.substring(2);
      const lastDot = exprText.lastIndexOf('.');
      if (lastDot !== -1) {
        const objectPart = exprText.substring(0, lastDot).trim();
        const objectName = objectPart.split(/[\s+\-*/&|!]/).pop() || '';
        
        if (objectName === 'properties' || objectName === 'pageProperties' || objectName === 'inheritedPageProperties') {
          if (document.uri.startsWith('file://')) {
            const htmlPath = fileURLToPath(document.uri);
            return getComponentProperties(htmlPath);
          }
        }
        
        const useDecls = getUseDeclarations(text);
        if (useDecls.has(objectName)) {
          const fullClassName = useDecls.get(objectName)!;
          const simpleClassName = fullClassName.split('.').pop() || '';
          
          try {
            const uri = await connection.sendRequest(FindClassFileRequest, { className: simpleClassName });
            if (uri) {
              const methods = await parseJavaGetters(uri);
              return methods.map(m => ({
                label: m,
                kind: CompletionItemKind.Field,
                detail: `Java Getter (${simpleClassName})`
              }));
            }
          } catch (err) {
            // Ignore request errors
          }
        }
      }

      return HTL_GLOBALS;
    }
    
    const lastTagOpen = textBeforeCursor.lastIndexOf('<');
    const lastTagClose = textBeforeCursor.lastIndexOf('>');
    if (lastTagOpen > lastTagClose) {
      return SLY_TAGS;
    }

    return [];
  }
);

connection.onCompletionResolve((item: CompletionItem): CompletionItem => item);

// Go To Definition for Java Models
connection.onDefinition(async (params: TextDocumentPositionParams): Promise<Location | null> => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const text = document.getText();
  const offset = document.offsetAt(params.position);
  
  // Find the word under cursor (or the string literal value)
  // Simple heuristic: find the surrounding quotes
  const before = text.substring(0, offset);
  const after = text.substring(offset);
  const quoteBeforeMatch = before.match(/['"]([^'"]*)$/);
  const quoteAfterMatch = after.match(/^([^'"]*)['"]/);
  
  if (quoteBeforeMatch && quoteAfterMatch) {
    const value = quoteBeforeMatch[1] + quoteAfterMatch[1];
    
    // Is it a Java class? e.g. com.wknd.core.models.Byline
    if (/^[a-z0-9\.]+\.[A-Z][a-zA-Z0-9_]*$/.test(value)) {
      const className = value.split('.').pop();
      if (className) {
        // Send request to client to find the file
        const uri = await connection.sendRequest(FindClassFileRequest, { className });
        if (uri) {
          return {
            uri,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 }
            }
          };
        }
      }
    }
  }
  
  return null;
});

documents.listen(connection);
connection.listen();
