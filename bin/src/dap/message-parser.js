/**
 * DAP Message Parser
 *
 * Parses Debug Adapter Protocol messages which use the format:
 * Content-Length: <length>\r\n
 * \r\n
 * <JSON payload>
 */
export class DapMessageParser {
    buffer = '';
    /**
     * Add data to the internal buffer
     */
    append(data) {
        if (Buffer.isBuffer(data)) {
            this.buffer += data.toString('utf8');
        }
        else {
            this.buffer += data;
        }
    }
    /**
     * Try to parse the next complete message from the buffer.
     * Returns null if no complete message is available.
     */
    tryParse() {
        // Look for the header/body separator
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
            return null;
        }
        // Parse headers
        const headerSection = this.buffer.substring(0, headerEnd);
        const headers = this.parseHeaders(headerSection);
        const contentLength = headers.get('content-length');
        if (contentLength === undefined) {
            // Invalid message - skip to next potential message
            this.buffer = this.buffer.substring(headerEnd + 4);
            return null;
        }
        const length = parseInt(contentLength, 10);
        if (isNaN(length) || length < 0) {
            this.buffer = this.buffer.substring(headerEnd + 4);
            return null;
        }
        // Check if we have the complete body
        const bodyStart = headerEnd + 4;
        const bodyEnd = bodyStart + length;
        if (this.buffer.length < bodyEnd) {
            // Not enough data yet
            return null;
        }
        // Extract and parse the JSON body
        const jsonBody = this.buffer.substring(bodyStart, bodyEnd);
        // Remove the processed message from buffer
        this.buffer = this.buffer.substring(bodyEnd);
        try {
            const message = JSON.parse(jsonBody);
            return {
                message,
                bytesConsumed: bodyEnd
            };
        }
        catch (error) {
            // Invalid JSON - message is malformed
            throw new Error(`Failed to parse DAP message JSON: ${error}`);
        }
    }
    /**
     * Parse all complete messages from the buffer
     */
    parseAll() {
        const messages = [];
        let parsed;
        while ((parsed = this.tryParse()) !== null) {
            messages.push(parsed.message);
        }
        return messages;
    }
    /**
     * Check if there's buffered data
     */
    hasBufferedData() {
        return this.buffer.length > 0;
    }
    /**
     * Clear the buffer
     */
    clear() {
        this.buffer = '';
    }
    /**
     * Parse header lines into a map
     */
    parseHeaders(headerSection) {
        const headers = new Map();
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
export function encodeMessage(message) {
    const json = JSON.stringify(message);
    const contentLength = Buffer.byteLength(json, 'utf8');
    return `Content-Length: ${contentLength}\r\n\r\n${json}`;
}
/**
 * Encode a DAP message to a Buffer
 */
export function encodeMessageToBuffer(message) {
    return Buffer.from(encodeMessage(message), 'utf8');
}
