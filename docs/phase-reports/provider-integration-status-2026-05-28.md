# Provider Integration Status, 2026-05-28

This inventory separates deployed provider gateways from integrations that are still gated by credentials, terms, or human-governance evidence. It is intentionally conservative: UI/toolbox visibility must not be interpreted as permission to perform irreversible payment, statutory, municipal, or supplier-provider actions.

## Current status

| Integration | Current mode | Production status | Blocking evidence before irreversible actions |
| --- | --- | --- | --- |
| PayFast ITN gateway and escrow audit | `live_gateway` | PHP gateway endpoint deployed at `POST /api/payment/notify`; validates signatures and records audit outcomes | Provider reconciliation reference, credential-vault reference, production adapter contract/signoff, and human release/refund approval workflow evidence |
| CPD statutory sync queue | `provider_gated` | UI/status projection only | Accredited-provider credentials, API/terms approval, statutory certificate mapping, production adapter signoff |
| Supplier catalogue and lead-time feed | `local_mock` | Supplier dashboard/procurement workflow UI only; catalogue prices/stock are deterministic fixture data | Supplier commercial/API terms, production adapter contract, human approval workflow evidence |
| Municipal submission tracker | `provider_gated` | Tracker UI and API fallbacks only | Municipality-specific portal credentials/API terms, adapter signoff, human submission approval evidence |

## Enforcement notes

- The provider readiness projection now exposes explicit blockers for `live_gateway`, `provider_gated`, and `local_mock` integrations.
- The project toolbox copy now says "Provider integration status" instead of presenting all entries as mocks.
- The PayFast entry is no longer represented as a mock provider. It is represented as a deployed gateway with escrow release/refund mutations still blocked.
- CPD, supplier catalogue, and municipal integrations remain blocked until real provider credentials/terms and production adapter references exist.

## Next production-hardening steps

1. Add host-side credential-vault reference IDs for PayFast after credential custody is approved.
2. Complete PayFast reconciliation tests with provider-side references and retain immutable audit evidence.
3. Obtain CPD/statutory provider API terms and credentials before enabling outbound sync.
4. Obtain supplier catalogue provider contracts/API specs before replacing fixture pricing/stock data.
5. Obtain municipality-specific automation approval before enabling any real municipal portal submission/status automation.
