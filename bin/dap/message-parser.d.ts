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
export declare class DapMessageParser {
    private buffer;
    /**
     * Add data to the internal buffer
     */
    append(data: string | Buffer): void;
    /**
     * Try to parse the next complete message from the buffer.
     * Returns null if no complete message is available.
     */
    tryParse(): ParsedMessage | null;
    /**
     * Parse all complete messages from the buffer
     */
    parseAll(): DebugProtocol.ProtocolMessage[];
    /**
     * Check if there's buffered data
     */
    hasBufferedData(): boolean;
    /**
     * Clear the buffer
     */
    clear(): void;
    /**
     * Parse header lines into a map
     */
    private parseHeaders;
}
/**
 * Encode a DAP message for sending
 */
export declare function encodeMessage(message: DebugProtocol.ProtocolMessage): string;
/**
 * Encode a DAP message to a Buffer
 */
export declare function encodeMessageToBuffer(message: DebugProtocol.ProtocolMessage): Buffer;
//# sourceMappingURL=message-parser.d.ts.map