import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import { URL } from 'url';

export interface HttpResponse {
  statusCode: number;
  body: string;
  buffer: Buffer;
}

/**
 * Performs an HTTP/HTTPS GET request with optional Basic Authentication.
 */
export function get(urlStr: string, username?: string, password?: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(urlStr);
      const isHttps = parsedUrl.protocol === 'https:';
      const requestModule = isHttps ? https : http;

      const headers: Record<string, string> = {
        'Accept': '*/*'
      };

      if (username && password) {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }

      const options: http.RequestOptions = {
        method: 'GET',
        headers: headers,
        timeout: 10000 // 10s timeout
      };

      const req = requestModule.request(parsedUrl, options, (res) => {
        const chunks: Buffer[] = [];
        
        res.on('data', (chunk) => {
          chunks.push(Buffer.from(chunk));
        });

        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const body = buffer.toString('utf8');
          resolve({
            statusCode: res.statusCode || 0,
            body,
            buffer
          });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Uploads a file in a multipart request with credentials kept in the
 * Authorization header. AEM Sync accepts content packages through this form.
 */
export async function postMultipartFile(
  urlStr: string,
  filePath: string,
  fields: Record<string, string>,
  username?: string,
  password?: string
): Promise<HttpResponse> {
  const parsedUrl = new URL(urlStr);
  const requestModule = parsedUrl.protocol === 'https:' ? https : http;
  const boundary = `----aemTools${Date.now().toString(16)}`;
  const fileName = filePath.split(/[\\/]/).pop() || 'content.zip';
  const fieldBody = Object.entries(fields)
    .map(([name, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)
    .join('');
  const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/zip\r\n\r\n`;
  const closingBoundary = `\r\n--${boundary}--\r\n`;
  const stat = await fs.promises.stat(filePath);
  const headers: Record<string, string> = {
    'Accept': '*/*',
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': String(Buffer.byteLength(fieldBody) + Buffer.byteLength(fileHeader) + stat.size + Buffer.byteLength(closingBoundary))
  };

  if (username && password) {
    headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  return new Promise((resolve, reject) => {
    const req = requestModule.request(parsedUrl, { method: 'POST', headers, timeout: 30000 }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({ statusCode: res.statusCode || 0, body: buffer.toString('utf8'), buffer });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.write(fieldBody);
    req.write(fileHeader);
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('end', () => req.end(closingBoundary));
    stream.pipe(req, { end: false });
  });
}
