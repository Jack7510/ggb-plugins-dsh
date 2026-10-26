import { ToolError } from './schema.js';
// Filling paints a closed region only. Other objects accept the call and then
// render nothing, which would pass a naive read-back.
export const fillable = new Set([
    'circle', 'conic', 'ellipse', 'parabola', 'hyperbola', 'polygon', 'sector',
    'arc', 'inequality',
]);
// Stroke properties need an object that draws a path.
export const outlined = new Set([
    'line', 'segment', 'ray', 'vector', 'polyline', 'polygon', 'circle',
    'conic', 'ellipse', 'parabola', 'hyperbola', 'arc', 'sector', 'locus',
    'inequality',
]);
/** Reject unknown targets and properties that cannot show on that type. */
export function validateTargets(edits, types) {
    for (const { object, properties } of edits) {
        const type = types.get(object);
        if (!type) {
            throw new ToolError('unknown_edit_target', `Unknown base object: ${object}`);
        }
        if (properties.filling !== undefined && !fillable.has(type)) {
            throw new ToolError('invalid_edit', `Filling needs a fillable object: ${object} (${type})`);
        }
        const stroke = properties.lineThickness !== undefined ||
            properties.lineStyle !== undefined;
        if (stroke && !outlined.has(type)) {
            throw new ToolError('invalid_edit', `Line style needs an outline object: ${object} (${type})`);
        }
    }
}
/** Declared object-field pairs; anything else is an unintended change. */
export function editFields(edits) {
    const fields = new Set();
    for (const { object, properties } of edits) {
        for (const field of Object.keys(properties)) {
            fields.add(`${object}\u0000${field}`);
        }
    }
    return fields;
}
function matches(field, actual, requested) {
    // GeoGebra reports colors in upper case and fillings as floats.
    if (field === 'color') {
        return typeof actual === 'string' &&
            actual.toUpperCase() === String(requested).toUpperCase();
    }
    if (field === 'filling') {
        return typeof actual === 'number' &&
            Math.abs(actual - Number(requested)) <= 1e-8;
    }
    return actual === requested;
}
export { dependents } from './facts.js';
/**
 * Changes outside the declared pairs mean the edit touched the figure.
 *
 * GeoGebra copies a polygon's color and stroke to its edge objects, so a
 * dependent may change too. That propagation is accepted only when the
 * dependent really reads the edited object and takes the requested value;
 * any other dependent change, or any unrelated change, is still a violation.
 */
export function diffViolations(edits, differences, links = []) {
    const accepted = allowedStyleChanges(edits, differences, links);
    return differences.filter(difference => !accepted.has(`${difference.object}\u0000${difference.field}`));
}
/** Declared style pairs plus presentation propagation, as difference keys. */
export function allowedStyleChanges(edits, differences, links = []) {
    const allowed = editFields(edits);
    const accepted = new Set();
    for (const difference of differences) {
        const key = `${difference.object}\u0000${difference.field}`;
        if (allowed.has(key)) {
            accepted.add(key);
            continue;
        }
        const propagated = edits.some(({ object, properties }) => object !== difference.object &&
            Object.hasOwn(properties, difference.field) &&
            links.some(link => link.name === difference.object
                && link.styleOwner === object
                && link.styleFields?.includes(difference.field)) &&
            matches(difference.field, difference.actual, properties[difference.field]));
        if (propagated)
            accepted.add(key);
    }
    return accepted;
}
/** Every declared field must be observable, not merely accepted. */
export function requireEffects(edits, effects) {
    const missing = [];
    for (const { object, properties } of edits) {
        for (const [field, requested] of Object.entries(properties)) {
            const effect = effects.find(item => item.object === object && item.field === field);
            if (!effect || !matches(field, effect.after, requested)) {
                missing.push({
                    object, field, requested, observed: effect?.after ?? null,
                });
            }
        }
    }
    if (missing.length) {
        throw new ToolError('edit_no_effect', 'Edit had no observed effect', missing);
    }
}
