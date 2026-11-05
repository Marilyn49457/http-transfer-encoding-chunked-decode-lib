// Decodes HTTP chunked transfer-encoded body data into the underlying content bytes.
//
// The implementation is deliberately strict: it follows RFC 7230 section 4.1 and
// rejects malformed input with a descriptive error rather than guessing. This is
// the right trade-off for a transfer-decoding primitive because silently accepting
// a malformed stream would let a framing bug reach the application layer, where it
// could be interpreted as content.

/**
 * Error thrown when the chunked transfer encoding is malformed.
 *
 * A distinct class is used so callers can distinguish framing failures from
 * ordinary I/O or content errors without inspecting message strings.
 */
export class ChunkedDecodeError extends Error {
  /**
   * @param {string} message - Human-readable description of the framing problem.
   */
  constructor(message) {
    super(message);
    this.name = 'ChunkedDecodeError';
  }
}

const CR = 0x0d;
const LF = 0x0a;

/**
 * Decode a chunked transfer-encoded body.
 *
 * @param {Uint8Array|Buffer} input - The raw bytes of the chunked body, including
 *   the terminating zero-size chunk and any trailer section.
 * @returns {Uint8Array} The decoded content bytes.
 * @throws {ChunkedDecodeError} If the input is not valid chunked encoding.
 */
export function decodeChunked(input) {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError('input must be a Uint8Array or Buffer');
  }

  const view = input;
  let pos = 0;
  const chunks = [];
  let totalLength = 0;

  while (true) {
    const lineEnd = indexOfCRLF(view, pos);
    if (lineEnd === -1) {
      throw new ChunkedDecodeError('missing CRLF after chunk size');
    }
    const sizeLine = latin1Slice(view, pos, lineEnd);
    pos = lineEnd + 2;

    // A chunk-size line may carry chunk extensions after a semicolon. We ignore
    // them, matching the RFC's requirement that recipients ignore unrecognised
    // extensions rather than fail the transfer.
    const semi = sizeLine.indexOf(';');
    const sizeHex = (semi === -1 ? sizeLine : sizeLine.slice(0, semi)).trim();

    if (sizeHex.length === 0) {
      throw new ChunkedDecodeError('missing chunk size');
    }
    if (!/^[0-9a-fA-F]+$/.test(sizeHex)) {
      throw new ChunkedDecodeError(`invalid chunk size: ${JSON.stringify(sizeHex)}`);
    }

    // Number.parseInt is exact for hex values up to 2^53-1, which is far beyond
    // any realistic chunk size; we reject anything larger rather than lose bits.
    const size = Number.parseInt(sizeHex, 16);
    if (!Number.isSafeInteger(size)) {
      throw new ChunkedDecodeError(`chunk size too large: ${sizeHex}`);
    }

    if (size === 0) {
      // The last chunk is followed by a trailer section terminated by an empty
      // line. We accept an empty trailer and skip any trailer fields, since the
      // decoder's contract is to return content bytes only.
      pos = skipTrailers(view, pos);
      return concatChunks(chunks, totalLength);
    }

    if (pos + size > view.length) {
      throw new ChunkedDecodeError('chunk data truncated');
    }
    const chunk = view.subarray(pos, pos + size);
    chunks.push(chunk);
    totalLength += chunk.length;
    pos += size;

    if (pos + 2 > view.length || view[pos] !== CR || view[pos + 1] !== LF) {
      throw new ChunkedDecodeError('missing CRLF after chunk data');
    }
    pos += 2;
  }
}

/**
 * Find the next CRLF starting at `start`.
 *
 * @param {Uint8Array} view
 * @param {number} start
 * @returns {number} Index of the CR, or -1 if not found.
 */
function indexOfCRLF(view, start) {
  for (let i = start; i + 1 < view.length; i++) {
    if (view[i] === CR && view[i + 1] === LF) {
      return i;
    }
  }
  return -1;
}

/**
 * Decode a byte range as Latin-1. Chunk-size lines are ASCII by spec, so Latin-1
 * is sufficient and avoids any UTF-8 decoding surprises on malformed input.
 *
 * @param {Uint8Array} view
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
function latin1Slice(view, start, end) {
  let out = '';
  for (let i = start; i < end; i++) {
    out += String.fromCharCode(view[i]);
  }
  return out;
}

/**
 * Consume the trailer section that follows the terminating chunk. Each trailer
 * field is a header line ending in CRLF; the section ends with an empty line.
 *
 * @param {Uint8Array} view
 * @param {number} pos
 * @returns {number} Position just past the terminating empty line.
 * @throws {ChunkedDecodeError}
 */
function skipTrailers(view, pos) {
  while (true) {
    const lineEnd = indexOfCRLF(view, pos);
    if (lineEnd === -1) {
      throw new ChunkedDecodeError('missing CRLF after trailer');
    }
    if (lineEnd === pos) {
      return pos + 2;
    }
    pos = lineEnd + 2;
  }
}

/**
 * Concatenate decoded chunk views into a single contiguous Uint8Array.
 *
 * @param {Uint8Array[]} chunks
 * @param {number} totalLength
 * @returns {Uint8Array}
 */
function concatChunks(chunks, totalLength) {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
