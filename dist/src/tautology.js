/** A successful assertion does not certify its independence from construction. */
export function verificationNotes(requirements) {
    return requirements.map(requirement => ({
        requirement: requirement.id, purpose: requirement.purpose ?? 'unspecified',
        message: 'Checks verify declared facts. Review construction correctness, '
            + 'problem constraints and interaction coverage separately; independence '
            + 'from the construction is not automatically certified.',
    }));
}
