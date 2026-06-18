/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { storage } from '../firebase';
import { ref, uploadBytes } from 'firebase/storage';

// IndexedDB Helper Functions
export async function getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('HarryFashionFS', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config');
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction('config', 'readonly');
          const store = tx.objectStore('config');
          const req = store.get('baseDirectoryHandle');
          req.onsuccess = () => {
            resolve(req.result || null);
          };
          req.onerror = () => {
            resolve(null);
          };
        } catch {
          resolve(null);
        }
      };
      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

export async function storeDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open('HarryFashionFS', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config');
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction('config', 'readwrite');
          const store = tx.objectStore('config');
          store.put(handle, 'baseDirectoryHandle');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        } catch (err) {
          reject(err);
        }
      };
      request.onerror = () => {
        reject(request.error);
      };
    } catch (err) {
      reject(err);
    }
  });
}

export async function clearDirectoryHandle(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('HarryFashionFS', 1);
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction('config', 'readwrite');
          const store = tx.objectStore('config');
          store.delete('baseDirectoryHandle');
          tx.oncomplete = () => resolve();
        } catch {
          resolve();
        }
      };
      request.onerror = () => {
        resolve();
      };
    } catch {
      resolve();
    }
  });
}

// Request and verify directory handle readwrite permissions
export async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const opts = { mode: 'readwrite' as any };
    if ((await (handle as any).queryPermission(opts)) === 'granted') {
      return true;
    }
    if ((await (handle as any).requestPermission(opts)) === 'granted') {
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Failed to query or request permission:', err);
    return false;
  }
}

// Prompt user to choose base directory
export async function promptForBaseDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('Directory Picker API is not supported in this browser.');
  }
  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'downloads'
    });
    await storeDirectoryHandle(handle);
    return handle;
  } catch (err: any) {
    console.error('User cancelled directory selection or it failed:', err);
    // If it is an AbortError, the user explicitly closed/cancelled the picker. Return null.
    if (err && err.name === 'AbortError') {
      return null;
    }
    // Otherwise, throw the error with appropriate context
    throw err;
  }
}

// Date helpers for smart folders
export function getFolderChallanDateText(dateStr: string): string {
  if (!dateStr) return 'Unknown-Date';
  // format YYYY-MM-DD to DD-MMM-YYYY (e.g. 12-Jun-2026)
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parts[0];
    const months = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May']; // Correct order or deterministic mapping
    const monthsArray = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIdx = parseInt(parts[1], 10) - 1;
    const month = monthsArray[monthIdx] || 'Jan';
    const day = parts[2];
    return `${day}-${month}-${year}`;
  }
  return dateStr;
}

export function getFolderInvoiceDateText(month: number, year: number): string {
  const monthsArray = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthsArray[month - 1] || 'Jan';
  return `${monthName}-${year}`;
}

// Upload file to Firebase Storage
export async function uploadToCloudStorage(path: string, blob: Blob): Promise<string> {
  try {
    const storageRef = ref(storage, path);
    const result = await uploadBytes(storageRef, blob);
    console.log(`Cloud backup upload complete: ${result.metadata.fullPath}`);
    return result.metadata.fullPath;
  } catch (err) {
    console.warn('Firebase storage cloud backup failed:', err);
    return '';
  }
}

// Primary Smart Saver / Downloader
export async function smartSavePDF({
  blob,
  category,
  dateText,
  masterName,
  fileNo,
  isVoided = false
}: {
  blob: Blob;
  category: 'challan' | 'invoice';
  dateText: string;
  masterName: string;
  fileNo: string;
  isVoided?: boolean;
}): Promise<{ savedLocal: boolean; savedCloud: boolean; pathText: string }> {
  const masterClean = masterName.replace(/[^a-zA-Z0-9_\s-]/g, '').trim().replace(/\s+/g, '_');
  const fileNoClean = fileNo.replace(/\//g, '-');
  
  // 1. Determine local file naming and folders
  const localFileName = category === 'challan' ? `Challan-${fileNoClean}.pdf` : `Invoice-${fileNoClean}.pdf`;
  const relativeFolders = category === 'challan' 
    ? ['Harry Fashion', 'Challans', dateText, masterClean]
    : ['Harry Fashion', 'Invoices', dateText, masterClean];

  // 2. Determine cloud storage path
  let cloudPath = '';
  if (category === 'challan') {
    if (isVoided) {
      cloudPath = `challans/VOIDED/${dateText}/${masterClean}/${localFileName}`;
    } else {
      cloudPath = `challans/${dateText}/${masterClean}/${localFileName}`;
    }
  } else {
    cloudPath = `invoices/${dateText}/${masterClean}/${localFileName}`;
  }

  // 3. Perform Cloud Backup asynchronously in the background so it doesn't block local saving
  let savedCloud = false;
  uploadToCloudStorage(cloudPath, blob)
    .then((resultPath) => {
      if (resultPath) {
        console.log(`Cloud backup upload complete in background: ${resultPath}`);
      }
    })
    .catch((cloudErr) => {
      console.warn('Firebase storage cloud backup failed:', cloudErr);
    });

  // 4. Try smart saving via File System Access API
  let savedLocal = false;
  let pathText = '';

  const isFSAAPISupported = 'showDirectoryPicker' in window;
  if (isFSAAPISupported) {
    try {
      let baseDirHandle = await getStoredDirectoryHandle();
      
      // ONLY attempt directory operations if the folder has already been linked and saved via settings.
      // Do NOT automatically show directory picker to unconfigured/sandboxed iframe users.
      if (baseDirHandle) {
        const hasPerms = await verifyPermission(baseDirHandle);
        if (hasPerms) {
          // Traverse and build subdirectories
          let currentDir = baseDirHandle;
          for (const folder of relativeFolders) {
            currentDir = await currentDir.getDirectoryHandle(folder, { create: true });
          }
          
          // Write the file
          const fileHandle = await currentDir.getFileHandle(localFileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          
          savedLocal = true;
          pathText = relativeFolders.join('/') + '/' + localFileName;
          console.log(`Successfully saved using File System Access API: ${pathText}`);
        }
      }
    } catch (fsaaErr) {
      console.warn('Smart Folder directory save failed, resorting to fallback download mechanism:', fsaaErr);
    }
  }

  // 5. Fallback download if File System Access was bypassed, failed, or unsupported
  if (!savedLocal) {
    try {
      const fallbackName = `Harry-Fashion_${category === 'challan' ? 'Challans' : 'Invoices'}_${dateText}_${masterClean}_${localFileName}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fallbackName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      savedLocal = true;
      pathText = fallbackName;
      console.log(`Saved via standard fallback download: ${fallbackName}`);
    } catch (fallbackErr) {
      console.error('Absolute download failure:', fallbackErr);
    }
  }

  return {
    savedLocal,
    savedCloud,
    pathText
  };
}
