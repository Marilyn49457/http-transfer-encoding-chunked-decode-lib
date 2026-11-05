# http-transfer-encoding-chunked-decode-lib

Decodes HTTP chunked transfer-encoded body data into the underlying content bytes.

```js
import { decodeChunked, ChunkedDecodeError } from './src/index.js';

const body = new TextEncoder().encode('5\r\nhello\r\n0\r\n\r\n');
try {
  const content = decodeChunked(body);
  console.log(new TextDecoder().decode(content)); // "hello"
} catch (err) {
  if (err instanceof ChunkedDecodeError) {
    console.error('malformed chunked body:', err.message);
  }
}
```

## Why this exists

HTTP/1.1 chunked transfer encoding is a framing layer, and a framing layer that
accepts malformed input silently is worse than one that fails loudly: a length
bug can be reinterpreted as content and leak into the application. This library
therefore decodes strictly. It rejects a missing CRLF, a non-hex size, a
truncated chunk, and a missing terminator, each with a `ChunkedDecodeError`.

The trade-off is that it does not attempt to be lenient about a missing final
CRLF or a stray byte after the terminator. If you need to salvage a broken
stream, that is a separate concern and should be explicit at the call site.

## Awkward edge

Chunk extensions are parsed only far enough to be skipped: everything after the
first `;` on a chunk-size line is ignored, as RFC 7230 requires. Trailer fields
are also skipped, so the returned bytes never include trailer content. The
returned value is always a fresh `Uint8Array`; if you need a `Buffer`, wrap it
with `Buffer.from(result)`.
