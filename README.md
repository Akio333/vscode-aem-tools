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

*   **📝 HTL (Sightly) Support:** Native syntax highlighting, real-time code validation (via `@adobe/htlengine`), autocomplete for global & local variables, Sling Model getters, hover documentation, and template navigation (Go to Definition for template includes & calls).
*   **⚙️ OSGi Configuration Support:** Workspace indexing of metatypes (`OSGI-INF/metatype/*.xml`), offering autocomplete, hover descriptions, and type/required attribute validation for `.cfg.json` and `.config` files.
*   **📦 JCR XML (FileVault) Support:** Autocomplete, template snippets, and quick documentation for Touch UI Granite forms (`_cq_dialog`), Classic UI widgets (`dialog.xml` with full `xtype` list and property suggestions), `cq:Component`, and `cq:editConfig`.
*   **📁 Client Library (ClientLibs) Support:** Workspace category indexing, autocompletion of categories in HTL/XML, and asset autocomplete and Go to Definition inside `js.txt` and `css.txt` files.
*   **🔄 JCR Synchronization:** Context menu commands to sync (push/pull) files to/from local workspace and target AEM instance, and quick connection test helper.

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
