# AEM Tools for VS Code

AEM Tools is a lightweight, feature-rich Visual Studio Code extension designed to streamline Adobe Experience Manager (AEM) development. It provides native JCR synchronization, real-time HTL (Sightly) code validation, and context-aware autocompletion helpers.

*This extension is inspired by the original [**AEM Tools**](https://github.com/aemtools/aemtools) plugin for IntelliJ IDEA.*

---

## Installation

You can install AEM Tools from the official marketplace registries:

[![Visual Studio Marketplace](https://img.shields.io/badge/VS%20Marketplace-Download-007acc?style=for-the-badge&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=Akio333.vscode-aem-tools)
[![Open VSX](https://img.shields.io/open-vsx/v/Akio333/vscode-aem-tools?label=Open%20VSX&style=for-the-badge&logo=open-vsx&color=f05023)](https://open-vsx.org/extension/Akio333/vscode-aem-tools)

### Latest Release VSIX
Alternatively, download the latest compiled `.vsix` file directly from the [GitHub Releases Page](https://github.com/akio333/vscode-aem-tools/releases/latest) and install it manually in VS Code via **Extensions: Install from VSIX...**.

### Build from Source
If you prefer to build the extension manually from source, follow these steps:

1. Clone this repository:
   ```bash
   git clone https://github.com/akio333/vscode-aem-tools.git
   cd vscode-aem-tools
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Compile and bundle the project:
   ```bash
   npm run compile
   ```
4. Package the extension into a `.vsix` file:
   ```bash
   npm run package
   ```
5. Install the generated `vscode-aem-tools-<version>.vsix` file in VS Code.

---

## Features

### 1. JCR Synchronization (Push & Pull)
*   **Sync to Server**: Instantly push the active file or selected files from your local workspace to the running AEM instance.
*   **Sync from Server**: Pull the latest code/properties of a file directly from the AEM JCR repository and update your local file.
*   **Test Connection**: Quickly verify connection status and admin credentials to the configured AEM host.

### 2. Real-Time HTL (Sightly) Code Validation
*   Performs syntax validation and full compile-time checks on HTL templates using `@adobe/htlengine`.
*   Unclosed tag structures, mismatched brackets, and invalid HTL expressions are reported in the VS Code **Problems** panel.

### 3. Advanced Autocompletion
*   **Dialog Properties**: Automatically parses Touch UI (`_cq_dialog/.content.xml`) and Classic UI (`dialog.xml`) definitions within the component's directory to suggest dialog fields when you type `properties.`, `pageProperties.`, or `inheritedPageProperties.`.
*   **Java Sling Model Fields**: Scans HTL files for `data-sly-use.modelName="className"` statements, locates the corresponding Java file in the workspace, parses its public getter/boolean methods (e.g. `getName()`, `isEmpty()`), and autocompletes them when typing `${modelName.}`.
*   **HTL Context Options**: Provides automatic suggestions for standard HTL context values (like `'html'`, `'text'`, `'uri'`, `'unsafe'`) when typing `@ context=`.
*   **HTL Block Statements**: Suggests default block statements (e.g. `data-sly-use`, `data-sly-test`, `data-sly-list`) inside HTML tags.

---

## Configuration

AEM Tools can be configured in your VS Code workspace settings:

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `aemTools.host` | `string` | `http://localhost:4502` | The URL of the target AEM instance. |
| `aemTools.username` | `string` | `admin` | AEM Username. |
| `aemTools.password` | `string` | `admin` | AEM Password. |

---

## Commands

Access the following commands via the context menu (right-click on a file) or the VS Code Command Palette (`Cmd+Shift+P` on macOS / `Ctrl+Shift+P` on Windows):

*   **AEM: Sync to Server** (`aem-tools.syncToAEM`): Pushes the selected file/folder under `jcr_root` to AEM.
*   **AEM: Sync from Server** (`aem-tools.syncFromAEM`): Pulls the selected file's content from AEM JCR to the workspace.
*   **AEM: Test Connection** (`aem-tools.testConnection`): Tests connectivity and credentials with the AEM instance.

---

## License

This project is licensed under the GPLv3 License.
