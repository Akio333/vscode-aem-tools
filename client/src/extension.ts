import * as path from 'path';
import { workspace, ExtensionContext, commands, window } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';
import { getJcrPath } from './utils/jcrUtils';
import * as httpClient from './utils/httpClient';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  // The server is implemented in node
  const serverModule = context.asAbsolutePath(
    path.join('out', 'server', 'src', 'server.js')
  );

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] }
    }
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for htl, html, xml, clientlib asset lists and OSGi config documents
    documentSelector: [
      { scheme: 'file', language: 'htl' },
      { scheme: 'file', language: 'html' },
      { scheme: 'file', language: 'xml' },
      { scheme: 'file', language: 'aem-clientlib-txt' },
      { scheme: 'file', pattern: '**/osgiconfig/config*/**/*.cfg.json' },
      { scheme: 'file', pattern: '**/osgiconfig/config*/**/*.config' }
    ],
    synchronize: {
      // Notify the server about changes to configurations, metatypes, and content definitions
      fileEvents: [
        workspace.createFileSystemWatcher('**/OSGI-INF/metatype/**/*.xml'),
        workspace.createFileSystemWatcher('**/.content.xml')
      ]
    }
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    'aemToolsServer',
    'AEM Tools Language Server',
    serverOptions,
    clientOptions
  );

  // Handle custom request from server
  client.onRequest('aem/findClassFile', async (params: { className: string }) => {
    const normalizedName = params.className.replace(/\$/g, '.');
    const classPath = normalizedName.replace(/\./g, '/');
    const exclude = '{**/node_modules/**,**/target/**,**/.git/**}';
    const exactMatches = await workspace.findFiles(`**/src/main/java/**/${classPath}.java`, exclude, 1);
    if (exactMatches.length > 0) {
      return exactMatches[0].toString();
    }

    // A simple Use class name is legal in some project conventions. Fall back
    // to its filename without assuming a module such as `core`.
    const simpleName = normalizedName.split('.').pop();
    if (simpleName) {
      const matches = await workspace.findFiles(`**/src/main/java/**/${simpleName}.java`, exclude, 1);
      if (matches.length > 0) return matches[0].toString();
    }

    return null;
  });

  // Start the client. This will also launch the server
  client.start();

  // Register AEM sync commands
  const syncToAemCmd = commands.registerCommand('aem-tools.syncToAEM', async (uri) => {
    try {
      const targetUri = uri || window.activeTextEditor?.document.uri;
      if (!targetUri) {
        window.showErrorMessage('No file selected to sync to AEM.');
        return;
      }
      if (!getJcrPath(targetUri.fsPath)) {
        window.showErrorMessage(`File is not located under a 'jcr_root' directory: ${path.basename(targetUri.fsPath)}`);
        return;
      }

      const config = workspace.getConfiguration('aemTools');
      const host = config.get<string>('host') || 'http://localhost:4502';
      const username = config.get<string>('username') || 'admin';
      const password = config.get<string>('password') || 'admin';
      const targetUrl = new URL(host.includes('://') ? host : `http://${host}`).toString().replace(/\/$/, '');

      window.showInformationMessage(`Syncing ${path.basename(targetUri.fsPath)} to AEM...`);
      
      const aemsync = require('aemsync');
      const pushGen = aemsync.push({
        payload: [targetUri.fsPath],
        targets: [targetUrl],
        postHandler: async ({ archivePath, target, packmgrPath }: { archivePath: string; target: string; packmgrPath: string }) => {
          const response = await httpClient.postMultipartFile(
            `${target}${packmgrPath}`,
            archivePath,
            { force: 'true', install: 'true' },
            username,
            password
          );
          return {
            target,
            err: response.statusCode >= 200 && response.statusCode < 300
              ? undefined
              : new Error(`AEM package upload failed with status ${response.statusCode}.`)
          };
        }
      });

      for await (const result of pushGen) {
        if (result.response?.err) {
          window.showErrorMessage(`AEM Sync Error: ${result.response.err.message}`);
        } else {
          window.showInformationMessage(`Successfully synced ${path.basename(targetUri.fsPath)} to AEM.`);
        }
      }
    } catch (err: any) {
      window.showErrorMessage(`AEM Sync failed: ${err.message}`);
    }
  });
  
  const syncFromAemCmd = commands.registerCommand('aem-tools.syncFromAEM', async (uri) => {
    try {
      const targetUri = uri || window.activeTextEditor?.document.uri;
      if (!targetUri) {
        window.showErrorMessage('No file selected to sync from AEM.');
        return;
      }

      const jcrPath = getJcrPath(targetUri.fsPath);
      if (!jcrPath) {
        window.showErrorMessage(`File is not located under a 'jcr_root' directory: ${path.basename(targetUri.fsPath)}`);
        return;
      }

      const config = workspace.getConfiguration('aemTools');
      const host = config.get<string>('host') || 'http://localhost:4502';
      const username = config.get<string>('username') || 'admin';
      const password = config.get<string>('password') || 'admin';

      window.showInformationMessage(`Syncing ${path.basename(targetUri.fsPath)} from AEM...`);

      const targetUrl = `${host}${jcrPath}`;
      const res = await httpClient.get(targetUrl, username, password);

      if (res.statusCode === 200) {
        await workspace.fs.writeFile(targetUri, res.buffer);
        window.showInformationMessage(`Successfully synced ${path.basename(targetUri.fsPath)} from AEM.`);
      } else {
        window.showErrorMessage(`Failed to pull from AEM (status code ${res.statusCode}).`);
      }
    } catch (err: any) {
      window.showErrorMessage(`AEM Sync From failed: ${err.message}`);
    }
  });

  const testConnectionCmd = commands.registerCommand('aem-tools.testConnection', async () => {
    const config = workspace.getConfiguration('aemTools');
    const host = config.get<string>('host') || 'http://localhost:4502';
    const username = config.get<string>('username') || 'admin';
    const password = config.get<string>('password') || 'admin';

    window.showInformationMessage(`Testing connection to AEM at ${host}...`);

    try {
      // Packmgr service JSP endpoint requires authentication and responds with 200/500 depending on credentials
      const testUrl = `${host}/crx/packmgr/service.jsp?cmd=help`;
      const res = await httpClient.get(testUrl, username, password);
      
      if (res.statusCode === 200) {
        window.showInformationMessage(`Successfully connected to AEM at ${host}!`);
      } else if (res.statusCode === 401) {
        window.showErrorMessage(`Failed to connect to AEM: Unauthorized (status code ${res.statusCode}). Check username/password.`);
      } else {
        window.showErrorMessage(`Failed to connect to AEM (status code ${res.statusCode}).`);
      }
    } catch (err: any) {
      window.showErrorMessage(`Failed to connect to AEM: ${err.message}`);
    }
  });

  context.subscriptions.push(syncToAemCmd, syncFromAemCmd, testConnectionCmd);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
