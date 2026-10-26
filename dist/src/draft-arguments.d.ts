/** @fileoverview Closed, bounded model arguments for run-local request drafts. */
export declare const DRAFT_ARGUMENT_BYTES = 2048;
/** Serialized tool arguments include JSON escaping and optional metadata. */
export declare const REQUEST_ARGUMENT_BYTES: number;
/** The raw body is also bounded; the serialized argument budget can bind first. */
export declare const REQUEST_TEXT_BYTES: number;
export declare const DRAFT_SECTIONS: readonly ['program', 'requirements', 'checks', 'interactions', 'styles', 'edits', 'updates', 'view', 'display', 'clarifications', 'transcription'];
export type DraftSection = typeof DRAFT_SECTIONS[number];
export type DraftArguments = Record<string, unknown>;
/** A recoverable draft error; it never contains submitted data or paths. */
export declare class DraftError extends Error {
    readonly code: string;
    /** Zero-based UTF-16 offset; one-based line and column. No input text. */
    readonly details?: {
        offset: number;
        line: number;
        column: number;
    } | undefined;
    constructor(code: string, message?: string, 
    /** Zero-based UTF-16 offset; one-based line and column. No input text. */
    details?: {
        offset: number;
        line: number;
        column: number;
    } | undefined);
}
/** Reject open keys, invalid revisions and large blocks before state changes. */
export declare function parseDraftArguments(tool: string, input: unknown): DraftArguments;
/** Fail closed without echoing untrusted values. */
export declare function requireDraft(ok: boolean, code: string): asserts ok;
