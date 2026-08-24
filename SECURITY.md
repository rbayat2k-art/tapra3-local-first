# Security Policy

## Supported code

Security fixes target the current `main` branch and active release candidates. Historical prototypes and deprecated branches are not supported runtime authority.

## Reporting a vulnerability

Do not disclose credentials, personal data, or an exploitable vulnerability in a public issue. Prefer GitHub private vulnerability reporting when it is enabled for this repository. If it is unavailable, contact the repository owner privately through the GitHub profile and include only the minimum reproduction data.

The report should include the affected commit, impact, safe reproduction steps, and whether data or credentials may already be exposed. Never attach real TAPRA personnel, financial, banking, OTP, backup, or customer data.

## Automated findings

Semgrep, Trivy, Gitleaks, dependency alerts, and AI review findings are evidence to triage, not automatic proof. Classify each finding as `VALID`, `FALSE POSITIVE`, or `NEEDS PRODUCT DECISION`. High-risk valid findings must be fixed or explicitly accepted before release.
