// Upload image/video to litterbox.catbox.moe (free, no API key, auto-expires)
// Returns the public URL of the uploaded file

const LITTERBOX_API = 'https://litterbox.catbox.moe/resources/internals/api.php';
const EXPIRY = '1h';

export async function uploadToLitterbox(base64Data: string, filename: string = 'image.png'): Promise<string | null> {
  try {
    // Extract raw base64 and detect mime type
    const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    const mimeType = match ? match[1] : 'image/png';
    const raw = match ? match[2] : base64Data;

    // Convert base64 to Buffer (Node.js)
    const buffer = Buffer.from(raw, 'base64');

    // Build FormData
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('time', EXPIRY);
    form.append('fileToUpload', new Blob([buffer], { type: mimeType }), filename);

    const res = await fetch(LITTERBOX_API, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return null;
    const url = (await res.text()).trim();
    return url.startsWith('https://') ? url : null;
  } catch {
    return null;
  }
}
