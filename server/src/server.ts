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

connection.onCompletion(
  async (textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) return [];

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
