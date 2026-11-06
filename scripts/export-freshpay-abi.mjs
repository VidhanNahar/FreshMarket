#!/usr/bin/env node
// Regenerates src/freshpay/abi.ts from the Foundry artifact: `npm run contracts:abi`.
import { readFileSync, writeFileSync } from "node:fs";

const artifact = JSON.parse(readFileSync("contracts/out/FreshPay.sol/FreshPay.json", "utf8"));
const body = JSON.stringify(artifact.abi, null, 2);
writeFileSync("src/freshpay/abi.ts", `// Generated from contracts/src/FreshPay.sol by scripts/export-freshpay-abi.mjs. Do not edit.
export const freshPayAbi = ${body} as const;
`);
console.log(`Wrote ${artifact.abi.length} ABI entries to src/freshpay/abi.ts`);
