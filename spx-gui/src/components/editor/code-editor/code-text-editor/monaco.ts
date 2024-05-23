import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { keywords, brackets, typeKeywords, operators } from '@/utils/spx'
import type { I18n } from '@/utils/i18n'
import type { FormatResponse } from '@/apis/util'
import formatWasm from '@/assets/format.wasm?url'
import { SnippetType, getAllSnippets } from './snippets'
import { useUIVariables } from '@/components/ui'
import type { IRange, languages } from 'monaco-editor'
import type { Project } from '@/models/project'

declare global {
  /** Notice: this is available only after `initFormatWasm()` */
  function formatSPX(input: string): FormatResponse
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function initFormatWasm() {
  const go = new Go()
  const result = await WebAssembly.instantiateStreaming(fetch(formatWasm), go.importObject)
  go.run(result.instance)
}

export const defaultThemeName = 'spx-default-theme'

/** Global initializations for monaco editor */
export function initMonaco(
  monaco: typeof import('monaco-editor'),
  { color }: ReturnType<typeof useUIVariables>,
  i18n: I18n,
  getProject: () => Project
) {
  self.MonacoEnvironment = {
    getWorker() {
      return new EditorWorker()
    }
  }

  monaco.languages.register({
    id: 'spx'
  })

  monaco.editor.defineTheme(defaultThemeName, {
    base: 'vs',
    inherit: true,
    rules: [
      // TODO: review colors here
      { token: 'comment', foreground: color.hint[2], fontStyle: 'italic' },
      { token: 'string', foreground: color.green[300] },
      { token: 'operator', foreground: color.blue.main },
      { token: 'number', foreground: color.blue[600] },
      { token: 'keyword', foreground: color.red[300] },
      { token: 'typeKeywords', foreground: color.purple.main },
      { token: 'brackets', foreground: color.title }
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'scrollbar.shadow': '#FFFFFF00',
      'scrollbarSlider.background': `${color.primary.main}50`,
      'scrollbarSlider.hoverBackground': `${color.primary.main}80`,
      'scrollbarSlider.activeBackground': color.primary.main
    }
  })

  monaco.languages.setLanguageConfiguration('spx', {
    // tokenize all words as identifiers
    wordPattern: /(-?\d*\.\d\w*)|([^`~!@#%^&*()\-=+[{\]}\\|;:'",.<>/?\s]+)/g,
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/']
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
      ['"', '"'],
      ["'", "'"]
    ]
  })

  // Match token and highlight
  monaco.languages.setMonarchTokensProvider('spx', {
    defaultToken: 'invalid',
    keywords,
    typeKeywords,
    operators,
    brackets,
    symbols: /[=><!~?:&|+\-*/^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    // digits
    digits: /\d+(_+\d+)*/,
    octaldigits: /[0-7]+(_+[0-7]+)*/,
    binarydigits: /[0-1]+(_+[0-1]+)*/,
    hexdigits: /[[0-9a-fA-F]+(_+[0-9a-fA-F]+)*/,
    // The main tokenizer for our languages
    tokenizer: {
      root: [
        [
          /[a-z_$][\w$]*/,
          {
            cases: {
              '@typeKeywords': 'typeKeywords',
              '@keywords': 'keyword',
              '@default': 'identifier'
            }
          }
        ],
        [/[A-Z][\w$]*/, 'type.identifier'],

        // whitespace
        { include: '@whitespace' },

        // delimiters and operators
        [/[{}()[\]]/, '@brackets'],
        // [/[<>](?!@symbols)/, '@brackets'],
        [
          /@symbols/,
          {
            cases: {
              '@operators': 'operator',
              '@default': ''
            }
          }
        ],

        // numbers
        [/(@digits)[eE]([-+]?(@digits))?/, 'number.float'],
        [/(@digits)\.(@digits)([eE][-+]?(@digits))?/, 'number.float'],
        [/0[xX](@hexdigits)/, 'number.hex'],
        [/0[oO]?(@octaldigits)/, 'number.octal'],
        [/0[bB](@binarydigits)/, 'number.binary'],
        [/(@digits)/, 'number'],

        // delimiter: after number because of .\d floats
        [/[;,.]/, 'delimiter'],
        [/[=><!~?:&|+\-*/^%]+/, 'operator'],

        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],

        // characters
        [/'[^\\']'/, 'string'],
        [/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
        [/'/, 'string.invalid']
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\/\*/, 'comment', '@push'],
        ['\\*/', 'comment', '@pop'],
        [/[/*]/, 'comment']
      ],

      string: [
        [/[^\\"]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
      ],

      whitespace: [
        [/[ \t\r\n]+/, 'white'],
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment']
      ],

      bracketCounting: [
        [/{/, 'delimiter.bracket', '@bracketCounting'],
        [/}/, 'delimiter.bracket', '@pop']
      ]
    }
  })

  // Code hint
  monaco.languages.registerCompletionItemProvider('spx', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }
      const suggestions: languages.CompletionItem[] = getCompletionItems(
        range,
        monaco,
        i18n,
        getProject()
      )
      return { suggestions }
    }
  })

  // tempararily disable in-browser format
  // initFormat()
}

function getCompletionItems(
  range: IRange | languages.CompletionItemRanges,
  monaco: typeof import('monaco-editor'),
  i18n: I18n,
  project: Project
): languages.CompletionItem[] {
  return [
    ...keywords.map((keyword) => ({
      label: keyword,
      insertText: keyword,
      kind: monaco.languages.CompletionItemKind.Keyword,
      range
    })),
    ...typeKeywords.map((typeKeyword) => ({
      label: typeKeyword,
      insertText: typeKeyword,
      kind: monaco.languages.CompletionItemKind.TypeParameter,
      range
    })),
    ...getAllSnippets(project).map((s) => ({
      label: s.label,
      insertText: s.insertText,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      kind: getCompletionItemKind(s.type, monaco),
      detail: i18n.t(s.desc),
      range
    }))
  ]
}

function getCompletionItemKind(type: SnippetType, monaco: typeof import('monaco-editor')) {
  switch (type) {
    case SnippetType.method:
      return monaco.languages.CompletionItemKind.Function
    case SnippetType.function:
      return monaco.languages.CompletionItemKind.Function
    case SnippetType.constant:
      return monaco.languages.CompletionItemKind.Constant
    case SnippetType.keyword:
      return monaco.languages.CompletionItemKind.Snippet
    case SnippetType.variable:
      return monaco.languages.CompletionItemKind.Variable
  }
}
