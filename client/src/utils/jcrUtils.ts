import * as path from 'path';

/**
 * Extracts the relative JCR path from a file system path by finding "jcr_root".
 * E.g., "/Workspace/project/ui.apps/src/main/content/jcr_root/apps/components/byline/byline.html"
 * becomes "/apps/components/byline/byline.html".
 * 
 * @param filePath The absolute or relative file system path.
 * @returns The JCR path starting with "/" or null if "jcr_root" is not in the path.
 */
export function getJcrPath(filePath: string): string | null {
  // Normalize path separators to forward slash
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Search for '/jcr_root/' or 'jcr_root/' as a folder component
  const marker = '/jcr_root/';
  const index = normalizedPath.lastIndexOf(marker);
  
  if (index !== -1) {
    return normalizedPath.substring(index + marker.length - 1);
  }
  
  // Also handle if the path ends with /jcr_root or jcr_root
  if (normalizedPath.endsWith('/jcr_root')) {
    return '/';
  }
  
  return null;
}
