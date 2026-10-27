# R-001 — Recommend the action that removes the most owner work

Status: accepted product requirement, 27 October 2026. Implementation pending.

## Requirement

> A useful assessment should tell the owner what would remove the most work next.

The owner's AI assistant must turn its understanding of the business into one concrete, high-value next action that reduces the owner's non-core workload. Launchpad supplies the assessment framework, available service capabilities and evidence; the assistant makes the final business assessment.

The objective is less work and fewer interruptions for the owner, not more connected tools or a higher completion percentage.

## Acceptance criteria

- Each actionable assessment presents one primary next action in plain language, with a short explanation of what work it would remove and why it comes first.
- The assistant uses existing business context and connections before asking questions or recommending new services. It asks only for missing information that could materially change the recommendation.
- The assessment considers recurring burden, interruptions, importance, urgency, feasibility, setup effort and dependencies. It does not prioritise convenience over a known urgent obligation.
- Prefer reusable leverage: an existing connection, a dependable recurring process, clear delegation, exception handling or a missing permission. Do not assume a new adapter is needed.
- Separate observed facts from estimates and assumptions. Do not invent hours saved, promise unattended execution without a real executor, or treat an assistant report as independently confirmed completion.
- The recommendation identifies any required owner decision or approval. If no useful action can yet be justified, explain the blocker and the smallest information-gathering step instead of manufacturing a recommendation.
- The main view makes the action obvious; supporting evidence and alternatives are available on demand.
- The same framework works for unrelated businesses. No company-name branches, pilot-specific logic or silent exclusion of unsupported responsibilities.

## Validation

Use unrelated synthetic business scenarios with different existing services and workloads. For each, the owner should be able to explain the recommended action, the work it removes, why it is first, and what still needs them. Include an urgent obligation, incomplete context, a missing permission and a case where keeping an existing arrangement is better than adding a tool.

This is a product requirement, not a claim that the feature is implemented.

