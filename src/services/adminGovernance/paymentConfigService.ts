import type { AdminActor, PaymentProviderConfig } from './types';
import { assertPermission, id } from './utils';

export class PaymentConfigService {
  configure(actor: AdminActor, input: Omit<PaymentProviderConfig, 'id' | 'status'>): PaymentProviderConfig {
    assertPermission(['finance_admin', 'platform_admin', 'super_admin'].includes(actor.role), 'Not allowed to configure payment providers');
    const status = input.webhookConfigured ? 'active' : 'webhook_pending';
    return { id: id('paycfg'), status, ...input };
  }
  disable(actor: AdminActor, cfg: PaymentProviderConfig): PaymentProviderConfig {
    assertPermission(['finance_admin', 'platform_admin', 'super_admin'].includes(actor.role), 'Not allowed to disable payment providers');
    return { ...cfg, status: 'disabled' };
  }
  canRequestRelease(cfg: PaymentProviderConfig): boolean { return cfg.status === 'active' && cfg.enabledScopes.includes('payment_release') && cfg.webhookConfigured; }
}
