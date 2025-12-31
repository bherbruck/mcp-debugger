/**
 * DAP Message Parser
 *
 * Parses Debug Adapter Protocol messages which use the format:
 * Content-Length: <length>\r\n
 * \r\n
 * <JSON payload>
 */

import { DebugProtocol } from '@vscode/debugprotocol';

export interface ParsedMessage {
  message: DebugProtocol.ProtocolMessage;
  bytesConsumed: number;
}

export class DapMessageParser {
  private buffer: Buffer = Buffer.alloc(0);

  /**
   * Add data to the internal buffer
   */
  append(data: string | Buffer): void {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    this.buffer = Buffer.concat([this.buffer, chunk]);
  }

  /**
   * Try to parse the next complete message from the buffer.
   * Returns null if no complete message is available.
   */
  tryParse(): ParsedMessage | null {
    // Convert to string for header parsing (headers are always ASCII)
    const bufferStr = this.buffer.toString('utf8');

    // Look for the header/body separator
    const headerEnd = bufferStr.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return null;
    }

    // Parse headers
    const headerSection = bufferStr.substring(0, headerEnd);
    const headers = this.parseHeaders(headerSection);

    const contentLength = headers.get('content-length');
    if (contentLength === undefined) {
      // Invalid message - skip to next potential message
      // Calculate byte position of header end
      const headerBytes = Buffer.byteLength(headerSection, 'utf8') + 4;
      this.buffer = this.buffer.subarray(headerBytes);
      return null;
    }

    const length = parseInt(contentLength, 10);
    if (isNaN(length) || length < 0) {
      const headerBytes = Buffer.byteLength(headerSection, 'utf8') + 4;
      this.buffer = this.buffer.subarray(headerBytes);
      return null;
    }

    // Calculate byte positions (Content-Length is in bytes, not characters)
    const headerBytes = Buffer.byteLength(headerSection, 'utf8') + 4; // +4 for \r\n\r\n
    const totalBytes = headerBytes + length;

    if (this.buffer.length < totalBytes) {
      // Not enough data yet
      return null;
    }

    // Extract the JSON body as bytes, then convert to string
    const jsonBody = this.buffer.subarray(headerBytes, totalBytes).toString('utf8');

    // Remove the processed message from buffer
    this.buffer = this.buffer.subarray(totalBytes);

    try {
      const message = JSON.parse(jsonBody) as DebugProtocol.ProtocolMessage;
      return {
        message,
        bytesConsumed: totalBytes
      };
    } catch (error) {
      // Invalid JSON - message is malformed
      throw new Error(`Failed to parse DAP message JSON: ${error}`);
    }
  }

  /**
   * Parse all complete messages from the buffer
   */
  parseAll(): DebugProtocol.ProtocolMessage[] {
    const messages: DebugProtocol.ProtocolMessage[] = [];
    let parsed: ParsedMessage | null;

    while ((parsed = this.tryParse()) !== null) {
      messages.push(parsed.message);
    }

    return messages;
  }

  /**
   * Check if there's buffered data
   */
  hasBufferedData(): boolean {
    return this.buffer.length > 0;
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = Buffer.alloc(0);
  }

  /**
   * Parse header lines into a map
   */
  private parseHeaders(headerSection: string): Map<string, string> {
    const headers = new Map<string, string>();
    const lines = headerSection.split('\r\n');

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex !== -1) {
        const key = line.substring(0, colonIndex).trim().toLowerCase();
        const value = line.substring(colonIndex + 1).trim();
        headers.set(key, value);
      }
    }

    return headers;
  }
}

/**
 * Encode a DAP message for sending
 */
export function encodeMessage(message: DebugProtocol.ProtocolMessage): string {
  const json = JSON.stringify(message);
  const contentLength = Buffer.byteLength(json, 'utf8');
  return `Content-Length: ${contentLength}\r\n\r\n${json}`;
}

/**
 * Encode a DAP message to a Buffer
 */
export function encodeMessageToBuffer(message: DebugProtocol.ProtocolMessage): Buffer {
  return Buffer.from(encodeMessage(message), 'utf8');
}
