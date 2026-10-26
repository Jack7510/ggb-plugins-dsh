/** @fileoverview Pure mathematical verification and snapshot comparison. */
import assert from 'node:assert/strict';
import { resolveProgramOutputs } from './native-outputs.js';
import { verificationFeedback } from './verification-feedback.js';
import { commands, ToolError } from './schema.js';
export const tolerance = 1e-8;
const numeric = (error, scale = 1) => {
    if (!Number.isFinite(error) || !Number.isFinite(scale))
        return 'unverified';
    const limit = tolerance * Math.max(1, Math.abs(scale));
    return Math.abs(error) <= limit ? 'passed' : Math.abs(error) > limit * 10 ? 'failed' : 'unverified';
};
const all = (statuses) => statuses.includes('failed') ? 'failed' : statuses.includes('unverified') ? 'unverified' : 'passed';
const truth = (value) => value ? 'passed' : 'failed';
const mathStatus = (actual, expected) => {
    if (Array.isArray(expected))
        return !Array.isArray(actual) ? 'unverified' : actual.length !== expected.length ? 'failed'
            : all(expected.map((value, i) => mathStatus(actual[i], value)));
    if (typeof actual !== typeof expected)
        return 'unverified';
    return typeof expected === 'number' ? numeric(actual - expected, expected) : truth(actual === expected);
};
export function definition(fact) {
    // An undefined object has no definition to compare; its `defined` flag is
    // itself part of the facts.
    if (!fact.defined)
        return null;
    // These objects already have complete numeric facts, compared with tolerance.
    // Other independent objects still need their native mathematical definition.
    if (fact.independent && ((fact.type === 'point' && fact.x !== null && fact.y !== null)
        || (['numeric', 'boolean'].includes(fact.type) && fact.value !== null) || fact.line || fact.circle))
        return null;
    const match = /^([A-Za-z]+)\[(.*)\]$/.exec(fact.command);
    const native = fact.nativeDefinition ?? (match ? { name: match[1], args: match[2].split(',').map(s => s.trim()) } : null);
    if (!native) {
        if (fact.expression)
            return { expression: fact.expression };
        throw new ToolError('verification_unverified', `Missing mathematical definition: ${fact.name}`);
    }
    const name = Object.entries(commands).find(([key, spec]) => (spec.native ?? key) === native.name)?.[0] ?? native.name;
    const args = native.args.map(s => {
        if (/^[A-Za-z][A-Za-z0-9_]*(?:\{[A-Za-z0-9]+\})?$/.test(s))
            return { ref: s };
        const n = Number(s);
        if (s && Number.isFinite(n))
            return n;
        return { expression: s };
    });
    return { name, args };
}
/** Numeric observations use tolerance; identities, dependencies and properties remain exact. */
export function equivalent(a, b) {
    if (typeof a === 'number' && typeof b === 'number')
        return numeric(a - b, Math.max(Math.abs(a), Math.abs(b))) === 'passed';
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object')
        return a === b;
    if (Array.isArray(a) || Array.isArray(b))
        return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equivalent(v, b[i]));
    const x = a, y = b;
    return equivalent(Object.keys(x).sort(), Object.keys(y).sort()) && Object.keys(x).every(key => equivalent(x[key], y[key]));
}
function normalizeSnapshots(facts) {
    // GeoGebra normalizes graphics-label flags on non-graphical algebra objects.
    // Explicit presentation requirements are still checked by verify.
    return facts.map(({ command, nativeDefinition, expression, valueString, labelStyle, labelVisible, ...fact }) => ({ ...fact,
        ...(['numeric', 'list', 'boolean'].includes(fact.type) ? {} : { labelStyle, labelVisible }),
        ...(['function', 'functionnvar', 'text'].includes(fact.type) || (fact.type === 'list' && fact.data === null) ? { valueString } : {}),
        definition: definition({ ...fact, command, nativeDefinition, expression, valueString, labelStyle, labelVisible }) })).sort((x, y) => x.name.localeCompare(y.name));
}
/** Field-level diagnostics use the same normalization and tolerance as the gate. */
export function snapshotDifferences(actual, expected) {
    const a = normalizeSnapshots(actual), b = normalizeSnapshots(expected);
    const differences = [];
    for (const name of new Set([...a, ...b].map(fact => fact.name))) {
        const before = b.filter(fact => fact.name === name), after = a.filter(fact => fact.name === name);
        if (before.length !== 1 || after.length !== 1) {
            differences.push({ object: name, field: 'objectCount', expected: before.length, actual: after.length });
            continue;
        }
        const old = before[0], fresh = after[0];
        for (const field of new Set([...Object.keys(old), ...Object.keys(fresh)])) {
            if (!equivalent(old[field], fresh[field]))
                differences.push({ object: name, field, expected: old[field], actual: fresh[field] });
        }
    }
    return differences;
}
export function compareSnapshots(a, b) {
    if (!equivalent(normalizeSnapshots(a), normalizeSnapshots(b))) {
        assert.fail(`Construction facts changed: ${JSON.stringify(snapshotDifferences(a, b))}`);
    }
}
/** Reads only a defined segment's finite native length. */
function segmentLength(fact) {
    if (fact.type !== 'segment' || fact.value === null
        || !Number.isFinite(fact.value)) {
        throw new Error(`Expected a segment with finite length: `
            + `${fact.name} (${fact.type})`);
    }
    return fact.value;
}
function styleStatus(fact, properties) {
    const actual = fact;
    const matches = ([key, value]) => {
        const observed = actual[key];
        if (key === 'color')
            return observed === String(value).toUpperCase();
        // GeoGebra stores an exact own-name caption as the empty default caption.
        // Keep the raw observation; do not alias Unicode, subscripts or custom text.
        if (key === 'caption' && observed === '' && value === fact.name) {
            return true;
        }
        // `filling` is a float opacity; other style fields are exact integers.
        if (key === 'filling') {
            return typeof observed === 'number' && typeof value === 'number'
                && Math.abs(observed - value) <= tolerance;
        }
        return observed === value;
    };
    return truth((properties.caption === undefined || fact.labelStyle === 3)
        && Object.entries(properties).every(matches));
}
/** Pure verification: only actual observations and frozen requirements enter this function. */
/**
 * First-order distance from a point to the conic `a11x^2 + 2a12xy + a22y^2 +
 * 2a13x + 2a23y + a33 = 0`. Dividing by the gradient keeps the tolerance
 * comparable to the other geometric predicates instead of scaling with the
 * conic coefficients.
 */
function conicResidual(x, y, a) {
    const [a0, a1, a2, a3, a4, a5] = a;
    const value = a0 * x * x + 2 * a3 * x * y + a1 * y * y
        + 2 * a4 * x + 2 * a5 * y + a2;
    const gx = 2 * (a0 * x + a3 * y + a4);
    const gy = 2 * (a3 * x + a1 * y + a5);
    const gradient = Math.hypot(gx, gy);
    if (!Number.isFinite(value) || !Number.isFinite(gradient))
        return 'unverified';
    const scale = Math.max(1, Math.hypot(x, y));
    return gradient === 0 ? numeric(value, scale) :
        numeric(value / gradient, scale);
}
/** Describe probe facts without exporting expressions, values or raw errors. */
function expressionFailureMessage(check, observation, status, missingSubject) {
    if (status === 'passed')
        return undefined;
    const expected = Array.isArray(check.expected) ? 'list'
        : typeof check.expected === 'boolean' ? 'boolean' : 'numeric';
    const observed = observation?.type?.replace(/[^A-Za-z0-9_]/gu, '')
        .slice(0, 48) || 'unknown';
    const defined = observation?.defined;
    const prefix = `expression ${status}: probe returned ${observed}`
        + ` (defined=${defined ?? 'unknown'}); expected ${expected}`;
    let reason = '';
    if (missingSubject)
        reason = 'required subject missing or undefined';
    else if (!observation)
        reason = 'probe observation missing';
    else if (observation.expression !== check.expression
        || observation.mode !== check.mode
        || !equivalent(observation.assumptions ?? [], check.assumptions ?? [])) {
        reason = 'probe does not match the declared check';
    }
    else if (observation.error)
        reason = 'probe evaluation error';
    else if (defined && observed === expected) {
        reason = status === 'failed' ? 'values differ'
            : 'comparison unavailable or inconclusive';
    }
    return (reason ? `${prefix}; ${reason}` : prefix).slice(0, 256);
}
/** Verify only actual observations against the frozen request. */
export function verify(request, objects, phase, observations = []) {
    const facts = new Map(objects.map(fact => [fact.name, fact]));
    const get = (id) => {
        const fact = facts.get(id);
        if (!fact?.defined)
            throw new Error(`Missing or undefined observation: ${id}`);
        return fact;
    };
    const point = (id) => {
        const p = get(id);
        if (p.type !== 'point' || p.x === null || p.y === null ||
            !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
            throw new Error(`Expected a point: ${id} (${p.type})`);
        }
        return { x: p.x, y: p.y };
    };
    const line = (id) => {
        const fact = get(id), l = fact.line;
        if (!l || l.length !== 3 ||
            !l.every(n => typeof n === 'number' && Number.isFinite(n))) {
            throw new Error(`Expected a line: ${id} (${fact.type})`);
        }
        return l;
    };
    const distance = (a, b) => { const p = point(a), q = point(b); return Math.hypot(p.x - q.x, p.y - q.y); };
    const depends = (id, target, visited = new Set()) => {
        if (visited.has(id))
            return false;
        visited.add(id);
        const fact = get(id);
        if (fact.independent)
            return false;
        if (fact.referenceState === 'ambiguous')
            throw new Error(`Dependency references require semantic resolution: ${id}`);
        return (fact.inputs ?? []).some(ref => ref === target || depends(ref, target, visited));
    };
    const methods = {
        exists: c => truth(Boolean(facts.get(c.subjects[0])?.defined)),
        type: c => truth(get(c.subjects[0]).type === c.objectType),
        coordinate: c => { const p = point(c.subjects[0]); return all([numeric(p.x - c.coordinates[0], c.coordinates[0]), numeric(p.y - c.coordinates[1], c.coordinates[1])]); },
        midpoint: c => {
            const [id, a, b] = c.subjects;
            const p = point(id), q = point(a), r = point(b);
            const state = all([numeric(p.x - (q.x + r.x) / 2, Math.max(Math.abs(q.x), Math.abs(r.x))), numeric(p.y - (q.y + r.y) / 2, Math.max(Math.abs(q.y), Math.abs(r.y)))]);
            return c.scope === 'sampled' ? all([state, truth(depends(id, a) && depends(id, b))]) : state;
        },
        pointOn: c => {
            const p = point(c.subjects[0]), path = get(c.subjects[1]);
            if (path.type === 'line') {
                const [a, b, d] = line(path.name);
                return numeric(a * p.x + b * p.y + d, Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(d)));
            }
            if (path.circle) {
                return numeric(Math.hypot(p.x - path.circle.x, p.y - path.circle.y) - path.circle.radius, path.circle.radius);
            }
            if (path.conic)
                return conicResidual(p.x, p.y, path.conic);
            throw new Error(`Expected a line or conic: ${path.name} (${path.type})`);
        },
        center: c => {
            const target = get(c.subjects[0]), p = point(c.subjects[1]);
            if (!target.circle) {
                throw new Error(`Expected a circle: ${target.name} (${target.type})`);
            }
            return all([numeric(target.circle.x - p.x, p.x),
                numeric(target.circle.y - p.y, p.y)]);
        },
        radius: c => {
            const target = get(c.subjects[0]);
            if (!target.circle) {
                throw new Error(`Expected a circle: ${target.name} (${target.type})`);
            }
            return numeric(target.circle.radius - c.value, c.value);
        },
        parallel: c => { const [a, b] = line(c.subjects[0]), [x, y] = line(c.subjects[1]); return numeric(a * y - b * x); },
        perpendicular: c => { const [a, b] = line(c.subjects[0]), [x, y] = line(c.subjects[1]); return numeric(a * x + b * y); },
        equalLength: c => {
            const a = segmentLength(get(c.subjects[0]));
            const b = segmentLength(get(c.subjects[1]));
            return numeric(a - b, Math.max(a, b));
        },
        distance: c => numeric(distance(c.subjects[0], c.subjects[1]) - c.value, c.value),
        nonCollinear: c => {
            const [p, q, r] = c.subjects.map(point);
            const cross = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
            const scale = Math.hypot(q.x - p.x, q.y - p.y) * Math.hypot(r.x - p.x, r.y - p.y);
            return scale === 0 || cross === 0 ? 'failed' : Math.abs(cross) > tolerance * Math.max(1, scale) * 10 ? 'passed' : 'unverified';
        },
        dependsOn: c => truth(c.subjects.slice(1).every(id => depends(c.subjects[0], id))),
        style: c => styleStatus(get(c.subjects[0]), c.properties),
    };
    const results = [];
    const add = (requirementId, index, subjects, method, fn, scope = phase) => {
        let status, evidence;
        try {
            status = fn();
            evidence = subjects.map(id => facts.get(id) ?? null);
        }
        catch (error) {
            status = 'unverified';
            evidence = { message: error instanceof Error ? error.message : String(error) };
        }
        results.push({ requirementId, checkId: `${requirementId}:${index}`, subjects, method, scope, status, evidence });
    };
    // A base may legitimately hold undefined objects. Their survival is enforced
    // by the edit's preservation gate instead of requiring every object to resolve.
    add('$canvas', 0, objects.map(o => o.name), 'objects_defined', () => truth(objects.length > 0 && (request.base ? true : objects.every(o => o.defined && (o.type !== 'numeric' || o.value !== null)))));
    const resolvedOutputs = resolveProgramOutputs(request.plan.program, objects);
    for (const step of request.plan.program) {
        const outputs = resolvedOutputs.get(step.id);
        add('$program:' + step.id, 0, outputs, 'construction', () => {
            if (step.op === 'native')
                return truth(outputs.every(id => Boolean(get(id))));
            const fact = get(step.id);
            if (step.op === 'freePoint') {
                const state = truth(fact.type === 'point' && fact.independent && fact.moveable);
                return phase === 'initial' ? all([state, numeric(point(step.id).x - step.x, step.x), numeric(point(step.id).y - step.y, step.y)]) : state;
            }
            return truth(fact.type === commands[step.name].output && equivalent(definition(fact), { name: step.name, args: step.args }));
        });
        for (const id of outputs) {
            const properties = { ...(step.op === 'native' ? {} : { visible: true }), ...(facts.get(id)?.type === 'point' ? { labelVisible: true } : {}), ...request.plan.styles?.find(s => s.object === id)?.properties };
            add('$style:' + id, 0, [id], 'presentation', () => all([styleStatus(get(id), properties),
                get(id).type === 'point' ? truth(get(id).labelStyle === (properties.caption === undefined ? 0 : 3)) : 'passed']));
            const result = results.at(-1);
            if (result.status !== 'passed') {
                const expected = { ...properties,
                    ...(properties.caption !== undefined ? { labelStyle: 3 }
                        : facts.get(id)?.type === 'point' ? { labelStyle: 0 } : {}) };
                result.evidence = verificationFeedback('presentation', facts.get(id), expected, [facts.get(id) ?? null]);
            }
        }
    }
    for (const requirement of request.plan.requirements)
        requirement.checks.forEach((check, index) => {
            if (phase === 'initial' || check.scope === 'sampled') {
                const observation = observations.find(o => o.id === `${requirement.id}:${index}`);
                add(requirement.id, index, check.subjects, check.kind, () => {
                    if (check.kind !== 'expression')
                        return methods[check.kind](check);
                    check.subjects.forEach(get);
                    if (!observation?.defined || observation.error || observation.expression !== check.expression || observation.mode !== check.mode
                        || !equivalent(observation.assumptions ?? [], check.assumptions ?? []))
                        return 'unverified';
                    if (Array.isArray(check.expected))
                        return observation.type === 'list' ? mathStatus(observation.data, check.expected) : 'unverified';
                    if (observation.value === null)
                        return 'unverified';
                    if (typeof check.expected === 'boolean')
                        return observation.type === 'boolean' ? truth(observation.value === (check.expected ? 1 : 0)) : 'unverified';
                    return observation.type === 'numeric' ? numeric(observation.value - check.expected, check.expected) : 'unverified';
                }, check.scope);
                const checked = results.at(-1);
                if (checked.status !== 'passed' &&
                    (check.kind === 'type' || check.kind === 'style')) {
                    const fact = facts.get(check.subjects[0]);
                    const expected = check.kind === 'type'
                        ? { objectType: check.objectType } : { ...check.properties,
                        ...(check.properties?.caption === undefined ? {} : { labelStyle: 3 }) };
                    checked.evidence = verificationFeedback(check.kind, fact, expected, check.subjects.map(id => facts.get(id) ?? null));
                }
                if (check.kind === 'expression') {
                    const result = results.at(-1);
                    const message = expressionFailureMessage(check, observation, result.status, check.subjects.some(id => !facts.get(id)?.defined));
                    result.evidence = { observation: observation ?? null,
                        objects: check.subjects.map(id => facts.get(id) ?? null),
                        ...(message ? { message } : {}) };
                }
            }
        });
    return { status: all(results.map(r => r.status)), objects, results, observations };
}
