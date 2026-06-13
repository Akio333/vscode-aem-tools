import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getAllCategories } from '../clientlibs/clientlibIndex';

export interface XmlPositionContext {
  mode: 'TEXT' | 'TAG_NAME' | 'ATTR_NAME' | 'ATTR_VALUE';
  tagName?: string;
  attrName?: string;
  attrValuePrefix?: string;
}

/**
 * Robust XML context parser that scans backwards from cursor offset to find if the cursor
 * is inside a tag, attribute name, or attribute value.
 */
export function getXmlPositionContext(text: string, offset: number): XmlPositionContext {
  const textBefore = text.substring(0, offset);
  const lastCloseBracket = textBefore.lastIndexOf('>');
  const lastOpenBracket = textBefore.lastIndexOf('<');

  if (lastOpenBracket === -1 || lastCloseBracket > lastOpenBracket) {
    // We are outside of any tag, so we are in TEXT mode
    return { mode: 'TEXT' };
  }

  // Parse forward from the last open bracket to current cursor to determine state
  let state: 'TAG_NAME' | 'ATTR_NAME' | 'ATTR_VALUE' = 'TAG_NAME';
  let currentTagName = '';
  let currentAttrName = '';
  let currentAttrValue = '';
  let quoteChar: '"' | "'" | ' ' | null = null;

  for (let idx = lastOpenBracket + 1; idx < offset; idx++) {
    const char = text[idx];
    if (state === 'TAG_NAME') {
      if (/\s/.test(char)) {
        state = 'ATTR_NAME';
      } else {
        currentTagName += char;
      }
    } else if (state === 'ATTR_NAME') {
      if (char === '=') {
        state = 'ATTR_VALUE';
        currentAttrValue = '';
        quoteChar = null;
      } else if (/\s/.test(char)) {
        if (currentAttrName !== '') {
          currentAttrName = '';
        }
      } else {
        currentAttrName += char;
      }
    } else if (state === 'ATTR_VALUE') {
      if (quoteChar === null) {
        if (char === '"' || char === "'") {
          quoteChar = char;
        } else if (!/\s/.test(char)) {
          quoteChar = ' '; // unquoted value marker
          currentAttrValue += char;
        }
      } else if (quoteChar === ' ') {
        if (/\s/.test(char)) {
          state = 'ATTR_NAME';
          currentAttrName = '';
        } else {
          currentAttrValue += char;
        }
      } else {
        if (char === quoteChar) {
          state = 'ATTR_NAME';
          currentAttrName = '';
        } else {
          currentAttrValue += char;
        }
      }
    }
  }

  if (state === 'TAG_NAME') {
    return { mode: 'TAG_NAME', tagName: currentTagName };
  } else if (state === 'ATTR_NAME') {
    return { mode: 'ATTR_NAME', tagName: currentTagName, attrName: currentAttrName };
  } else {
    return {
      mode: 'ATTR_VALUE',
      tagName: currentTagName,
      attrName: currentAttrName,
      attrValuePrefix: currentAttrValue
    };
  }
}

export function getActiveXtype(textBeforeCursor: string): string | undefined {
  const lastOpen = textBeforeCursor.lastIndexOf('<');
  if (lastOpen === -1) return undefined;
  const tagText = textBeforeCursor.substring(lastOpen);
  const match = tagText.match(/\bxtype=["']([^"']+)["']/);
  return match ? match[1] : undefined;
}

// ----------------------------------------------------
// Classic UI Data Dictionaries
// ----------------------------------------------------
const CLASSIC_TAG_SNIPPETS: CompletionItem[] = [
  {
    label: 'dialog',
    kind: CompletionItemKind.Snippet,
    detail: 'Classic UI Dialog',
    documentation: 'Standard root element representing a Classic UI Dialog.',
    insertText: 'dialog\n\tjcr:primaryType="cq:Dialog"\n\ttitle="${1:Dialog Title}"\n\txtype="dialog">\n\t<items jcr:primaryType="cq:WidgetCollection">\n\t\t$0\n\t</items>\n</dialog>',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'tabpanel',
    kind: CompletionItemKind.Snippet,
    detail: 'Classic UI TabPanel',
    documentation: 'Tabbed layout container.',
    insertText: 'tabs\n\tjcr:primaryType="cq:TabPanel">\n\t<items jcr:primaryType="cq:WidgetCollection">\n\t\t$0\n\t</items>\n</tabs>',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'panel',
    kind: CompletionItemKind.Snippet,
    detail: 'Classic UI Panel',
    documentation: 'Layout container for grouping widgets inside a tab.',
    insertText: 'tab1\n\tjcr:primaryType="cq:Widget"\n\ttitle="${1:Tab Title}"\n\txtype="panel">\n\t<items jcr:primaryType="cq:WidgetCollection">\n\t\t$0\n\t</items>\n</tab1>',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'widget',
    kind: CompletionItemKind.Snippet,
    detail: 'Classic UI Widget',
    documentation: 'A generic Classic UI widget placeholder.',
    insertText: '${1:field}\n\tjcr:primaryType="cq:Widget"\n\tfieldLabel="${2:Label}"\n\tname="./${3:propertyName}"\n\txtype="${4:textfield}" />',
    insertTextFormat: InsertTextFormat.Snippet
  }
];

const CLASSIC_XTYPE_COMPLETIONS: CompletionItem[] = [
  { label: '"textfield"', kind: CompletionItemKind.Value, detail: 'Classic UI Textfield', documentation: 'Single-line text input field widget.' },
  { label: '"textarea"', kind: CompletionItemKind.Value, detail: 'Classic UI Textarea', documentation: 'Multi-line text input area widget.' },
  { label: '"numberfield"', kind: CompletionItemKind.Value, detail: 'Classic UI Numberfield', documentation: 'Numeric input field widget.' },
  { label: '"datefield"', kind: CompletionItemKind.Value, detail: 'Classic UI Datefield', documentation: 'Date picker input field widget.' },
  { label: '"selection"', kind: CompletionItemKind.Value, detail: 'Classic UI Selection', documentation: 'Drop-down select, checkbox list, or radio group widget. Requires type attribute.' },
  { label: '"pathfield"', kind: CompletionItemKind.Value, detail: 'Classic UI Pathfield', documentation: 'Repository path browser input field widget.' },
  { label: '"multifield"', kind: CompletionItemKind.Value, detail: 'Classic UI Multifield', documentation: 'Multi-value field editor that duplicates a child widget configuration.' },
  { label: '"richtext"', kind: CompletionItemKind.Value, detail: 'Classic UI Richtext', documentation: 'WYSIWYG Rich Text Editor widget.' },
  { label: '"checkbox"', kind: CompletionItemKind.Value, detail: 'Classic UI Checkbox', documentation: 'Single checkbox toggle widget.' },
  { label: '"dialogfield"', kind: CompletionItemKind.Value, detail: 'Classic UI Dialogfield', documentation: 'Wrapper for fields inside a custom dialog.' },
  { label: '"panel"', kind: CompletionItemKind.Value, detail: 'Classic UI Panel', documentation: 'Layout container for grouping widgets.' },
  { label: '"tabpanel"', kind: CompletionItemKind.Value, detail: 'Classic UI TabPanel', documentation: 'Tabbed layout container.' },
  { label: '"hidden"', kind: CompletionItemKind.Value, detail: 'Classic UI Hidden', documentation: 'Hidden input field to store non-editable values.' },
  { label: '"datetime"', kind: CompletionItemKind.Value, detail: 'Classic UI DateTime', documentation: 'Combined Date and Time selection field.' },
  { label: '"combobox"', kind: CompletionItemKind.Value, detail: 'Classic UI ComboBox', documentation: 'Text field combined with a dropdown list.' },
  { label: '"browsefield"', kind: CompletionItemKind.Value, detail: 'Classic UI Browsefield', documentation: 'Field with a file system browser button.' },
  { label: '"tags"', kind: CompletionItemKind.Value, detail: 'Classic UI Tags', documentation: 'AEM Tags selection widget.' },
  { label: '"cq.tagspanel"', kind: CompletionItemKind.Value, detail: 'Classic UI TagsPanel', documentation: 'Standard tag selector pane.' },
  { label: '"static"', kind: CompletionItemKind.Value, detail: 'Classic UI Static', documentation: 'Static text or HTML display label.' }
];

const CLASSIC_COMMON_ATTRIBUTES: CompletionItem[] = [
  { label: 'jcr:primaryType', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Set to cq:Widget.' },
  { label: 'xtype', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The Classic UI widget type name.' },
  { label: 'name', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Target JCR property name prefix (e.g. ./title).' },
  { label: 'fieldLabel', kind: CompletionItemKind.Field, detail: 'String', documentation: 'User-facing label for the field.' },
  { label: 'fieldDescription', kind: CompletionItemKind.Field, detail: 'String', documentation: 'User-facing help description.' },
  { label: 'defaultValue', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Default fallback value.' },
  { label: 'allowBlank', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Whether blank values are allowed ({Boolean}true).' },
  { label: 'disabled', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Disables the field ({Boolean}true).' },
  { label: 'visible', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Visibility of the widget ({Boolean}true).' }
];

const CLASSIC_TYPE_SPECIFIC_ATTRIBUTES: Record<string, CompletionItem[]> = {
  textfield: [
    { label: 'emptyText', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Placeholder text shown when field is empty.' },
    { label: 'maxLength', kind: CompletionItemKind.Field, detail: 'Integer', documentation: 'Maximum character length.' },
    { label: 'regex', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Regex validation string.' }
  ],
  textarea: [
    { label: 'emptyText', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Placeholder text.' },
    { label: 'maxLength', kind: CompletionItemKind.Field, detail: 'Integer', documentation: 'Maximum character length.' }
  ],
  numberfield: [
    { label: 'allowDecimals', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Allow decimals ({Boolean}true).' },
    { label: 'allowNegative', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Allow negative values ({Boolean}true).' },
    { label: 'minValue', kind: CompletionItemKind.Field, detail: 'Double', documentation: 'Minimum numeric value.' },
    { label: 'maxValue', kind: CompletionItemKind.Field, detail: 'Double', documentation: 'Maximum numeric value.' }
  ],
  datefield: [
    { label: 'format', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Date format string (e.g., Y-m-d).' }
  ],
  selection: [
    { label: 'type', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Selection display type: select, checkbox, or radio.' },
    { label: 'optionsProvider', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Javascript function to dynamically fetch options.' },
    { label: 'options', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Path to node containing static options.' },
    { label: 'multiSelect', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Enable multiple selections ({Boolean}true).' }
  ],
  pathfield: [
    { label: 'rootPath', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Root path of the repository browser (e.g., /content).' },
    { label: 'escapeAmp', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Escapes ampersand characters ({Boolean}true).' },
    { label: 'rootTitle', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Title of the browser window.' }
  ],
  multifield: [
    { label: 'orderable', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Allow reordering items ({Boolean}true).' },
    { label: 'fieldConfig', kind: CompletionItemKind.Field, detail: 'Node', documentation: 'Subnode configuring the nested widget.' }
  ],
  richtext: [
    { label: 'externalStyleSheets', kind: CompletionItemKind.Field, detail: 'String[]', documentation: 'Array of custom CSS stylesheets to load in editor.' },
    { label: 'rtePlugins', kind: CompletionItemKind.Field, detail: 'Node', documentation: 'Subnode containing configuration for rich-text plugins.' }
  ]
};

// ----------------------------------------------------
// Data Dictionaries for Autocomplete Items
// ----------------------------------------------------

// 1. Granite UI Form Components (used in Dialogs / Design Dialogs)
const GRANITE_TAG_SNIPPETS: CompletionItem[] = [
  {
    label: 'container',
    kind: CompletionItemKind.Snippet,
    detail: 'Granite Container',
    documentation: 'A container that layout items sequentially.',
    insertText: 'container\n\tjcr:primaryType="nt:unstructured"\n\tsling:resourceType="granite/ui/components/coral/foundation/container">\n\t<items jcr:primaryType="nt:unstructured">\n\t\t$0\n\t</items>\n</container>',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'tabs',
    kind: CompletionItemKind.Snippet,
    detail: 'Granite Tabs',
    documentation: 'Tabs container for Coral-based Granite UI dialogs.',
    insertText: 'tabs\n\tjcr:primaryType="nt:unstructured"\n\tsling:resourceType="granite/ui/components/coral/foundation/tabs">\n\t<items jcr:primaryType="nt:unstructured">\n\t\t$0\n\t</items>\n</tabs>',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'fixedcolumns',
    kind: CompletionItemKind.Snippet,
    detail: 'Granite Fixed Columns',
    documentation: 'Fixed columns layout container.',
    insertText: 'fixedcolumns\n\tjcr:primaryType="nt:unstructured"\n\tsling:resourceType="granite/ui/components/coral/foundation/fixedcolumns">\n\t<items jcr:primaryType="nt:unstructured">\n\t\t$0\n\t</items>\n</fixedcolumns>',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'textfield',
    kind: CompletionItemKind.Snippet,
    detail: 'Granite Text Field',
    documentation: 'Single-line text input field.',
    insertText: 'textfield\n\tjcr:primaryType="nt:unstructured"\n\tsling:resourceType="granite/ui/components/coral/foundation/form/textfield"\n\tfieldLabel="${1:Label}"\n\tname="./${2:propertyName}" />',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'textarea',
    kind: CompletionItemKind.Snippet,
    detail: 'Granite Text Area',
    documentation: 'Multi-line text input area.',
    insertText: 'textarea\n\tjcr:primaryType="nt:unstructured"\n\tsling:resourceType="granite/ui/components/coral/foundation/form/textarea"\n\tfieldLabel="${1:Label}"\n\tname="./${2:propertyName}" />',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'select',
    kind: CompletionItemKind.Snippet,
    detail: 'Granite Select Dropdown',
    documentation: 'Drop-down select list.',
    insertText: 'select\n\tjcr:primaryType="nt:unstructured"\n\tsling:resourceType="granite/ui/components/coral/foundation/form/select"\n\tfieldLabel="${1:Label}"\n\tname="./${2:propertyName}">\n\t<items jcr:primaryType="nt:unstructured">\n\t\t<option1\n\t\t\tjcr:primaryType="nt:unstructured"\n\t\t\ttext="Option 1"\n\t\t\tvalue="val1" />\n\t</items>\n</select>',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'checkbox',
    kind: CompletionItemKind.Snippet,
    detail: 'Granite Checkbox',
    documentation: 'Checkbox form field.',
    insertText: 'checkbox\n\tjcr:primaryType="nt:unstructured"\n\tsling:resourceType="granite/ui/components/coral/foundation/form/checkbox"\n\ttext="${1:Label}"\n\tname="./${2:propertyName}"\n\tvalue="true" />',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'pathfield',
    kind: CompletionItemKind.Snippet,
    detail: 'Granite Path Field',
    documentation: 'Path selection field with repository browser.',
    insertText: 'pathfield\n\tjcr:primaryType="nt:unstructured"\n\tsling:resourceType="granite/ui/components/coral/foundation/form/pathfield"\n\tfieldLabel="${1:Label}"\n\tname="./${2:propertyName}"\n\trootPath="${3:/content}" />',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'multifield',
    kind: CompletionItemKind.Snippet,
    detail: 'Granite Multifield',
    documentation: 'A container that allows users to add multiple instances of a field.',
    insertText: 'multifield\n\tjcr:primaryType="nt:unstructured"\n\tsling:resourceType="granite/ui/components/coral/foundation/form/multifield"\n\tfieldLabel="${1:Label}">\n\t<field\n\t\tjcr:primaryType="nt:unstructured"\n\t\tsling:resourceType="granite/ui/components/coral/foundation/form/textfield"\n\t\tname="./${2:propertyName}" />\n</multifield>',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'numberfield',
    kind: CompletionItemKind.Snippet,
    detail: 'Granite Number Field',
    documentation: 'Form field for entering numbers.',
    insertText: 'numberfield\n\tjcr:primaryType="nt:unstructured"\n\tsling:resourceType="granite/ui/components/coral/foundation/form/numberfield"\n\tfieldLabel="${1:Label}"\n\tname="./${2:propertyName}" />',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'datepicker',
    kind: CompletionItemKind.Snippet,
    detail: 'Granite Date Picker',
    documentation: 'Form field for selecting dates and/or times.',
    insertText: 'datepicker\n\tjcr:primaryType="nt:unstructured"\n\tsling:resourceType="granite/ui/components/coral/foundation/form/datepicker"\n\tfieldLabel="${1:Label}"\n\tname="./${2:propertyName}" />',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'switch',
    kind: CompletionItemKind.Snippet,
    detail: 'Granite Switch Toggle',
    documentation: 'Switch toggle switch control.',
    insertText: 'switch\n\tjcr:primaryType="nt:unstructured"\n\tsling:resourceType="granite/ui/components/coral/foundation/form/switch"\n\tfieldLabel="${1:Label}"\n\tname="./${2:propertyName}" />',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'fileupload',
    kind: CompletionItemKind.Snippet,
    detail: 'Granite File Upload',
    documentation: 'File upload widget.',
    insertText: 'fileupload\n\tjcr:primaryType="nt:unstructured"\n\tsling:resourceType="granite/ui/components/coral/foundation/form/fileupload"\n\tfieldLabel="${1:Label}"\n\tname="./${2:propertyName}"\n\tuploadUrl="/content" />',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'hidden',
    kind: CompletionItemKind.Snippet,
    detail: 'Granite Hidden Field',
    documentation: 'Hidden form field.',
    insertText: 'hidden\n\tjcr:primaryType="nt:unstructured"\n\tsling:resourceType="granite/ui/components/coral/foundation/form/hidden"\n\tname="./${1:propertyName}"\n\tvalue="${2:value}" />',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'include',
    kind: CompletionItemKind.Snippet,
    detail: 'Granite Include Component',
    documentation: 'Includes another Granite UI component path.',
    insertText: 'include\n\tjcr:primaryType="nt:unstructured"\n\tsling:resourceType="granite/ui/components/coral/foundation/include"\n\tpath="${1:path}" />',
    insertTextFormat: InsertTextFormat.Snippet
  }
];

const GRANITE_ATTRIBUTES: CompletionItem[] = [
  { label: 'jcr:primaryType', kind: CompletionItemKind.Field, detail: 'String', documentation: 'JCR Node primary type. Typically nt:unstructured for dialog nodes.' },
  { label: 'sling:resourceType', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Granite UI Coral components resource path.' },
  { label: 'fieldLabel', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The user-facing label for the form field.' },
  { label: 'fieldDescription', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The user-facing description for the form field.' },
  { label: 'name', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The property name prefix. E.g. ./title.' },
  { label: 'value', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Default value of the field.' },
  { label: 'required', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Makes the form field required ({Boolean}true).' },
  { label: 'disabled', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Disables the form field ({Boolean}true).' },
  { label: 'emptyText', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Placeholder text displayed when empty.' },
  { label: 'checked', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Whether checkbox/switch is checked ({Boolean}true).' },
  { label: 'multiple', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Allows selecting multiple values if supported ({Boolean}true).' },
  { label: 'rootPath', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Root path parameter for pathfield/autocomplete browsers.' },
  { label: 'allowBlank', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Allows empty or blank values ({Boolean}true).' },
  { label: 'type', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Input type parameter (e.g. text, date, email).' },
  { label: 'text', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Button or checkbox text label.' },
  { label: 'renderReadOnly', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Renders the field as read-only ({Boolean}true).' },
  { label: 'ignoreData', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Ignores submitted data for this component ({Boolean}true).' }
];

const GRANITE_RESOURCE_TYPES = [
  'granite/ui/components/coral/foundation/container',
  'granite/ui/components/coral/foundation/tabs',
  'granite/ui/components/coral/foundation/fixedcolumns',
  'granite/ui/components/coral/foundation/form/textfield',
  'granite/ui/components/coral/foundation/form/textarea',
  'granite/ui/components/coral/foundation/form/select',
  'granite/ui/components/coral/foundation/form/checkbox',
  'granite/ui/components/coral/foundation/form/pathfield',
  'granite/ui/components/coral/foundation/form/multifield',
  'granite/ui/components/coral/foundation/form/numberfield',
  'granite/ui/components/coral/foundation/form/datepicker',
  'granite/ui/components/coral/foundation/form/radio',
  'granite/ui/components/coral/foundation/form/radiogroup',
  'granite/ui/components/coral/foundation/form/hidden',
  'granite/ui/components/coral/foundation/form/switch',
  'granite/ui/components/coral/foundation/form/fileupload',
  'granite/ui/components/coral/foundation/include'
].map(val => ({
  label: val,
  kind: CompletionItemKind.Value,
  detail: 'Granite Coral Resource Type'
}));

// 2. AEM cq:Component completions
const COMPONENT_TAG_SNIPPETS: CompletionItem[] = [
  {
    label: 'jcr:root',
    kind: CompletionItemKind.Snippet,
    detail: 'cq:Component root tag',
    documentation: 'Standard root element representing an AEM Component.',
    insertText: 'jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0" xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:jcr="http://www.jcp.org/jcr/1.0"\n\tjcr:primaryType="cq:Component"\n\tjcr:title="${1:Component Title}"\n\tjcr:description="${2:Component Description}"\n\tcomponentGroup="${3:Custom Group}" />',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'cq:htmlTag',
    kind: CompletionItemKind.Snippet,
    detail: 'cq:htmlTag subnode',
    documentation: 'Configure custom HTML container wrapping tags and classes.',
    insertText: 'cq:htmlTag\n\tjcr:primaryType="nt:unstructured"\n\tcq:tagName="${1:div}"\n\tclass="${2:class-name}" />',
    insertTextFormat: InsertTextFormat.Snippet
  }
];

const COMPONENT_ATTRIBUTES: CompletionItem[] = [
  { label: 'jcr:primaryType', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Set to cq:Component.' },
  { label: 'jcr:title', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The component title shown in AEM menus.' },
  { label: 'jcr:description', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Component description.' },
  { label: 'componentGroup', kind: CompletionItemKind.Field, detail: 'String', documentation: 'The editor sidebar group category. E.g. ".core-wcm".' },
  { label: 'sling:resourceSuperType', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Component path to inherit attributes and logic from.' },
  { label: 'cq:noDecoration', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Disable wrap decoration tags in editor ({Boolean}true).' },
  { label: 'cq:cellNames', kind: CompletionItemKind.Field, detail: 'String[]', documentation: 'Allowed cell list.' },
  { label: 'cq:isContainer', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Mark component as a drag-and-drop container ({Boolean}true).' }
];

const HTML_TAG_ATTRIBUTES: CompletionItem[] = [
  { label: 'jcr:primaryType', kind: CompletionItemKind.Field, detail: 'String' },
  { label: 'cq:tagName', kind: CompletionItemKind.Field, detail: 'String', documentation: 'HTML element wrapper name (e.g. div, span, article).' },
  { label: 'class', kind: CompletionItemKind.Field, detail: 'String', documentation: 'CSS Class names added to the decoration wrapper.' },
  { label: 'id', kind: CompletionItemKind.Field, detail: 'String', documentation: 'HTML wrapper id.' }
];

// 3. cq:ClientLibraryFolder completions
const CLIENTLIB_TAG_SNIPPETS: CompletionItem[] = [
  {
    label: 'jcr:root',
    kind: CompletionItemKind.Snippet,
    detail: 'cq:ClientLibraryFolder root tag',
    documentation: 'Defines an AEM client library bundle.',
    insertText: 'jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0" xmlns:jcr="http://www.jcp.org/jcr/1.0"\n\tjcr:primaryType="cq:ClientLibraryFolder"\n\tcategories="[${1:category}]"\n\tdependencies="[${2:dependency}]"\n\tallowProxy="{Boolean}true" />',
    insertTextFormat: InsertTextFormat.Snippet
  }
];

const CLIENTLIB_ATTRIBUTES: CompletionItem[] = [
  { label: 'jcr:primaryType', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Set to cq:ClientLibraryFolder.' },
  { label: 'categories', kind: CompletionItemKind.Field, detail: 'String[]', documentation: 'Target categories lists. Format: [my-app.site].' },
  { label: 'dependencies', kind: CompletionItemKind.Field, detail: 'String[]', documentation: 'Required dependency client libraries.' },
  { label: 'embed', kind: CompletionItemKind.Field, detail: 'String[]', documentation: 'Other client library paths to merge into this client library.' },
  { label: 'allowProxy', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Allows referencing via /etc.clientlibs proxy provider ({Boolean}true).' }
];

// 4. cq:EditConfig completions
const EDITCONFIG_TAG_SNIPPETS: CompletionItem[] = [
  {
    label: 'jcr:root',
    kind: CompletionItemKind.Snippet,
    detail: 'cq:EditConfig root tag',
    insertText: 'jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0" xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:nt="http://www.jcp.org/jcr/nt/1.0"\n\tjcr:primaryType="cq:EditConfig">\n\t$0\n</jcr:root>',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'cq:inplaceEditing',
    kind: CompletionItemKind.Snippet,
    detail: 'In-place Editing subnode',
    insertText: 'cq:inplaceEditing\n\tjcr:primaryType="cq:InplaceEditingConfig"\n\tactive="{Boolean}true"\n\teditorType="text" />',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'cq:listeners',
    kind: CompletionItemKind.Snippet,
    detail: 'Action listeners subnode',
    insertText: 'cq:listeners\n\tjcr:primaryType="cq:EditListenersConfig"\n\tafteredit="REFRESH_SELF"\n\tafterdelete="REFRESH_PARENT" />',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'cq:dropTargets',
    kind: CompletionItemKind.Snippet,
    detail: 'Drop target subnode',
    insertText: 'cq:dropTargets\n\tjcr:primaryType="nt:unstructured">\n\t$0\n</cq:dropTargets>',
    insertTextFormat: InsertTextFormat.Snippet
  },
  {
    label: 'cq:actionConfigs',
    kind: CompletionItemKind.Snippet,
    detail: 'Custom actions subnode',
    insertText: 'cq:actionConfigs\n\tjcr:primaryType="nt:unstructured">\n\t$0\n</cq:actionConfigs>',
    insertTextFormat: InsertTextFormat.Snippet
  }
];

const EDITCONFIG_ROOT_ATTRIBUTES: CompletionItem[] = [
  { label: 'jcr:primaryType', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Set to cq:EditConfig.' },
  { label: 'cq:actions', kind: CompletionItemKind.Field, detail: 'String[]', documentation: 'AEM component toolbar actions list. E.g. [edit,delete].' },
  { label: 'cq:layout', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Layout mode: editbar or rollover.' },
  { label: 'cq:dialogMode', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Dialog container display modes (floating, auto).' },
  { label: 'cq:emptyText', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Placeholder message when component is empty.' }
];

const LISTENERS_ATTRIBUTES: CompletionItem[] = [
  { label: 'jcr:primaryType', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Set to cq:EditListenersConfig.' },
  { label: 'aftercreate', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Listener after node creation (REFRESH_SELF, REFRESH_PARENT, REFRESH_PAGE).' },
  { label: 'afteredit', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Listener after modification.' },
  { label: 'afterdelete', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Listener after deletion.' },
  { label: 'afterinsert', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Listener after insertion.' },
  { label: 'aftermove', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Listener after reposition.' }
];

const INPLACE_ATTRIBUTES: CompletionItem[] = [
  { label: 'jcr:primaryType', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Set to cq:InplaceEditingConfig.' },
  { label: 'active', kind: CompletionItemKind.Field, detail: 'Boolean', documentation: 'Activate in-place editing ({Boolean}true).' },
  { label: 'editorType', kind: CompletionItemKind.Field, detail: 'String', documentation: 'Editor type: text, table, etc.' }
];

// Helper values
const BOOLEAN_VALUES = [
  { label: '"{Boolean}true"', kind: CompletionItemKind.Value, detail: 'Boolean True' },
  { label: '"{Boolean}false"', kind: CompletionItemKind.Value, detail: 'Boolean False' }
];

const REFRESH_VALUES = [
  { label: 'REFRESH_SELF', kind: CompletionItemKind.Value, detail: 'Refresh this component' },
  { label: 'REFRESH_PARENT', kind: CompletionItemKind.Value, detail: 'Refresh parent container' },
  { label: 'REFRESH_PAGE', kind: CompletionItemKind.Value, detail: 'Refresh the full page' }
];

/**
 * Handle autocomplete completions for JCR XML configurations.
 */
export function getJcrXmlCompletions(
  document: TextDocument,
  position: Position
): CompletionItem[] {
  const text = document.getText();
  const offset = document.offsetAt(position);

  // 1. Detect position context (tag name, attribute name, or attribute value)
  const context = getXmlPositionContext(text, offset);

  if (context.mode === 'TEXT') {
    return [];
  }

  // 2. Classify active AEM document context
  const uri = document.uri;
  let fileType: 'component' | 'clientlib' | 'dialog' | 'designdialog' | 'editconfig' | 'classicdialog' | 'unknown' = 'unknown';

  if (uri.endsWith('/dialog.xml') || uri.endsWith('\\dialog.xml') || uri.endsWith('dialog.xml')) {
    fileType = 'classicdialog';
  } else if (uri.endsWith('_cq_editConfig.xml')) {
    fileType = 'editconfig';
  } else if (uri.includes('_cq_dialog')) {
    fileType = 'dialog';
  } else if (uri.includes('_cq_design_dialog')) {
    fileType = 'designdialog';
  } else if (uri.endsWith('.content.xml')) {
    if (text.includes('cq:Component')) {
      fileType = 'component';
    } else if (text.includes('cq:ClientLibraryFolder')) {
      fileType = 'clientlib';
    } else {
      const normUri = uri.toLowerCase();
      if (normUri.includes('/clientlibs') || normUri.includes('/clientlib')) {
        fileType = 'clientlib';
      } else if (normUri.includes('/components/') || normUri.includes('/apps/')) {
        fileType = 'component';
      }
    }
  }

  // 3. Delegate completions by mode and classified fileType
  const tag = context.tagName || '';
  const attr = context.attrName || '';

  if (context.mode === 'TAG_NAME') {
    switch (fileType) {
      case 'classicdialog':
        return CLASSIC_TAG_SNIPPETS;

      case 'dialog':
      case 'designdialog':
        // Standard coral templates inside dialog
        return GRANITE_TAG_SNIPPETS;

      case 'component':
        return COMPONENT_TAG_SNIPPETS;

      case 'clientlib':
        return CLIENTLIB_TAG_SNIPPETS;

      case 'editconfig':
        return EDITCONFIG_TAG_SNIPPETS;

      case 'unknown':
      default:
        // Offer all root options if we are at the beginning of standard XML files
        return [
          ...COMPONENT_TAG_SNIPPETS.filter(s => s.label === 'jcr:root'),
          ...CLIENTLIB_TAG_SNIPPETS.filter(s => s.label === 'jcr:root'),
          ...EDITCONFIG_TAG_SNIPPETS.filter(s => s.label === 'jcr:root'),
          {
            label: 'jcr:root (Granite Dialog)',
            kind: CompletionItemKind.Snippet,
            detail: 'cq:dialog root tag',
            insertText: 'jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0" xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:nt="http://www.jcp.org/jcr/nt/1.0"\n\tjcr:primaryType="nt:unstructured"\n\tsling:resourceType="cq/gui/components/authoring/dialog"\n\tjcr:title="${1:Dialog Title}">\n\t<content\n\t\tjcr:primaryType="nt:unstructured"\n\t\tsling:resourceType="granite/ui/components/coral/foundation/container">\n\t\t<items jcr:primaryType="nt:unstructured">\n\t\t\t$0\n\t\t</items>\n\t</content>\n</jcr:root>',
            insertTextFormat: InsertTextFormat.Snippet
          },
          {
            label: 'jcr:root (Classic Dialog)',
            kind: CompletionItemKind.Snippet,
            detail: 'cq:Dialog root tag',
            insertText: 'jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0" xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:nt="http://www.jcp.org/jcr/nt/1.0"\n\tjcr:primaryType="cq:Dialog"\n\ttitle="${1:Dialog Title}"\n\txtype="dialog">\n\t<items jcr:primaryType="cq:WidgetCollection">\n\t\t$0\n\t</items>\n</jcr:root>',
            insertTextFormat: InsertTextFormat.Snippet
          }
        ];
    }
  }

  if (context.mode === 'ATTR_NAME') {
    switch (fileType) {
      case 'classicdialog':
        {
          const xtype = getActiveXtype(text.substring(0, offset));
          if (xtype && CLASSIC_TYPE_SPECIFIC_ATTRIBUTES[xtype]) {
            return [...CLASSIC_COMMON_ATTRIBUTES, ...CLASSIC_TYPE_SPECIFIC_ATTRIBUTES[xtype]];
          }
          return CLASSIC_COMMON_ATTRIBUTES;
        }

      case 'dialog':
      case 'designdialog':
        return GRANITE_ATTRIBUTES;

      case 'component':
        if (tag === 'cq:htmlTag') {
          return HTML_TAG_ATTRIBUTES;
        }
        return COMPONENT_ATTRIBUTES;

      case 'clientlib':
        return CLIENTLIB_ATTRIBUTES;

      case 'editconfig':
        if (tag === 'cq:inplaceEditing') {
          return INPLACE_ATTRIBUTES;
        } else if (tag === 'cq:listeners') {
          return LISTENERS_ATTRIBUTES;
        }
        return EDITCONFIG_ROOT_ATTRIBUTES;

      default:
        // Merge general lists
        return [...GRANITE_ATTRIBUTES, ...COMPONENT_ATTRIBUTES, ...CLIENTLIB_ATTRIBUTES];
    }
  }

  if (context.mode === 'ATTR_VALUE') {
    // Boolean value completions for common flags
    const isBoolAttr = ['required', 'disabled', 'checked', 'multiple', 'allowBlank', 'active', 'allowProxy', 'cq:noDecoration', 'cq:isContainer'].includes(attr);
    if (isBoolAttr) {
      return BOOLEAN_VALUES;
    }

    if (['categories', 'dependencies', 'embed'].includes(attr)) {
      return getAllCategories().map(cat => ({
        label: cat,
        kind: CompletionItemKind.Value,
        detail: 'ClientLib Category'
      }));
    }

    if (attr === 'xtype' && (fileType === 'classicdialog' || fileType === 'unknown')) {
      return CLASSIC_XTYPE_COMPLETIONS;
    }

    if (attr === 'type' && fileType === 'classicdialog') {
      const xtype = getActiveXtype(text.substring(0, offset));
      if (xtype === 'selection') {
        return [
          { label: '"select"', kind: CompletionItemKind.Value, documentation: 'Select Dropdown List' },
          { label: '"checkbox"', kind: CompletionItemKind.Value, documentation: 'Checkbox List' },
          { label: '"radio"', kind: CompletionItemKind.Value, documentation: 'Radio Option Group' }
        ];
      }
    }

    if (attr === 'rootPath' && fileType === 'classicdialog') {
      return [
        { label: '"/content"', kind: CompletionItemKind.Value },
        { label: '"/etc"', kind: CompletionItemKind.Value }
      ];
    }

    if (attr === 'jcr:primaryType') {
      switch (fileType) {
        case 'classicdialog':
          if (tag === 'dialog' || tag === 'jcr:root') {
            return [{ label: '"cq:Dialog"', kind: CompletionItemKind.Value }];
          }
          if (tag === 'items') {
            return [{ label: '"cq:WidgetCollection"', kind: CompletionItemKind.Value }];
          }
          if (tag === 'tabs') {
            return [{ label: '"cq:TabPanel"', kind: CompletionItemKind.Value }];
          }
          return [
            { label: '"cq:Widget"', kind: CompletionItemKind.Value },
            { label: '"cq:WidgetCollection"', kind: CompletionItemKind.Value }
          ];

        case 'component':
          return tag === 'jcr:root'
            ? [{ label: '"cq:Component"', kind: CompletionItemKind.Value }]
            : [{ label: '"nt:unstructured"', kind: CompletionItemKind.Value }];
        case 'clientlib':
          return [{ label: '"cq:ClientLibraryFolder"', kind: CompletionItemKind.Value }];
        case 'editconfig':
          if (tag === 'cq:inplaceEditing') {
            return [{ label: '"cq:InplaceEditingConfig"', kind: CompletionItemKind.Value }];
          } else if (tag === 'cq:listeners') {
            return [{ label: '"cq:EditListenersConfig"', kind: CompletionItemKind.Value }];
          }
          return [
            { label: '"cq:EditConfig"', kind: CompletionItemKind.Value },
            { label: '"nt:unstructured"', kind: CompletionItemKind.Value }
          ];
        case 'dialog':
        case 'designdialog':
        default:
          return [{ label: '"nt:unstructured"', kind: CompletionItemKind.Value }];
      }
    }

    if (attr === 'sling:resourceType') {
      if (fileType === 'dialog' || fileType === 'designdialog' || fileType === 'unknown') {
        return GRANITE_RESOURCE_TYPES;
      }
    }

    if (['aftercreate', 'afteredit', 'afterdelete', 'afterinsert', 'aftermove'].includes(attr)) {
      return REFRESH_VALUES;
    }

    if (attr === 'editorType') {
      return [{ label: '"text"', kind: CompletionItemKind.Value }];
    }

    if (attr === 'cq:layout') {
      return [
        { label: '"editbar"', kind: CompletionItemKind.Value },
        { label: '"rollover"', kind: CompletionItemKind.Value }
      ];
    }

    if (attr === 'cq:dialogMode') {
      return [
        { label: '"floating"', kind: CompletionItemKind.Value },
        { label: '"auto"', kind: CompletionItemKind.Value }
      ];
    }

    if (attr === 'cq:tagName') {
      return ['div', 'span', 'article', 'section', 'li', 'ul'].map(val => ({
        label: `"${val}"`,
        kind: CompletionItemKind.Value
      }));
    }
  }

  return [];
}
