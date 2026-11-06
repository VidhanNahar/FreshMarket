# Security status

FreshMarket is a testnet prototype and is **not cleared for an unrestricted production launch**. Passing functional tests is not proof of absence of vulnerabilities.

The project-wide review, reproduced edge cases, fixes, dependency advisory snapshots and remaining release risks are documented in [arkiv/security-audit.md](arkiv/security-audit.md). Do not put real private keys, Bee credentials or private personal data in the repository or public Arkiv entities.

Production Swarm uploads require an explicit wallet allowlist, exact allowed origin, usable postage configuration and shared atomic replay/quota state. They fail closed without those requirements. Perimeter rate limits are still necessary to reject unauthenticated traffic before application work; application authorization is not a substitute for network-level abuse protection.

Pending wallet transaction state currently lives in memory. Retain submitted hashes and inspect the chain before retrying after a reload, route change, tab switch or unexpected provider error. A durable transaction journal and live wallet compatibility tests are release requirements for stronger duplicate-submission guarantees.

Report security concerns privately to the repository maintainers through an available private channel. Do not publish credentials, exploit payloads against real user data, or unverified safety claims in a public issue. No private security contact or bug bounty program is asserted here.
