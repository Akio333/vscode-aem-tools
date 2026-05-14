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

  const parser = new Parser({
    onattribute(name: string, value: string) {
      if (name.startsWith('data-sly-')) {
        // Basic HTL expression validation (check for unclosed expressions)
        const openBraces = (value.match(/\$\{/g) || []).length;
        const closeBraces = (value.match(/\}/g) || []).length;
        
        if (openBraces !== closeBraces) {
          // Approximate the location for now
          const index = text.indexOf(value);
          if (index !== -1) {
            const diagnostic: Diagnostic = {
              severity: DiagnosticSeverity.Error,
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

connection.onCompletion(
  (textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
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
        return HTL_OPTIONS;
      }
      return HTL_GLOBALS;
    }
    
    // Fallback: provide attributes if we type inside a tag
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
