/** The longest side of a cover kept for an audiobook, in pixels. */
export const MAX_COVER_PX = 720;

/** `width` x `height` scaled down (never up) so the longer side is at most `max`. */
export const fitWithin = (width: number, height: number, max: number) => {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

/**
 * Audio files carry covers of any size, often 3000 pixels square and several megabytes. Kept as
 * they are, every library screen and every player opening decodes one of those, which an old
 * iPad takes seconds over. A cover is shrunk once, here; anything that cannot be shrunk (no
 * canvas, a format the browser cannot decode) is returned as it was.
 */
export const shrinkCover = async (cover: Blob, max = MAX_COVER_PX): Promise<Blob> => {
  let url = '';
  try {
    url = URL.createObjectURL(cover);
    const image = new Image();
    image.src = url;
    await image.decode();
    const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight, max);
    if (width >= image.naturalWidth && height >= image.naturalHeight) return cover;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return cover;
    context.drawImage(image, 0, 0, width, height);
    const small = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    return small && small.size < cover.size ? small : cover;
  } catch {
    return cover;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
};
