import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { Parser } from 'htmlparser2';
import { getAllCategories } from '../clientlibs/clientlibIndex';

// HTML context parsing states
export type HtmlContext = 'TEXT' | 'TAG_NAME' | 'ATTR_NAME' | 'ATTR_VALUE';

/**
 * Parsed HTML state machine to find the structural context at a given offset.
 */
export function getHtmlContext(text: string, offset: number): HtmlContext {
  let state: 'TEXT' | 'TAG_NAME' | 'ATTR_NAME' | 'ATTR_VALUE_START' | 'ATTR_VALUE_SQ' | 'ATTR_VALUE_DQ' | 'ATTR_VALUE_UQ' = 'TEXT';
  
  for (let i = 0; i < offset; i++) {
    const char = text[i];
    switch (state) {
      case 'TEXT':
        if (char === '<') {
          // Check for HTML comment
          if (text.startsWith('!--', i + 1)) {
            const commentEnd = text.indexOf('-->', i + 4);
            if (commentEnd !== -1 && commentEnd < offset) {
              i = commentEnd + 2;
            } else {
              return 'TEXT'; // Inside comment or it ends after offset
            }
          } else {
            state = 'TAG_NAME';
          }
        }
        break;
        
      case 'TAG_NAME':
        if (char === '>') {
          state = 'TEXT';
        } else if (/\s/.test(char)) {
          state = 'ATTR_NAME';
        }
        break;
        
      case 'ATTR_NAME':
        if (char === '>') {
          state = 'TEXT';
        } else if (char === '=') {
          state = 'ATTR_VALUE_START';
        }
        break;
        
      case 'ATTR_VALUE_START':
        if (char === '>') {
          state = 'TEXT';
        } else if (char === '"') {
          state = 'ATTR_VALUE_DQ';
        } else if (char === "'") {
          state = 'ATTR_VALUE_SQ';
        } else if (!/\s/.test(char)) {
          state = 'ATTR_VALUE_UQ';
        }
        break;
        
      case 'ATTR_VALUE_DQ':
        if (char === '"') {
          state = 'ATTR_NAME';
        }
        break;
        
      case 'ATTR_VALUE_SQ':
        if (char === "'") {
          state = 'ATTR_NAME';
        }
        break;
        
      case 'ATTR_VALUE_UQ':
        if (char === '>') {
          state = 'TEXT';
        } else if (/\s/.test(char)) {
          state = 'ATTR_NAME';
        }
        break;
    }
  }
  
  if (state === 'TAG_NAME') return 'TAG_NAME';
  if (state === 'ATTR_NAME' || state === 'ATTR_VALUE_START') return 'ATTR_NAME';
  if (state === 'ATTR_VALUE_DQ' || state === 'ATTR_VALUE_SQ' || state === 'ATTR_VALUE_UQ') return 'ATTR_VALUE';
  return 'TEXT';
}

// HTL Block Statements (data-sly-*)
export const SLY_ATTRIBUTES: CompletionItem[] = [
  {
    label: 'data-sly-use',
    kind: CompletionItemKind.Property,
    detail: 'HTL block statement',
    documentation: 'Exposes logic to the template. Instantiates a helper object (Java/JavaScript) and binds it to an identifier.\n\nExample:\n`data-sly-use.model="com.example.MyModel"`',
    insertText: 'data-sly-use.${1:model}="${2:className}"',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'data-sly-test',
    kind: CompletionItemKind.Property,
    detail: 'HTL block statement',
    documentation: 'Keeps or removes the element and its content depending on the condition.\n\nExample:\n`data-sly-test="${properties.title}"`',
    insertText: 'data-sly-test="${${1:condition}}"',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'data-sly-list',
    kind: CompletionItemKind.Property,
    detail: 'HTL block statement',
    documentation: 'Repeats the element\'s content for each item in the collection.\n\nExample:\n`data-sly-list.item="${currentPage.listChildren}"`',
    insertText: 'data-sly-list.${1:item}="${${2:collection}}"',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'data-sly-repeat',
    kind: CompletionItemKind.Property,
    detail: 'HTL block statement',
    documentation: 'Repeats the element itself and its content for each item in the collection.\n\nExample:\n`data-sly-repeat.item="${currentPage.listChildren}"`',
    insertText: 'data-sly-repeat.${1:item}="${${2:collection}}"',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'data-sly-unwrap',
    kind: CompletionItemKind.Property,
    detail: 'HTL block statement',
    documentation: 'Removes the element\'s tags while keeping its content. Can be conditional.\n\nExample:\n`data-sly-unwrap="${!properties.showWrapper}"`',
    insertText: 'data-sly-unwrap',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'data-sly-set',
    kind: CompletionItemKind.Property,
    detail: 'HTL block statement',
    documentation: 'Defines a new identifier with a pre-defined value.\n\nExample:\n`data-sly-set.profile="${user.profile}"`',
    insertText: 'data-sly-set.${1:name}="${${2:value}}"',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'data-sly-text',
    kind: CompletionItemKind.Property,
    detail: 'HTL block statement',
    documentation: 'Replaces the content of the element with the evaluated text. Automatically XSS-protected.\n\nExample:\n`data-sly-text="${properties.jcr:description}"`',
    insertText: 'data-sly-text="${${1:text}}"',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'data-sly-attribute',
    kind: CompletionItemKind.Property,
    detail: 'HTL block statement',
    documentation: 'Sets one or more attributes on the element.\n\nExample:\n`data-sly-attribute.title="${properties.title}"`\nor\n`data-sly-attribute="${myAttributeMap}"`',
    insertText: 'data-sly-attribute.${1:title}="${${2:value}}"',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'data-sly-element',
    kind: CompletionItemKind.Property,
    detail: 'HTL block statement',
    documentation: 'Replaces the tag name of the element.\n\nExample:\n`data-sly-element="${properties.headingLevel || \'h2\'}"`',
    insertText: 'data-sly-element="${${1:tagName}}"',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'data-sly-include',
    kind: CompletionItemKind.Property,
    detail: 'HTL block statement',
    documentation: 'Includes the output of a rendering script (HTML/JSP) run with the current context.\n\nExample:\n`data-sly-include="sidebar.html"`',
    insertText: 'data-sly-include="${1:path}"',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'data-sly-resource',
    kind: CompletionItemKind.Property,
    detail: 'HTL block statement',
    documentation: 'Includes a rendered resource from the same server.\n\nExample:\n`data-sly-resource="path/to/resource"`',
    insertText: 'data-sly-resource="${1:path}"',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'data-sly-template',
    kind: CompletionItemKind.Property,
    detail: 'HTL block statement',
    documentation: 'Declares a reusable HTML block/template, naming it with an identifier and defining parameters.\n\nExample:\n`<template data-sly-template.nav="${@ title}">`',
    insertText: 'data-sly-template.${1:name}',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'data-sly-call',
    kind: CompletionItemKind.Property,
    detail: 'HTL block statement',
    documentation: 'Calls a declared HTML template, passing parameters to it.\n\nExample:\n`data-sly-call="${nav @ title=properties.title}"`',
    insertText: 'data-sly-call="${${1:template}}"',
    insertTextFormat: InsertTextFormat.Snippet
  }
];

// Special HTL Tags
export const SLY_TAGS: CompletionItem[] = [
  {
    label: 'sly',
    kind: CompletionItemKind.Class,
    detail: 'Special HTL tag',
    documentation: 'The <sly> HTML tag can be used to remove the current element, allowing only its children to be displayed. Its functionality is similar to the data-sly-unwrap block element.',
    insertText: 'sly',
    insertTextFormat: InsertTextFormat.Snippet
  }
];

// HTL Options (triggered after @)
export const HTL_OPTIONS: CompletionItem[] = [
  { label: 'context', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'XSS display context to override automatic escaping.' },
  { label: 'format', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Format pattern for Strings, Dates or Numbers.' },
  { label: 'type', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Forced formatting type: \'string\', \'date\', or \'number\'.' },
  { label: 'i18n', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Internationalises the output string.' },
  { label: 'locale', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Locale to override the language from the source (e.g. \'de_DE\').' },
  { label: 'hint', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Provides translation context hints for translators.' },
  { label: 'timezone', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Timezone for Date formatting (e.g. \'UTC\', \'GMT+02:00\').' },
  { label: 'join', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Controls array output by specifying a separator string.' },
  { label: 'scheme', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'URI scheme to add or replace (e.g. \'http\', \'https\').' },
  { label: 'domain', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'URI host and port to add or replace.' },
  { label: 'path', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Modifies the path part of a URI.' },
  { label: 'prependPath', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Prepends content to the path.' },
  { label: 'appendPath', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Appends content to the path.' },
  { label: 'selectors', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Modifies or removes selectors from a URI.' },
  { label: 'addSelectors', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Adds provided selectors to a URI.' },
  { label: 'removeSelectors', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Removes provided selectors from a URI.' },
  { label: 'extension', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Adds, modifies or removes the extension from a URI.' },
  { label: 'suffix', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Adds, modifies or removes the suffix part from a URI.' },
  { label: 'prependSuffix', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Prepends content to the existing suffix.' },
  { label: 'appendSuffix', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Appends content to the existing suffix.' },
  { label: 'query', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Adds, replaces or removes the query segment of a URI.' },
  { label: 'addQuery', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Adds or extends the query segment of a URI.' },
  { label: 'removeQuery', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Removes parameters from the query segment of a URI.' },
  { label: 'fragment', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Adds, modifies or replaces the fragment segment of a URI.' },
  { label: 'begin', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'List iteration start index (0-based).' },
  { label: 'step', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'List iteration step size.' },
  { label: 'end', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'List iteration end index (inclusive).' },
  { label: 'resourceType', kind: CompletionItemKind.Field, detail: 'HTL option', documentation: 'Resource type to force rendering with.' }
];

// Display Contexts (triggered inside context='...')
export const HTL_CONTEXTS: CompletionItem[] = [
  { label: 'html', kind: CompletionItemKind.EnumMember, insertText: '\'html\'', detail: 'HTL Context', documentation: 'To safely output markup. Filters HTML to remove dangerous tags.' },
  { label: 'text', kind: CompletionItemKind.EnumMember, insertText: '\'text\'', detail: 'HTL Context', documentation: 'Default for content inside HTML Text Nodes. Encodes all HTML special characters.' },
  { label: 'attribute', kind: CompletionItemKind.EnumMember, insertText: '\'attribute\'', detail: 'HTL Context', documentation: 'Default for attribute values. Encodes all HTML special characters.' },
  { label: 'attributeName', kind: CompletionItemKind.EnumMember, insertText: '\'attributeName\'', detail: 'HTL Context', documentation: 'Validates the attribute name, outputs nothing if validation fails.' },
  { label: 'elementName', kind: CompletionItemKind.EnumMember, insertText: '\'elementName\'', detail: 'HTL Context', documentation: 'Validates the element name, outputs nothing if validation fails. Only allows safe HTML5 tags.' },
  { label: 'number', kind: CompletionItemKind.EnumMember, insertText: '\'number\'', detail: 'HTL Context', documentation: 'To display numbers. Validates that the passed value is a number, outputs nothing if validation fails.' },
  { label: 'uri', kind: CompletionItemKind.EnumMember, insertText: '\'uri\'', detail: 'HTL Context', documentation: 'To display links and paths. Default for action, href, src, etc. Validates the URI.' },
  { label: 'scriptComment', kind: CompletionItemKind.EnumMember, insertText: '\'scriptComment\'', detail: 'HTL Context', documentation: 'Within JavaScript comments. Validates comment content.' },
  { label: 'scriptString', kind: CompletionItemKind.EnumMember, insertText: '\'scriptString\'', detail: 'HTL Context', documentation: 'Within JavaScript strings. Encodes string breakout characters.' },
  { label: 'scriptToken', kind: CompletionItemKind.EnumMember, insertText: '\'scriptToken\'', detail: 'HTL Context', documentation: 'For JavaScript identifiers, literal numbers, or literal strings.' },
  { label: 'styleComment', kind: CompletionItemKind.EnumMember, insertText: '\'styleComment\'', detail: 'HTL Context', documentation: 'Within CSS comments. Validates comment content.' },
  { label: 'styleString', kind: CompletionItemKind.EnumMember, insertText: '\'styleString\'', detail: 'HTL Context', documentation: 'Within CSS strings. Encodes string breakout characters.' },
  { label: 'styleToken', kind: CompletionItemKind.EnumMember, insertText: '\'styleToken\'', detail: 'HTL Context', documentation: 'For CSS identifiers, numbers, dimensions, strings, hex colors, or functions.' },
  { label: 'unsafe', kind: CompletionItemKind.EnumMember, insertText: '\'unsafe\'', detail: 'HTL Context', documentation: 'Disables escaping and XSS protection completely (Use with caution).' }
];

// Format types (triggered inside type='...')
export const HTL_FORMAT_TYPES: CompletionItem[] = [
  { label: 'string', kind: CompletionItemKind.EnumMember, insertText: '\'string\'', detail: 'Format Type', documentation: 'Default. Formats strings with placeholders (e.g. {0}).' },
  { label: 'date', kind: CompletionItemKind.EnumMember, insertText: '\'date\'', detail: 'Format Type', documentation: 'Formats date/time values based on formatting pattern, timezone, and locale.' },
  { label: 'number', kind: CompletionItemKind.EnumMember, insertText: '\'number\'', detail: 'Format Type', documentation: 'Formats numeric values based on formatting pattern and locale.' }
];

// HTL Global Variables
export const HTL_GLOBALS: CompletionItem[] = [
  { label: 'properties', kind: CompletionItemKind.Variable, detail: 'HTL Global', documentation: 'List of properties of the current resource.' },
  { label: 'pageProperties', kind: CompletionItemKind.Variable, detail: 'HTL Global', documentation: 'List of properties of the current page.' },
  { label: 'inheritedPageProperties', kind: CompletionItemKind.Variable, detail: 'HTL Global', documentation: 'List of inherited properties of the current page.' },
  { label: 'currentPage', kind: CompletionItemKind.Variable, detail: 'HTL Global', documentation: 'The current page object.' },
  { label: 'resourcePage', kind: CompletionItemKind.Variable, detail: 'HTL Global', documentation: 'The resource page object.' },
  { label: 'request', kind: CompletionItemKind.Variable, detail: 'HTL Global', documentation: 'The current request object.' },
  { label: 'response', kind: CompletionItemKind.Variable, detail: 'HTL Global', documentation: 'The current response object.' },
  { label: 'log', kind: CompletionItemKind.Variable, detail: 'HTL Global', documentation: 'The logger object.' },
  { label: 'out', kind: CompletionItemKind.Variable, detail: 'HTL Global', documentation: 'The output writer.' },
  { label: 'resource', kind: CompletionItemKind.Variable, detail: 'HTL Global', documentation: 'The current resource object.' },
  { label: 'resourceDesign', kind: CompletionItemKind.Variable, detail: 'HTL Global', documentation: 'The design object for the current resource.' },
  { label: 'currentDesign', kind: CompletionItemKind.Variable, detail: 'HTL Global', documentation: 'The design object for the current page.' },
  { label: 'component', kind: CompletionItemKind.Variable, detail: 'HTL Global', documentation: 'The component object.' },
  { label: 'componentContext', kind: CompletionItemKind.Variable, detail: 'HTL Global', documentation: 'The component context object.' },
  { label: 'currentSession', kind: CompletionItemKind.Variable, detail: 'HTL Global', documentation: 'The current JCR session.' },
  { label: 'currentNode', kind: CompletionItemKind.Variable, detail: 'HTL Global', documentation: 'The current JCR node.' }
];

// Object member completion maps
export const MEMBER_COMPLETIONS: Record<string, CompletionItem[]> = {
  currentPage: [
    { label: 'path', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The path of the page.' },
    { label: 'title', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The title of the page.' },
    { label: 'name', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The name of the page.' },
    { label: 'description', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The description of the page.' },
    { label: 'properties', kind: CompletionItemKind.Field, detail: 'ValueMap', documentation: 'The properties of the page.' },
    { label: 'parent', kind: CompletionItemKind.Field, detail: 'Page', documentation: 'The parent page.' },
    { label: 'depth', kind: CompletionItemKind.Field, detail: 'int', documentation: 'The depth of the page.' },
    { label: 'language', kind: CompletionItemKind.Field, detail: 'Locale', documentation: 'The language/locale of the page.' },
    { label: 'lastModified', kind: CompletionItemKind.Field, detail: 'Calendar', documentation: 'The last modified date of the page.' },
    { label: 'template', kind: CompletionItemKind.Field, detail: 'Template', documentation: 'The template of the page.' },
    { label: 'listChildren', kind: CompletionItemKind.Method, detail: 'Iterator<Page>', documentation: 'Returns an iterator over the child pages.' }
  ],
  resourcePage: [
    { label: 'path', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The path of the page.' },
    { label: 'title', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The title of the page.' },
    { label: 'name', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The name of the page.' },
    { label: 'description', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The description of the page.' },
    { label: 'properties', kind: CompletionItemKind.Field, detail: 'ValueMap', documentation: 'The properties of the page.' },
    { label: 'parent', kind: CompletionItemKind.Field, detail: 'Page', documentation: 'The parent page.' },
    { label: 'depth', kind: CompletionItemKind.Field, detail: 'int', documentation: 'The depth of the page.' },
    { label: 'language', kind: CompletionItemKind.Field, detail: 'Locale', documentation: 'The language/locale of the page.' },
    { label: 'lastModified', kind: CompletionItemKind.Field, detail: 'Calendar', documentation: 'The last modified date of the page.' },
    { label: 'template', kind: CompletionItemKind.Field, detail: 'Template', documentation: 'The template of the page.' },
    { label: 'listChildren', kind: CompletionItemKind.Method, detail: 'Iterator<Page>', documentation: 'Returns an iterator over the child pages.' }
  ],
  resource: [
    { label: 'path', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The path of the resource.' },
    { label: 'name', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The name of the resource.' },
    { label: 'resourceType', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The resource type.' },
    { label: 'resourceSuperType', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The resource super type.' },
    { label: 'parent', kind: CompletionItemKind.Field, detail: 'Resource', documentation: 'The parent resource.' },
    { label: 'children', kind: CompletionItemKind.Field, detail: 'Iterable<Resource>', documentation: 'The child resources.' },
    { label: 'valueMap', kind: CompletionItemKind.Field, detail: 'ValueMap', documentation: 'The ValueMap of the resource properties.' },
    { label: 'properties', kind: CompletionItemKind.Field, detail: 'ValueMap', documentation: 'The ValueMap of the resource properties.' },
    { label: 'listChildren', kind: CompletionItemKind.Method, detail: 'Iterator<Resource>', documentation: 'Returns an iterator over the child resources.' }
  ],
  request: [
    { label: 'requestPathInfo', kind: CompletionItemKind.Field, detail: 'RequestPathInfo', documentation: 'Request path info (selectors, extension, suffix).' },
    { label: 'resourceResolver', kind: CompletionItemKind.Field, detail: 'ResourceResolver', documentation: 'The ResourceResolver.' },
    { label: 'requestParameterList', kind: CompletionItemKind.Field, detail: 'List<RequestParameter>', documentation: 'The list of request parameters.' },
    { label: 'attributeNames', kind: CompletionItemKind.Field, detail: 'Enumeration<String>', documentation: 'Request attribute names.' },
    { label: 'parameterMap', kind: CompletionItemKind.Field, detail: 'Map<String, String[]>', documentation: 'The parameter map.' },
    { label: 'scheme', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The request scheme.' },
    { label: 'serverName', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The server name.' },
    { label: 'serverPort', kind: CompletionItemKind.Field, detail: 'int', documentation: 'The server port.' },
    { label: 'contextPath', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The context path.' },
    { label: 'servletPath', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The servlet path.' },
    { label: 'pathInfo', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The path info.' },
    { label: 'queryString', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The query string.' },
    { label: 'method', kind: CompletionItemKind.Field, detail: 'String', documentation: 'HTTP request method (GET, POST, etc.).' }
  ],
  currentNode: [
    { label: 'path', kind: CompletionItemKind.Field, detail: 'String', documentation: 'JCR Node path.' },
    { label: 'name', kind: CompletionItemKind.Field, detail: 'String', documentation: 'JCR Node name.' },
    { label: 'parent', kind: CompletionItemKind.Field, detail: 'Node', documentation: 'The parent JCR Node.' },
    { label: 'properties', kind: CompletionItemKind.Field, detail: 'PropertyIterator', documentation: 'Iterator of properties.' },
    { label: 'UUID', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Node UUID if referenceable.' },
    { label: 'primaryNodeType', kind: CompletionItemKind.Field, detail: 'NodeType', documentation: 'The primary node type.' },
    { label: 'nodes', kind: CompletionItemKind.Field, detail: 'NodeIterator', documentation: 'Iterator of child nodes.' },
    { label: 'hasNodes', kind: CompletionItemKind.Method, detail: 'boolean', documentation: 'Check if node has child nodes.' },
    { label: 'hasProperties', kind: CompletionItemKind.Method, detail: 'boolean', documentation: 'Check if node has properties.' }
  ]
};

export const LIST_MEMBER_COMPLETIONS: CompletionItem[] = [
  { label: 'index', kind: CompletionItemKind.Field, detail: 'int', documentation: 'Zero-based counter (0..length-1).' },
  { label: 'count', kind: CompletionItemKind.Field, detail: 'int', documentation: 'One-based counter (1..length).' },
  { label: 'first', kind: CompletionItemKind.Field, detail: 'boolean', documentation: 'True for the first element being iterated.' },
  { label: 'middle', kind: CompletionItemKind.Field, detail: 'boolean', documentation: 'True if element is neither first nor last.' },
  { label: 'last', kind: CompletionItemKind.Field, detail: 'boolean', documentation: 'True for the last element being iterated.' },
  { label: 'odd', kind: CompletionItemKind.Field, detail: 'boolean', documentation: 'True if count is odd.' },
  { label: 'even', kind: CompletionItemKind.Field, detail: 'boolean', documentation: 'True if count is even.' }
];

interface DeclaredVar {
  name: string;
  detail: string;
  kind: CompletionItemKind;
}

/**
 * Scan document text to extract dynamic local variable declarations.
 */
export function getDeclaredVariables(text: string): DeclaredVar[] {
  const vars: DeclaredVar[] = [];
  const seen = new Set<string>();

  const addVar = (name: string, detail: string, kind: CompletionItemKind) => {
    if (!seen.has(name)) {
      seen.add(name);
      vars.push({ name, detail, kind });
    }
  };

  // 1. data-sly-use.IDENTIFIER
  const useRegex = /data-sly-use\.([a-zA-Z0-9_]+)\s*=/g;
  let match;
  while ((match = useRegex.exec(text)) !== null) {
    addVar(match[1], 'HTL Use Bean', CompletionItemKind.Variable);
  }

  // 2. data-sly-test.IDENTIFIER
  const testRegex = /data-sly-test\.([a-zA-Z0-9_]+)\s*=/g;
  while ((match = testRegex.exec(text)) !== null) {
    addVar(match[1], 'HTL Test Result', CompletionItemKind.Variable);
  }

  // 3. data-sly-set.IDENTIFIER
  const setRegex = /data-sly-set\.([a-zA-Z0-9_]+)\s*=/g;
  while ((match = setRegex.exec(text)) !== null) {
    addVar(match[1], 'HTL Set Variable', CompletionItemKind.Variable);
  }

  // 4. data-sly-unwrap.IDENTIFIER
  const unwrapRegex = /data-sly-unwrap\.([a-zA-Z0-9_]+)\s*=/g;
  while ((match = unwrapRegex.exec(text)) !== null) {
    addVar(match[1], 'HTL Unwrap Result', CompletionItemKind.Variable);
  }

  // 5. data-sly-list.IDENTIFIER / data-sly-repeat.IDENTIFIER
  const listRegex = /data-sly-(?:list|repeat)\.([a-zA-Z0-9_]+)\s*=/g;
  while ((match = listRegex.exec(text)) !== null) {
    const name = match[1];
    addVar(name, 'Loop Item Variable', CompletionItemKind.Variable);
    addVar(`${name}List`, 'Loop Status Object', CompletionItemKind.Variable);
  }

  // 6. Implicit item / itemList if data-sly-list or data-sly-repeat is used without identifier
  const implicitListRegex = /data-sly-(list|repeat)(?!\.[a-zA-Z0-9_]+)\s*=/g;
  if (implicitListRegex.test(text)) {
    addVar('item', 'Loop Item Variable (Implicit)', CompletionItemKind.Variable);
    addVar('itemList', 'Loop Status Object (Implicit)', CompletionItemKind.Variable);
  }

  // 7. data-sly-template.IDENTIFIER
  const templateRegex = /data-sly-template\.([a-zA-Z0-9_]+)\s*=/g;
  while ((match = templateRegex.exec(text)) !== null) {
    addVar(match[1], 'HTL Template', CompletionItemKind.Function);
  }

  return vars;
}

// Dialog properties parsing helpers with cache
const dialogFileCache = new Map<string, { mtime: number; properties: string[] }>();

async function parseDialogProperties(dialogXmlPath: string): Promise<string[]> {
  try {
    const stats = await fs.stat(dialogXmlPath);
    const mtime = stats.mtimeMs;

    const cached = dialogFileCache.get(dialogXmlPath);
    if (cached && cached.mtime === mtime) {
      return cached.properties;
    }

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
    
    const result = Array.from(new Set(properties));
    dialogFileCache.set(dialogXmlPath, { mtime, properties: result });
    return result;
  } catch (err) {
    dialogFileCache.delete(dialogXmlPath);
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
  
  // Standard AEM JCR component properties to suggest as fallback/addition
  const commonJcrProps = ['jcr:title', 'jcr:description', 'jcr:primaryType', 'jcr:created', 'jcr:createdBy', 'sling:resourceType'];
  commonJcrProps.forEach(p => properties.add(p));

  return Array.from(properties).map(p => ({
    label: p,
    kind: CompletionItemKind.Field,
    detail: 'Component Dialog/JCR Property'
  }));
}

export function getUseDeclarations(text: string): Map<string, string> {
  const decls = new Map<string, string>();
  const regex = /data-sly-use\.([a-zA-Z0-9_]+)\s*=\s*["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    decls.set(match[1], match[2]);
  }
  return decls;
}

const javaFileCache = new Map<string, { mtime: number; properties: string[] }>();

export async function parseJavaGetters(javaFilePath: string): Promise<string[]> {
  try {
    let localPath = javaFilePath;
    if (localPath.startsWith('file://')) {
      localPath = fileURLToPath(localPath);
    }
    const stats = await fs.stat(localPath);
    const mtime = stats.mtimeMs;

    const cached = javaFileCache.get(localPath);
    if (cached && cached.mtime === mtime) {
      return cached.properties;
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
    const result = Array.from(new Set(properties));
    javaFileCache.set(localPath, { mtime, properties: result });
    return result;
  } catch (err) {
    let localPath = javaFilePath;
    if (localPath.startsWith('file://')) {
      localPath = fileURLToPath(localPath);
    }
    javaFileCache.delete(localPath);
    return [];
  }
}

/**
 * Handle all completions & suggestions for HTL.
 */
export async function getCompletions(
  document: TextDocument,
  position: Position,
  findClassFile: (className: string) => Promise<string | null>
): Promise<CompletionItem[]> {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const textBeforeCursor = text.substring(0, offset);

  // Check if we are inside an HTL expression ${ ... }
  const lastOpen = textBeforeCursor.lastIndexOf('${');
  const lastClose = textBeforeCursor.lastIndexOf('}');
  const isInsideExpression = lastOpen > lastClose;

  if (isInsideExpression) {
    const exprContext = textBeforeCursor.substring(lastOpen);
    
    // Scenario A: Expression options (after @)
    if (exprContext.includes('@')) {
      // Check if typing inside a categories option: categories='...' or categories="..."
      if (/categories\s*=\s*['"]?[a-zA-Z0-9\._\-]*$/i.test(textBeforeCursor)) {
        return getAllCategories().map(cat => ({
          label: cat,
          kind: CompletionItemKind.Value,
          detail: 'ClientLib Category'
        }));
      }

      // Check if typing inside a context option: context='...' or context="..."
      if (/context\s*=\s*['"]?[a-zA-Z]*$/i.test(textBeforeCursor)) {
        return HTL_CONTEXTS;
      }
      
      // Check if typing inside a type option: type='...' or type="..."
      if (/type\s*=\s*['"]?[a-zA-Z]*$/i.test(textBeforeCursor)) {
        return HTL_FORMAT_TYPES;
      }

      return HTL_OPTIONS;
    }
    
    // Scenario B: Object member access (typing a dot `.`)
    const exprText = exprContext.substring(2);
    const lastDot = exprText.lastIndexOf('.');
    if (lastDot !== -1) {
      const objectPart = exprText.substring(0, lastDot).trim();
      const objectName = objectPart.split(/[\s+\-*/&|!=<>?:]/).pop() || '';
      
      // 1. Dialog properties of the current component/page
      if (objectName === 'properties' || objectName === 'pageProperties' || objectName === 'inheritedPageProperties') {
        if (document.uri.startsWith('file://')) {
          const htmlPath = fileURLToPath(document.uri);
          return getComponentProperties(htmlPath);
        }
      }
      
      // 2. Loop list helper properties (itemList or <custom>List)
      if (objectName.endsWith('List')) {
        // Confirm if it is a list status variable in the file
        const declared = getDeclaredVariables(text);
        if (declared.some(v => v.name === objectName)) {
          return LIST_MEMBER_COMPLETIONS;
        }
      }

      // 3. Member properties for built-in globals (currentPage, resource, request, etc.)
      if (MEMBER_COMPLETIONS[objectName]) {
        return MEMBER_COMPLETIONS[objectName];
      }
      
      // 4. Java Model getter methods resolved via Use declaration
      const useDecls = getUseDeclarations(text);
      if (useDecls.has(objectName)) {
        const fullClassName = useDecls.get(objectName)!;
        const simpleClassName = fullClassName.split('.').pop() || '';
        
        try {
          const uri = await findClassFile(simpleClassName);
          if (uri) {
            const methods = await parseJavaGetters(uri);
            return methods.map(m => ({
              label: m,
              kind: CompletionItemKind.Field,
              detail: `Java Getter (${simpleClassName})`,
              documentation: `Resolved from Use class ${fullClassName}`
            }));
          }
        } catch (err) {
          // Ignore
        }
      }
      
      return [];
    }

    // Scenario C: Global and local variables inside expressions
    const declaredVars = getDeclaredVariables(text).map(v => ({
      label: v.name,
      kind: v.kind,
      detail: v.detail
    }));

    return [...HTL_GLOBALS, ...declaredVars];
  }

  // Check HTML tags/attributes context using the parser state machine
  const htmlContext = getHtmlContext(text, offset);
  
  if (htmlContext === 'TAG_NAME') {
    // If the user is typing a tag name, suggest 'sly'
    return SLY_TAGS;
  }
  
  if (htmlContext === 'ATTR_NAME') {
    // Suggest HTL block statement attributes
    return SLY_ATTRIBUTES;
  }

  return [];
}
