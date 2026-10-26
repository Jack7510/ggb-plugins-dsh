/** @fileoverview Public executor responses and browser-free data validation. */
import { type BuildReceipt, type Json } from './host-protocol.js';
export declare const EXECUTOR_PROTOCOL_VERSION = 3;
export type Operation = 'check' | 'inspect' | 'build';
export interface CheckData {
    validation: 'structural';
    mode: 'create' | 'edit' | 'modify';
    programSteps: number;
    requirements: number;
    samples: number;
    edits?: number;
    updates?: number;
    styles?: number;
    base?: {
        sha256: string;
        bytes: number;
        version: string;
        objects: number;
    };
    warnings?: {
        requirement: string;
        purpose: string;
        message: string;
    }[];
}
export interface InspectObject {
    name: string;
    type: string;
    defined: boolean;
    dependent: boolean;
    moveable: boolean;
    fixed: boolean;
    visible: boolean;
    color: string;
    lineThickness: number;
    lineStyle: number;
    filling: number | null;
    labelVisible: boolean;
    caption: string;
    definition: string;
    value: number | null;
    x: number | null;
    y: number | null;
    slider: {
        min: number;
        max: number;
        step?: number;
    } | null;
}
export interface InspectData {
    sha256: string;
    bytes: number;
    version: string;
    entries: string[];
    view: {
        xZero: number;
        yZero: number;
        scale: number;
    } | null;
    objects: InspectObject[];
}
export interface ExecutionResult {
    protocolVersion: 3;
    operation: Operation;
    contextSha256: string;
    packageIntegrity: string;
    phase: 'preflight' | 'execution';
    ok: boolean;
    data: Json;
    receipt: BuildReceipt | null;
    error: {
        code: string;
        message: string;
        details?: Json;
    } | null;
}
/** Validate the complete structural result without desktop CLI assumptions. */
export declare function parseCheckData(input: unknown): CheckData;
/** Inspect output has a public schema; paths never cross this boundary. */
export declare function parseInspectData(input: unknown): InspectData;
/** Plugin-owned bounded model projection after complete output validation. */
export declare function projectInspect(input: unknown): Json;
/** Require the current executor envelope without a CLI fallback. */
export declare function parseExecutionResult(input: unknown): ExecutionResult;
