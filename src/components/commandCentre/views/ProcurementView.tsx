'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, ShoppingCart, AlertTriangle } from 'lucide-react';
import type { ProcurementOrder } from '@/services/commandCentre/types';
import { LinkChip } from '@/components/commandCentre/LinkChip';

interface ProcurementViewProps {
  projectId: string;
}

const STATUS_COLORS: Record<string, string> = {
  ordered: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  in_transit: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  delivered: 'bg-green-500/20 text-green-400 border-green-500/50',
  evaluating: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
};

export default function ProcurementView({ projectId }: ProcurementViewProps) {
  const [orders, setOrders] = useState<ProcurementOrder[]>([]);

  useEffect(() => {
    void projectId;
  }, [projectId]);

  const isOverdue = (order: ProcurementOrder) => {
    return order.status !== 'delivered' && order.expectedDeliveryDate < new Date().toISOString().slice(0, 10);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Procurement Tracker</h2>
        <Button size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          New Order
        </Button>
      </div>

      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700/50">
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Order #</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Description</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Supplier</th>
                  <th className="text-right py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Value</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Delivery</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">B-BBEE</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Spec Link</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <ShoppingCart className="h-8 w-8 opacity-40" />
                        <p>No procurement orders</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id} className="border-b border-surface-700/30">
                      <td className="py-2 px-2 font-mono text-xs">{order.orderNumber}</td>
                      <td className="py-2 px-2 font-medium truncate max-w-xs">{order.description}</td>
                      <td className="py-2 px-2 text-muted-foreground">{order.supplierName}</td>
                      <td className="text-right py-2 px-2">R {order.value.toLocaleString()}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">{order.expectedDeliveryDate}</span>
                          {isOverdue(order) && <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        {order.bbbeeLevel ? (
                          <Badge variant="outline" className="text-xs">Level {order.bbbeeLevel}</Badge>
                        ) : '—'}
                      </td>
                      <td className="py-2 px-2">
                        {order.linkedSpecForgeItemId ? (
                          <LinkChip
                            link={{
                              linkedEntityId: order.linkedSpecForgeItemId,
                              linkedEntityType: 'documents',
                              label: order.linkedSpecForgeItemTitle ?? `Spec ${order.linkedSpecForgeItemId.slice(0, 8)}`,
                            }}
                          />
                        ) : '—'}
                      </td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[order.status] ?? ''}`}>
                          {order.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
