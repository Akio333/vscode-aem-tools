import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  DidChangeWatchedFilesNotification,
  CompletionItem,
  CompletionItemKind,
  Range,
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
import { getCompletions } from './completion/htlCompletion';
import { getJcrXmlCompletions } from './completion/jcrXmlCompletion';

import { initializeOsgiIndex } from './osgi/osgiIndex';
import { initializeClientLibsIndex } from './clientlibs/clientlibIndex';
import { validateOsgiConfig } from './validation/osgiValidation';
import { getOsgiCompletions } from './completion/osgiCompletion';
import { getClientLibTxtCompletions } from './completion/clientlibTxtCompletion';
import { getHoverSupport } from './completion/hoverProvider';
import { getDefinitionSupport } from './completion/definitionProvider';

const Compiler = require('@adobe/htlengine/src/compiler/Compiler.js');
const HTLParser = require('@adobe/htlengine/src/parser/htl/HTLParser.js');

// The HTL grammar reports token positions relative to the expression being
// parsed, not the document. Remember which source text failed so the error
// can be mapped back to a document range.
const originalHtlParse = HTLParser.prototype.parse;
HTLParser.prototype.parse = function (this: unknown, text: string, location?: { line: number; column: number }) {
  try {
    return originalHtlParse.call(this, text, location);
  } catch (err: any) {
    if (err && typeof err === 'object') {
      err.htlSource = { text, line: location?.line ?? 0 };
    }
    throw err;
  }
};

// Create a connection for the server, using Node's IPC as a transport.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. 
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let workspaceRoots: string[] = [];
let osgiIndexRefresh: NodeJS.Timeout | undefined;
let clientLibIndexRefresh: NodeJS.Timeout | undefined;

function isOsgiConfigUri(uri: string): boolean {
  return uri.endsWith('.cfg.json') || uri.endsWith('.config');
}

/**
 * OSGi diagnostics depend on the metatype index, which is built after the
 * documents may already be open, so validate them again once it changes.
 */
function revalidateOsgiDocuments(): void {
  for (const document of documents.all()) {
    if (isOsgiConfigUri(document.uri)) {
      void validateTextDocument(document);
    }
  }
}

function rebuildOsgiIndex(errorLabel: string): void {
  initializeOsgiIndex(workspaceRoots).then(revalidateOsgiDocuments).catch(err => {
    connection.console.error(`${errorLabel}: ${err.message}`);
  });
}

function refreshOsgiIndex(): void {
  if (osgiIndexRefresh) {
    clearTimeout(osgiIndexRefresh);
  }

  osgiIndexRefresh = setTimeout(() => {
    osgiIndexRefresh = undefined;
    rebuildOsgiIndex('OSGi Index refresh error');
  }, 150);
}

function refreshClientLibIndex(): void {
  if (clientLibIndexRefresh) {
    clearTimeout(clientLibIndexRefresh);
  }

  clientLibIndexRefresh = setTimeout(() => {
    clientLibIndexRefresh = undefined;
    initializeClientLibsIndex(workspaceRoots).catch(err => {
      connection.console.error(`ClientLibs Index refresh error: ${err.message}`);
    });
  }, 150);
}

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  workspaceRoots = [];
  if (params.workspaceFolders) {
    workspaceRoots = params.workspaceFolders.map(folder => folder.uri);
  } else if (params.rootUri) {
    workspaceRoots = [params.rootUri];
  }

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['<', '.', '$', '{', '@', ' ', '"', "'", ':']
      },
      definitionProvider: true,
      hoverProvider: true
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
  // Execute indexers asynchronously
  rebuildOsgiIndex('OSGi Index error');
  initializeClientLibsIndex(workspaceRoots).catch(err => {
    connection.console.error(`ClientLibs Index error: ${err.message}`);
  });

  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log('Workspace folder change event received.');
      connection.workspace.getWorkspaceFolders().then(folders => {
        if (folders) {
          workspaceRoots = folders.map(f => f.uri);
          rebuildOsgiIndex('OSGi Index error');
          initializeClientLibsIndex(workspaceRoots).catch(err => {
            connection.console.error(`ClientLibs Index error: ${err.message}`);
          });
        }
      });
    });
  }
});

connection.onNotification(DidChangeWatchedFilesNotification.type, params => {
  let shouldRefreshOsgi = false;
  let shouldRefreshClientLibs = false;

  for (const change of params.changes) {
    const uri = change.uri.toLowerCase();
    if (uri.includes('/osgi-inf/metatype/') && uri.endsWith('.xml')) {
      shouldRefreshOsgi = true;
    }
    if (uri.endsWith('/.content.xml')) {
      shouldRefreshClientLibs = true;
    }
  }

  if (shouldRefreshOsgi) {
    refreshOsgiIndex();
  }
  if (shouldRefreshClientLibs) {
    refreshClientLibIndex();
  }
});

import { Parser } from 'htmlparser2';

const validationTimeouts = new Map<string, NodeJS.Timeout>();

documents.onDidChangeContent(change => {
  const uri = change.document.uri;
  const existingTimeout = validationTimeouts.get(uri);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const timeout = setTimeout(() => {
    validateTextDocument(change.document);
    validationTimeouts.delete(uri);
  }, 500);

  validationTimeouts.set(uri, timeout);
});

documents.onDidClose(event => {
  const uri = event.document.uri;
  const timeout = validationTimeouts.get(uri);
  if (timeout) {
    clearTimeout(timeout);
    validationTimeouts.delete(uri);
  }
  connection.sendDiagnostics({ uri, diagnostics: [] });
});

/**
 * Maps a token reported by the HTL parser to a range in the document. The
 * token offset is relative to the failing expression, so locate that
 * expression starting at the line the HTL engine reported.
 */
function getHtlErrorRange(textDocument: TextDocument, err: any): Range | null {
  const source = err.htlSource as { text: string; line: number } | undefined;
  if (!source || !err.token) {
    return null;
  }

  const text = textDocument.getText();
  const lineStart = textDocument.offsetAt({ line: Math.max(source.line, 0), character: 0 });
  let base = text.indexOf(source.text, lineStart);
  if (base === -1) {
    base = text.indexOf(source.text);
  }
  if (base === -1) {
    return null;
  }

  const tokenOffset = Math.min(Math.max(err.token.offset ?? 0, 0), source.text.length);
  const tokenLength = Math.max(String(err.token.value ?? '').length, 1);
  return {
    start: textDocument.positionAt(base + tokenOffset),
    end: textDocument.positionAt(base + tokenOffset + tokenLength)
  };
}

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const uri = textDocument.uri;
  const version = textDocument.version;
  if (isOsgiConfigUri(uri)) {
    const diagnostics = validateOsgiConfig(textDocument);
    connection.sendDiagnostics({ uri, diagnostics });
    return;
  }

  if (textDocument.languageId === 'xml' || textDocument.uri.endsWith('.xml')) {
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
    return;
  }
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
          const index = text.indexOf(value, parser.startIndex);
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
    const range = getHtlErrorRange(textDocument, err);
    if (range) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: err.message || 'HTL compilation error',
        source: 'aem-tools-compiler'
      });
    } else if (err && err.message) {
      // General error without token location info
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 }
        },
        message: err.message,
        source: 'aem-tools-compiler'
      });
    }
  }

  // The compile is asynchronous: drop the result if the document was closed or
  // edited in the meantime so stale diagnostics never replace newer ones.
  const current = documents.get(uri);
  if (!current || current.version !== version) {
    return;
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

connection.onCompletion(
  async (textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) return [];

    const uri = document.uri;
    if (uri.endsWith('.cfg.json') || uri.endsWith('.config')) {
      return getOsgiCompletions(document, textDocumentPosition.position);
    }

    if (uri.endsWith('js.txt') || uri.endsWith('css.txt')) {
      return getClientLibTxtCompletions(document, textDocumentPosition.position);
    }

    if (document.languageId === 'xml' || document.uri.endsWith('.xml')) {
      return getJcrXmlCompletions(document, textDocumentPosition.position);
    }

    return getCompletions(
      document,
      textDocumentPosition.position,
      async (className: string) => {
        try {
          return await connection.sendRequest(FindClassFileRequest, { className });
        } catch (err) {
          return null;
        }
      }
    );
  }
);

connection.onCompletionResolve((item: CompletionItem): CompletionItem => item);

// Go To Definition for Java Models & HTL Templates/Clientlibs
connection.onDefinition(async (params: TextDocumentPositionParams): Promise<Location | Location[] | null> => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  // 1. Try template / clientlib resolution first
  const localLoc = await getDefinitionSupport(document, params.position);
  if (localLoc) return localLoc;

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
      // Send the fully-qualified name so the client can resolve the correct
      // source file across arbitrary Maven modules.
      const uri = await connection.sendRequest(FindClassFileRequest, { className: value });
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
  
  return null;
});

// Hover Support for HTL, OSGi configurations, and Classic UI widgets
connection.onHover(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return getHoverSupport(document, params.position);
});

documents.listen(connection);
connection.listen();
