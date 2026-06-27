// Client-side image downscaling for order photos. Phone cameras produce 3–12 MB
// images; we shrink them to a sensible web size BEFORE upload so the bytes over
// the wire stay small (critical for the main user's slow/filtered connection)
// and Storage costs stay low. A single operator doesn't need print-resolution
// originals, so a long-edge cap + JPEG re-encode is plenty.
//
// Best-effort: if anything in the canvas path is unavailable (e.g. the jsdom
// test runtime has no createImageBitmap/canvas) or fails, we return the ORIGINAL
// file untouched rather than block the upload — a larger upload beats no upload.

const MAX_EDGE = 1600 // longest side, in CSS pixels
const JPEG_QUALITY = 0.8

// Scale (w, h) down so the longest edge is at most MAX_EDGE, preserving aspect
// ratio. Never upscales — a small image is returned at its own size.
const fit = (w: number, h: number): { w: number; h: number } => {
  const longest = Math.max(w, h)
  if (longest <= MAX_EDGE) return { w, h }
  const scale = MAX_EDGE / longest
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}

export async function compressImage(file: File): Promise<Blob> {
  // Guard the whole canvas pipeline; any missing API → return the original.
  if (
    typeof createImageBitmap !== 'function' ||
    typeof document === 'undefined' ||
    typeof document.createElement !== 'function'
  ) {
    return file
  }
  try {
    const bitmap = await createImageBitmap(file)
    const { w, h } = fit(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    // Fall back if the re-encode failed or somehow grew the file (e.g. a tiny
    // already-optimized JPEG) — never ship MORE bytes than we started with.
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}
