import * as http from 'http';
import * as https from 'https';
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
