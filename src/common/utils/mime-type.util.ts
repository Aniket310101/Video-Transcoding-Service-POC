const mimeTypeMap: { [key: string]: string } = {
  // Video formats
  'video/mp4': '.mp4',
  'video/x-mp4': '.mp4',
  'video/mpeg': '.mpeg',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/x-matroska': '.mkv',
  'video/webm': '.webm',
  'video/x-flv': '.flv',
  'video/3gpp': '.3gp',
  'video/x-ms-wmv': '.wmv',
  'video/ogg': '.ogv',
  // HLS and DASH formats
  'application/x-mpegURL': '.m3u8',
  'application/vnd.apple.mpegurl': '.m3u8',
  'application/dash+xml': '.mpd',
  'video/mp2t': '.ts',
};

export function getFileExtension(mimeType: string): string {
  return mimeTypeMap[mimeType] || '.bin';
}
