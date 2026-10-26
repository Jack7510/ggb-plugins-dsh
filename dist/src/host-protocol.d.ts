export type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
export declare const HOST_PROTOCOL_VERSION = 3;
export declare const RECEIPT_SCHEMA_VERSION = 2;
export declare const SUPPORTED_DSH_VERSIONS: readonly ['0.2.1-rc.2'];
export declare const REFERENCE_TOPICS: readonly ['request', 'program', 'verification', 'interactions', 'patterns', 'naming'];
/** Fixed child sections; IDs are data, never paths or search expressions. */
export declare const REFERENCE_SECTIONS: {
    readonly 'program.outputs': {
        readonly topic: 'program';
        readonly heading: '多输出与列表';
    };
    readonly 'program.text': {
        readonly topic: 'program';
        readonly heading: '文本与区域点';
    };
    readonly 'program.cas': {
        readonly topic: 'program';
        readonly heading: 'CAS 结果与依赖';
    };
    readonly 'verification.expression': {
        readonly topic: 'verification';
        readonly heading: '表达式观测';
    };
    readonly 'verification.predicates': {
        readonly topic: 'verification';
        readonly heading: '谓词与依赖';
    };
    readonly 'verification.engine': {
        readonly topic: 'verification';
        readonly heading: '表达式引擎语义';
    };
    readonly 'interactions.styles': {
        readonly topic: 'interactions';
        readonly heading: '样式与视图';
    };
    readonly 'interactions.parameters': {
        readonly topic: 'interactions';
        readonly heading: '参数采样';
    };
    readonly 'interactions.drag': {
        readonly topic: 'interactions';
        readonly heading: '鼠标拖动';
    };
    readonly 'patterns.regular-polygon': {
        readonly topic: 'patterns';
        readonly heading: '可变边数的正多边形';
    };
    readonly 'patterns.bounded-outline': {
        readonly topic: 'patterns';
        readonly heading: '有界可变数量的轮廓';
    };
    readonly 'patterns.dependencies': {
        readonly topic: 'patterns';
        readonly heading: '派生关系的完整依赖';
    };
};
export declare const REFERENCE_IDS: readonly string[];
/** A complete chapter covers its children; one child covers only itself. */
export declare function referenceCoverage(id: string): string[];
/** Topics whose complete text is injected before the first Worker model step. */
export declare const PRELOADED_REFERENCE_TOPICS: readonly ['request'];
export declare const TOOL_NAMES: readonly ['ggb_inspect', 'ggb_request', 'ggb_check', 'ggb_build'];
export type ToolName = typeof TOOL_NAMES[number];
export declare const LIMITS: Readonly<{
    requestBytes: number;
    frameBytes: number;
    referenceBytes: number;
    stdoutBytes: number;
    stderrBytes: number;
    reportBytes: number;
    manifestBytes: number;
    ggbBytes: number;
    previewBytes: number;
}>;
export interface ToolRequest {
    protocolVersion: 3;
    requestId: string;
    toolCallId: string;
    runId: string;
    turnId: string;
    epoch: number;
    toolName: ToolName;
    arguments: Json;
    argumentsDigest: string;
    issuedAt: string;
    nonce: string;
    authentication: string;
}
export interface ToolResponse {
    protocolVersion: 3;
    requestId: string;
    type: 'tool.result' | 'tool.error';
    result: Json;
    error: string | null;
}
export interface RuntimeIdentity {
    geogebraVersion: string;
    geogebraSha256: string;
    playwrightVersion: string;
}
export interface ExecutionContext {
    protocolVersion: 2;
    runId: string;
    turnId: string;
    epoch: number;
    requestId: string;
    toolCallId: string;
    buildId: string;
    domainRequestDigest: string;
    baseRef: string | null;
    baseSha256: string | null;
    outputRoot: string;
    deadline: string;
}
export interface Artifact {
    kind: 'result_ggb' | 'verification' | 'manifest' | 'preview';
    ref: string;
    bytes: number;
    sha256: string;
    contentType: string;
}
export interface BuildReceipt {
    receiptSchemaVersion: 2;
    runId: string;
    turnId: string;
    epoch: number;
    requestId: string;
    toolCallId: string;
    buildId: string;
    domainRequestDigest: string;
    baseSha256: string | null;
    pluginName: string;
    pluginVersion: string;
    packageIntegrity: string;
    runtimeIdentity: RuntimeIdentity;
    status: 'succeeded' | 'rejected';
    issues: {
        code: string;
        message: string;
        path?: string;
    }[];
    verification: Json;
    artifacts: Artifact[];
}
/** Reject malformed or unsupported messages without coercion or downgrade. */
export declare class ProtocolError extends Error {
    readonly field: string;
    constructor(field: string);
}
/** Canonical JSON used for request digests and authentication. */
export declare function canonicalJson(value: unknown): string;
/** SHA-256 of the exact JSON value, without host path normalization. */
export declare function digestJson(value: unknown): string;
/** Sign the complete envelope; callers must never persist the token. */
export declare function signRequest(token: string, value: Omit<ToolRequest, 'authentication'>): string;
/** Validate fixed topics; null means inspect the attached base. */
export declare function parseReferenceTopics(input: unknown): string[] | null;
/** Parse a transport request, including version and argument digest. */
export declare function parseToolRequest(input: unknown): ToolRequest;
/** Authenticate after structural parsing; the host owns policy checks. */
export declare function authenticateRequest(token: string, input: unknown): boolean;
/** Parse the correlated gateway response; tool errors remain distinct. */
export declare function parseToolResponse(input: unknown): ToolResponse;
/** Parse host build identity and resource bounds, never model paths. */
export declare function parseExecutionContext(input: unknown): ExecutionContext;
/** Validate receipts; the plugin owns geometric report semantics. */
export declare function parseBuildReceipt(input: unknown): BuildReceipt;
/** Exact supported combination until additional SDK releases are validated. */
export declare function assertDshCompatibility(version: string): void;
