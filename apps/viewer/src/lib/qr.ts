import qrcode from 'qrcode-generator';

// Messages are written by the author in any language, so encode them as UTF-8 (the library's default is Latin-1).
qrcode.stringToBytes = (text: string) => Array.from(new TextEncoder().encode(text));

/** The longest message a QR part accepts, in characters. */
export const MAX_QR_MESSAGE = 300;

/**
 * The dark squares of a real, scannable QR code for a message, row by row, or null if there is nothing usable to encode.
 * Medium error correction, so a code with a little wear still reads. The smallest size that fits is used.
 */
export function qrMatrix(message: string): boolean[][] | null {
  const text = message.trim();
  if (text === '' || text.length > MAX_QR_MESSAGE) return null;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
  } catch {
    return null; // too much data for any size
  }
}
