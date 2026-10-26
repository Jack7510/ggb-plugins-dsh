export interface DraftSnapshot {
    revision: number;
    domainRequestDigest: string;
    request: Record<string, unknown>;
}
/** One authenticated turn owns this state. No filesystem or execution access. */
export declare class RequestDraft {
    private readonly prompt;
    private revision;
    private document;
    private documentBytes;
    private locale;
    private title;
    private sections;
    private checked;
    constructor(prompt: string);
    /** Atomic writes invalidate checks; the first success fixes the input mode. */
    operate(input: unknown): Record<string, unknown>;
    /** Assemble the exact complete domain request, preserving all check values. */
    forCheck(input: unknown): DraftSnapshot;
    /** Called only after the existing plugin checker has accepted the snapshot. */
    acceptCheck(snapshot: DraftSnapshot): Record<string, unknown>;
    /** Never resolve an old, foreign or modified request to a build. */
    forBuild(input: unknown): DraftSnapshot;
    private match;
    private summary;
    private currentRequest;
    private assembleText;
    private read;
    private assemble;
}
