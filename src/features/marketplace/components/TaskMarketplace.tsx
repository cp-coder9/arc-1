import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ListTodo,
  Plus,
  Clock,
  Calendar,
  DollarSign,
  FileOutput,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Upload,
  Eye,
} from 'lucide-react';
import type { UserProfile } from '@/types';
import type {
  TaskPosting,
  TaskPostingStatus,
  DeliverableFormat,
} from '../types';
import { apiFetch } from '@/lib/apiClient';

interface TaskMarketplaceProps {
  user: UserProfile;
}

function formatCurrency(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

function getTaskStatusColor(status: TaskPostingStatus): string {
  switch (status) {
    case 'open': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'in_progress': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'delivered': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'completed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'failed': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'cancelled': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
}

function getFormatLabel(format: DeliverableFormat): string {
  const labels: Record<DeliverableFormat, string> = {
    pdf: 'PDF Document',
    image: 'Image/Drawing',
    certificate: 'Certificate',
    datasheet: 'Datasheet',
    model: '3D Model',
    other: 'Other',
  };
  return labels[format];
}

export default function TaskMarketplace({ user }: TaskMarketplaceProps) {
  const [activeTab, setActiveTab] = useState('available');
  const [_tasks, setTasks] = useState<TaskPosting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/marketplace/tasks')
      .then((r) => r.json())
      .then((d) => setTasks(d.tasks || []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListTodo className="h-5 w-5 text-primary-400" />
          <h2 className="text-2xl font-bold text-white">Task Marketplace</h2>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Post Task
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="available">Available Tasks</TabsTrigger>
          <TabsTrigger value="applications">My Applications</TabsTrigger>
          <TabsTrigger value="delivery">Delivery Status</TabsTrigger>
        </TabsList>

        {/* Available Tasks */}
        <TabsContent value="available">
          {loading ? (
            <div className="flex items-center justify-center min-h-[200px]"><p className="text-surface-400 text-sm">Loading...</p></div>
          ) : _tasks.filter((t) => t.status === 'open').length === 0 ? (
            <div className="flex items-center justify-center min-h-[200px]"><p className="text-surface-400 text-sm">No tasks found</p></div>
          ) : (
          <div className="space-y-4">
            {_tasks.filter((t) => t.status === 'open').map((task) => (
              <Card key={task.id} className="bg-surface-800/70 backdrop-blur border-surface-700/50">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-white">{task.title}</h3>
                        <Badge className={getTaskStatusColor(task.status)}>
                          {task.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-sm text-surface-300 line-clamp-2">{task.description}</p>

                      <div className="flex flex-wrap gap-4 text-xs text-surface-400">
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5" />
                          {formatCurrency(task.paymentAmount)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {task.estimatedHours}h estimated
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Due {new Date(task.deadline).toLocaleDateString('en-ZA')}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileOutput className="h-3.5 w-3.5" />
                          {getFormatLabel(task.deliverableFormat)}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {task.requiredTools.map((tool) => (
                          <Badge key={tool} variant="outline" className="text-xs border-primary-700/50 text-primary-400">
                            <Wrench className="h-3 w-3 mr-1" />
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Button variant="outline" size="sm">
                      Apply
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          )}
        </TabsContent>

        {/* Applications */}
        <TabsContent value="applications">
          <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
            <CardHeader>
              <CardTitle className="text-white text-base">Application Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-900/50 border border-surface-700/30">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  <div>
                    <p className="text-sm font-medium text-white">Structural Load Calculation</p>
                    <p className="text-xs text-surface-400">Applied 2 days ago</p>
                  </div>
                </div>
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Pending</Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-900/50 border border-surface-700/30">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-blue-400" />
                  <div>
                    <p className="text-sm font-medium text-white">Fire Safety Drawing Review</p>
                    <p className="text-xs text-surface-400">Accepted — In Progress</p>
                  </div>
                </div>
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Accepted</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Delivery Status */}
        <TabsContent value="delivery">
          <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
            <CardHeader>
              <CardTitle className="text-white text-base">Delivery & Sign-Off</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-surface-900/50 border border-surface-700/30 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-white">Fire Safety Drawing Review</h4>
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">In Progress</Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-surface-400">
                  <span className="flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Submission 1 of 4
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    AI Review: Pending
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="gap-1.5">
                    <Upload className="h-3.5 w-3.5" />
                    Submit Deliverable
                  </Button>
                  <Button size="sm" variant="outline" disabled>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Sign Off
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}


