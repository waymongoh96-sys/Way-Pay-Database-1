
/**
 * Service to handle Google Drive interactions.
 */

const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient: any;
let accessToken: string | null = null;

export const initDriveApi = (clientId: string) => {
  return new Promise<void>((resolve) => {
    // Load the Google Identity Services library
    // @ts-ignore
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response: any) => {
        if (response.error !== undefined) {
          throw response;
        }
        accessToken = response.access_token;
        resolve();
      },
    });
  });
};

export const authenticateDrive = () => {
  return new Promise<string>((resolve, reject) => {
    if (!tokenClient) {
      reject('Drive API not initialized. Please configure Client ID in Settings.');
      return;
    }
    tokenClient.requestAccessToken({ prompt: 'consent' });
    // The resolve is handled in the initDriveApi callback
    // We can resolve immediately here if we want to wait for the callback in UI, 
    // but usually the callback sets the token.
    resolve('Auth initiated'); 
  });
};

const fetchDrive = async (url: string, options: RequestInit = {}) => {
  if (!accessToken) throw new Error('Not authenticated with Google Drive');
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Drive API Error');
  }
  return response.json();
};

export const findOrCreateFolder = async (name: string, parentId?: string) => {
  let query = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const results = await fetchDrive(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name)`);
  
  if (results.files && results.files.length > 0) {
    return results.files[0].id;
  }

  // Create folder if not found
  const folderMetadata = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : undefined,
  };

  const newFolder = await fetchDrive('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    body: JSON.stringify(folderMetadata),
  });

  return newFolder.id;
};

export const uploadToDrive = async (file: File, employeeName: string) => {
  if (!accessToken) throw new Error('Please connect to Google Drive first');

  // 1. Get or create "Way-Pay HR system" root folder
  const rootFolderId = await findOrCreateFolder('Way-Pay HR system');

  // 2. Get or create employee subfolder
  const employeeFolderId = await findOrCreateFolder(employeeName, rootFolderId);

  // 3. Upload file to employee folder using multipart upload
  const metadata = {
    name: file.name,
    parents: [employeeFolderId],
  };

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', file);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!response.ok) throw new Error('Failed to upload file to Drive');
  
  return response.json();
};

export const isDriveConnected = () => !!accessToken;
