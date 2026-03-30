const API_URL = import.meta.env.VITE_API_URL || '';

export interface SavedVideo {
  path: string;
  signedUrl: string;
  createdAt: string;
  size: number;
}

interface SavedVideoResponse {
  path: string;
  signed_url: string;
  created_at: string;
  size: number;
}

interface SavedVideosPayload {
  videos: SavedVideoResponse[];
}

function toSavedVideo(video: SavedVideoResponse): SavedVideo {
  return {
    path: video.path,
    signedUrl: video.signed_url,
    createdAt: video.created_at,
    size: video.size,
  };
}

async function getErrorMessage(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.detail || `Server error (${res.status})`;
}

export async function listSavedVideos(accessToken: string): Promise<SavedVideo[]> {
  const res = await fetch(`${API_URL}/api/videos`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res));
  }

  const body = await res.json() as SavedVideosPayload;
  return body.videos.map(toSavedVideo);
}

export async function uploadGeneratedVideo(accessToken: string, blob: Blob): Promise<SavedVideo> {
  const form = new FormData();
  form.append('file', blob, 'landlordflip-promo.mp4');

  const res = await fetch(`${API_URL}/api/videos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res));
  }

  return toSavedVideo(await res.json() as SavedVideoResponse);
}

export async function deleteSavedVideo(accessToken: string, path: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/videos?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res));
  }
}
