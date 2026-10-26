import { equivalent, snapshotDifferences } from './verify.js';
import { ToolError } from './schema.js';
import { allowedStyleChanges, dependents, } from './edit.js';
import { isOnSliderStep } from './facts.js';
function close(actual, requested) {
    return typeof actual === 'number' && Number.isFinite(actual)
        && Math.abs(actual - requested) <= 1e-8 * Math.max(1, Math.abs(requested));
}
/** Numeric tolerance shared with delivery-time evidence checks. */
export function valueMatches(actual, requested) {
    return close(actual, requested);
}
/** Declared object-field pairs for updates. */
export function updateFields(updates) {
    const fields = new Set();
    for (const update of updates) {
        if (update.value !== undefined)
            fields.add(`${update.object}\u0000value`);
        if (update.coords !== undefined) {
            fields.add(`${update.object}\u0000x`);
            fields.add(`${update.object}\u0000y`);
        }
    }
    return fields;
}
/** Only independent base values and movable points accept updates. */
export function validateUpdates(updates, facts) {
    for (const update of updates) {
        const fact = facts.get(update.object);
        if (!fact) {
            throw new ToolError('unknown_update_target', `Unknown base object: ${update.object}`);
        }
        if (!fact.independent) {
            throw new ToolError('invalid_update', `Update target is not independent: ${update.object}`);
        }
        if (fact.fixed) {
            throw new ToolError('invalid_update', `Update target is fixed: ${update.object}`);
        }
        if (update.value !== undefined) {
            if (fact.type !== 'numeric') {
                throw new ToolError('invalid_update', `Value update needs a numeric object: ${update.object}`);
            }
            if (fact.slider && (update.value < fact.slider.min
                || update.value > fact.slider.max)) {
                throw new ToolError('invalid_update', `Value is outside the slider range: ${update.object}`, {
                    value: update.value, slider: fact.slider,
                });
            }
            if (fact.slider && !isOnSliderStep(update.value, fact.slider)) {
                throw new ToolError('invalid_update', `Value is not on the slider step grid: ${update.object}`, {
                    value: update.value, slider: fact.slider,
                });
            }
        }
        if (update.coords !== undefined) {
            if (fact.type !== 'point' || !fact.moveable) {
                throw new ToolError('invalid_update', `Coordinate update needs a movable point: ${update.object}`);
            }
        }
    }
}
/** Base styles keep presentation only; new objects may also be fixed. */
export function validateModifyStyles(styles, baseLabels) {
    for (const style of styles) {
        if (baseLabels.has(style.object)
            && style.properties.fixed !== undefined) {
            throw new ToolError('invalid_style', `Fixed is not a base presentation edit: ${style.object}`);
        }
    }
}
/** Every declared update must reach the requested value. */
export function requireUpdateEffects(updates, effects) {
    const missing = [];
    for (const update of updates) {
        const expected = update.value !== undefined ? [['value', update.value]]
            : [['x', update.coords[0]], ['y', update.coords[1]]];
        for (const [field, value] of expected) {
            const effect = effects.find(item => item.object === update.object && item.field === field);
            if (!effect || !close(effect.after, value)) {
                missing.push({
                    object: update.object, field, requested: value,
                    observed: effect?.after ?? null,
                });
            }
        }
    }
    if (missing.length) {
        throw new ToolError('update_no_effect', 'Update had no observed effect', missing);
    }
}
const recomputedFields = new Set([
    'x', 'y', 'value', 'line', 'circle', 'conic', 'data', 'valueString',
]);
/**
 * Differences outside the declared additions, styles and updates.
 *
 * Added objects are accepted only when the program declares them. Base object
 * changes are accepted only for declared style/update fields, style
 * propagation, or geometry that transitively depends on an updated object.
 */
export function modifyViolations(input) {
    const styleAccepted = allowedStyleChanges(input.styles, input.differences, input.links);
    const captions = new Set(input.styles
        .filter(style => style.properties.caption !== undefined)
        .map(style => style.object));
    const updated = new Set(input.updates.map(update => update.object));
    const recomputed = dependents(input.links, [...updated]);
    const updates = new Map(input.updates.map(update => [update.object, update]));
    return input.differences.filter(difference => {
        const key = `${difference.object}\u0000${difference.field}`;
        if (difference.field === 'objectCount') {
            // An addition is allowed only for a declared output; a removal or a
            // rename leaves the original label missing and is never allowed.
            return !(difference.expected === 0 && difference.actual === 1
                && input.declared.has(difference.object));
        }
        if (!input.baseLabels.has(difference.object)) {
            return !input.declared.has(difference.object);
        }
        if (styleAccepted.has(key))
            return false;
        // A base object that becomes undefined is a broken figure, never a
        // legitimate recomputation.
        if (difference.field === 'defined' && difference.actual === false) {
            return true;
        }
        // A caption also sets label style 3; that paired change is declared.
        if (difference.field === 'labelStyle'
            && captions.has(difference.object) && difference.actual === 3) {
            return false;
        }
        const update = updates.get(difference.object);
        if (update) {
            if (difference.field === 'value' && update.value !== undefined
                && close(difference.actual, update.value))
                return false;
            if (difference.field === 'x' && update.coords !== undefined
                && close(difference.actual, update.coords[0]))
                return false;
            if (difference.field === 'y' && update.coords !== undefined
                && close(difference.actual, update.coords[1]))
                return false;
        }
        if (recomputed.has(difference.object)
            && recomputedFields.has(difference.field))
            return false;
        return true;
    });
}
/** A parameter sample can only change its value and dependent mathematics. */
export function validateParameterChanges(before, after, parameter, value) {
    const original = new Map(before.map(fact => [fact.name, fact]));
    const recomputed = dependents(after, [parameter]);
    const differences = snapshotDifferences(after, before).filter(change => {
        if (change.field !== 'nativeType' || !recomputed.has(change.object)) {
            return true;
        }
        // A changing polygon can become a triangle/quadrilateral while keeping
        // its normalized mathematical type, definition and dependency graph.
        return original.get(change.object)?.type !==
            after.find(fact => fact.name === change.object)?.type;
    });
    for (const fact of after) {
        const old = original.get(fact.name);
        if (!old)
            continue;
        // Snapshot normalization ignores numeric label flags after reload;
        // within a sample, presentation is never an allowed parameter effect.
        for (const field of ['labelVisible', 'labelStyle']) {
            if (!equivalent(old[field], fact[field]))
                differences.push({
                    object: fact.name, field, expected: old[field], actual: fact[field],
                });
        }
    }
    const violations = modifyViolations({
        styles: [], updates: [{ object: parameter, value }], differences,
        links: after,
        declared: new Set(), baseLabels: new Set(original.keys()),
    });
    if (violations.length) {
        throw new ToolError('preservation_violation', 'Parameter sampling changed unrelated construction facts', violations);
    }
}
