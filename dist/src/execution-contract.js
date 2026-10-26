/** @fileoverview Public executor responses and browser-free data validation. */
import { canonicalJson, ProtocolError, LIMITS, parseBuildReceipt } from './host-protocol.js';
export const EXECUTOR_PROTOCOL_VERSION = 3;
function requireValue(ok, field) {
    if (!ok)
        throw new ProtocolError('executor_' + field);
}
function object(input, keys) {
    requireValue(input !== null && typeof input === 'object' &&
        !Array.isArray(input), 'object');
    const value = input;
    requireValue(Object.keys(value).every(key => keys.includes(key)), 'keys');
    return value;
}
const text = (input) => typeof input === 'string';
const count = (input) => Number.isSafeInteger(input) &&
    Number(input) >= 0;
const finite = (input) => typeof input === 'number' &&
    Number.isFinite(input);
const digest = (input) => typeof input === 'string' &&
    /^[a-f0-9]{64}$/u.test(input);
/** Validate the complete structural result without desktop CLI assumptions. */
export function parseCheckData(input) {
    const value = object(input, ['validation', 'mode', 'programSteps',
        'requirements', 'samples', 'edits', 'updates', 'styles', 'base',
        'warnings']);
    requireValue(value.validation === 'structural' &&
        ['create', 'edit', 'modify'].includes(String(value.mode)), 'check');
    for (const key of ['programSteps', 'requirements', 'samples']) {
        requireValue(count(value[key]), key);
    }
    for (const key of ['edits', 'updates', 'styles']) {
        requireValue(value[key] === undefined || count(value[key]), key);
    }
    if (value.mode === 'create')
        requireValue(value.base === undefined, 'base');
    else {
        const base = object(value.base, ['sha256', 'bytes', 'version', 'objects']);
        requireValue(digest(base.sha256) && count(base.bytes) &&
            text(base.version) && count(base.objects), 'base');
    }
    if (value.warnings !== undefined) {
        requireValue(Array.isArray(value.warnings) &&
            value.warnings.length <= 256, 'warnings');
        for (const input of value.warnings) {
            const warning = object(input, ['requirement', 'purpose', 'message']);
            requireValue(['requirement', 'purpose', 'message'].every(key => text(warning[key])), 'warning');
        }
    }
    return value;
}
function inspectObject(input) {
    const booleans = ['defined', 'dependent', 'moveable', 'fixed', 'visible',
        'labelVisible'];
    const strings = ['name', 'type', 'color', 'caption', 'definition'];
    const nullable = ['filling', 'value', 'x', 'y'];
    const value = object(input, [...booleans, ...strings, ...nullable,
        'lineThickness', 'lineStyle', 'slider']);
    requireValue(booleans.every(key => typeof value[key] === 'boolean') &&
        strings.every(key => text(value[key])) &&
        ['lineThickness', 'lineStyle'].every(key => finite(value[key])) &&
        nullable.every(key => value[key] === null || finite(value[key])), 'inspect_object');
    if (value.slider !== null) {
        const slider = object(value.slider, ['min', 'max', 'step']);
        requireValue(finite(slider.min) && finite(slider.max) &&
            Number(slider.max) >= Number(slider.min) &&
            (slider.step === undefined ||
                finite(slider.step) && Number(slider.step) > 0), 'slider');
    }
    return value;
}
/** Inspect output has a public schema; paths never cross this boundary. */
export function parseInspectData(input) {
    const value = object(input, ['sha256', 'bytes', 'version', 'entries',
        'view', 'objects']);
    requireValue(digest(value.sha256) && count(value.bytes) &&
        text(value.version), 'inspect_identity');
    requireValue(Array.isArray(value.entries) && value.entries.length <= 32 &&
        value.entries.every(text), 'entries');
    if (value.view !== null) {
        const view = object(value.view, ['xZero', 'yZero', 'scale']);
        requireValue(['xZero', 'yZero', 'scale'].every(key => finite(view[key])) &&
            Number(view.scale) > 0, 'view');
    }
    requireValue(Array.isArray(value.objects) && value.objects.length <= 512, 'objects');
    const objects = value.objects.map(inspectObject);
    requireValue(new Set(objects.map(item => item.name)).size === objects.length, 'duplicate_object');
    return value;
}
/** Plugin-owned bounded model projection after complete output validation. */
export function projectInspect(input) {
    const data = parseInspectData(input);
    return { ...data, objects: data.objects.slice(0, 100).map(item => ({ ...item,
            definition: item.definition.slice(0, 500) })),
        truncated: data.objects.length > 100 };
}
/** Require the current executor envelope without a CLI fallback. */
export function parseExecutionResult(input) {
    const value = object(input, ['protocolVersion', 'operation', 'contextSha256',
        'packageIntegrity', 'phase', 'ok', 'data', 'receipt', 'error']);
    requireValue(value.protocolVersion === 3 &&
        ['check', 'inspect', 'build'].includes(String(value.operation)), 'version');
    requireValue(digest(value.contextSha256) && digest(value.packageIntegrity), 'binding');
    requireValue(['preflight', 'execution'].includes(String(value.phase)) &&
        typeof value.ok === 'boolean', 'phase');
    if (value.ok)
        requireValue(value.error === null, 'success_error');
    else {
        const error = object(value.error, ['code', 'message', 'details']);
        requireValue(text(error.code) && String(error.code).length > 0 &&
            text(error.message) && String(error.message).length > 0 &&
            value.data === null, 'error');
    }
    if (value.operation === 'build')
        validateBuild(value);
    else {
        requireValue(value.receipt === null && value.phase ===
            (value.operation === 'check' ? 'preflight' : 'execution'), 'operation');
        if (value.ok) {
            if (value.operation === 'check')
                parseCheckData(value.data);
            else
                parseInspectData(value.data);
        }
    }
    requireValue(Buffer.byteLength(canonicalJson(value)) <= LIMITS.stdoutBytes, 'size');
    return value;
}
function validateBuild(value) {
    const receipt = parseBuildReceipt(value.receipt);
    requireValue(value.data === null && value.ok ===
        (receipt.status === 'succeeded'), 'build_status');
    if (value.ok)
        requireValue(value.phase === 'execution', 'build_phase');
    else
        requireValue(value.error.code ===
            receipt.issues[0]?.code, 'build_error');
    requireValue(receipt.packageIntegrity === value.packageIntegrity, 'build_package');
}
