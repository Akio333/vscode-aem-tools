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

// Create a connection for the server, using Node's IPC as a transport.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. 
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let workspaceRoots: string[] = [];

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
  initializeOsgiIndex(workspaceRoots).catch(err => {
    connection.console.error(`OSGi Index error: ${err.message}`);
  });
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
          initializeOsgiIndex(workspaceRoots).catch(err => {
            connection.console.error(`OSGi Index error: ${err.message}`);
          });
          initializeClientLibsIndex(workspaceRoots).catch(err => {
            connection.console.error(`ClientLibs Index error: ${err.message}`);
          });
        }
      });
    });
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

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const uri = textDocument.uri;
  if (uri.endsWith('.cfg.json') || uri.endsWith('.config')) {
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

// Hover Support for HTL, OSGi configurations, and Classic UI widgets
connection.onHover(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return getHoverSupport(document, params.position);
});

documents.listen(connection);
connection.listen();
