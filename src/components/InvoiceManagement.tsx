import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, orderBy, getDoc } from 'firebase/firestore';
import { UserProfile, Job, Invoice, InvoiceItem } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from './ui/dialog';
import { toast } from 'sonner';
import { Plus, Receipt, Download, Send, Clock, CheckCircle2, AlertCircle, FileText, Loader2, Trash2 } from 'lucide-react';
import { pdfGenerationService } from '../services/pdfGenerationService';
import { notificationService } from '../services/notificationService';
import { format } from 'date-fns';

interface InvoiceManagementProps {
  user: UserProfile;
}

export default function InvoiceManagement({ user }: InvoiceManagementProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);

  // Form State
  const [selectedJobId, setSelectedJobId] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([{ description: '', quantity: 1, unitPrice: 0, total: 0 }]);
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'));

  useEffect(() => {
    // Invoices list
    const qInvoices = user.role === 'admin'
      ? query(collection(db, 'invoices'), orderBy('createdAt', 'desc'))
      : user.role === 'architect' 
        ? query(collection(db, 'invoices'), where('architectId', '==', user.uid), orderBy('createdAt', 'desc'))
        : query(collection(db, 'invoices'), where('clientId', '==', user.uid), orderBy('createdAt', 'desc'));

    const unsubInvoices = onSnapshot(qInvoices, (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));
      setLoading(false);
    });

    // My jobs (to select for new invoice)
    if (user.role === 'architect' || user.role === 'admin') {
      const qJobs = user.role === 'admin'
        ? query(collection(db, 'jobs'))
        : query(collection(db, 'jobs'), where('selectedArchitectId', '==', user.uid));
        
      const unsubJobs = onSnapshot(qJobs, (snapshot) => {
        setMyJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job)));
      });
      return () => {
        unsubInvoices();
        unsubJobs();
      };
    }

    return () => unsubInvoices();
  }, [user.uid, user.role]);

  const handleAddItem = () => {
    setItems([...items, { description: '', quantity: 1, unitPrice: 0, total: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'unitPrice') {
      item.total = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    }
    
    newItems[index] = item;
    setItems(newItems);
  };

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const taxRate = 15; // 15% VAT (ZA)
  const taxAmount = (subtotal * taxRate) / 100;
  const totalAmount = subtotal + taxAmount;

  const handleCreateInvoice = async () => {
    if (!selectedJobId) {
      toast.error('Please select a job');
      return;
    }
    if (items.some(item => !item.description || item.total <= 0)) {
      toast.error('Please complete all invoice items');
      return;
    }

    try {
      const job = myJobs.find(j => j.id === selectedJobId);
      if (!job) return;

      const invoiceData: Omit<Invoice, 'id'> = {
        invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
        jobId: selectedJobId,
        clientId: job.clientId,
        architectId: user.role === 'admin' ? (job.selectedArchitectId || user.uid) : user.uid,
        items,
        subtotal,
        taxAmount,
        taxRate,
        totalAmount,
        currency: 'R',
        status: 'draft',
        dueDate,
        notes,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'invoices'), invoiceData);
      
      toast.success('Invoice created as draft');
      setIsCreateModalOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast.error('Failed to create invoice');
    }
  };

  const resetForm = () => {
    setSelectedJobId('');
    setItems([{ description: '', quantity: 1, unitPrice: 0, total: 0 }]);
    setNotes('');
    setDueDate(format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'));
  };

  const handleSendInvoice = async (invoice: Invoice) => {
    try {
      setGeneratingPdfId(invoice.id);
      
      // 1. Generate PDF
      const { url } = await pdfGenerationService.generateInvoicePDF(invoice, user.uid);
      
      // 2. Update Invoice
      await updateDoc(doc(db, 'invoices', invoice.id), {
        status: 'sent',
        pdfUrl: url,
        updatedAt: new Date().toISOString()
      });

      // 3. Notify Client
      await notificationService.notifyInvoiceSent(invoice.clientId, invoice.invoiceNumber, invoice.totalAmount, invoice.jobId);

      toast.success(`Invoice ${invoice.invoiceNumber} sent to client`);
    } catch (error) {
      console.error('Error sending invoice:', error);
      toast.error('Failed to send invoice');
    } finally {
      setGeneratingPdfId(null);
    }
  };

  const handleMarkAsPaid = async (invoice: Invoice) => {
    try {
      await updateDoc(doc(db, 'invoices', invoice.id), {
        status: 'paid',
        paidAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await notificationService.notifyInvoicePaid(invoice.architectId, invoice.invoiceNumber, invoice.jobId);
      
      toast.success('Invoice marked as paid');
    } catch (error) {
      console.error('Error updating invoice status:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge className="bg-green-500/10 text-green-500 border-green-500/20 px-3 py-1 rounded-full uppercase text-[10px] tracking-widest font-bold">Paid</Badge>;
      case 'sent': return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 px-3 py-1 rounded-full uppercase text-[10px] tracking-widest font-bold">Sent</Badge>;
      case 'overdue': return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 px-3 py-1 rounded-full uppercase text-[10px] tracking-widest font-bold">Overdue</Badge>;
      case 'cancelled': return <Badge variant="secondary" className="px-3 py-1 rounded-full uppercase text-[10px] tracking-widest font-bold">Cancelled</Badge>;
      default: return <Badge variant="outline" className="px-3 py-1 rounded-full uppercase text-[10px] tracking-widest font-bold">Draft</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-8 rounded-[2rem] border border-border">
        <div>
          <h2 className="text-3xl font-heading font-bold tracking-tight flex items-center gap-3">
            <Receipt className="text-primary w-8 h-8" />
            Invoice Management
          </h2>
          <p className="text-muted-foreground mt-1">Track payments and issue invoices for your projects.</p>
        </div>

        {(user.role === 'architect' || user.role === 'admin') && (
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger render={
              <Button className="rounded-full px-6 h-12 font-bold shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90">
                <Plus className="mr-2 w-5 h-5" />
                Create Invoice
              </Button>
            } />
            <DialogContent className="max-w-3xl rounded-[2rem]">
              <DialogHeader>
                <DialogTitle className="text-2xl font-heading font-bold">New Invoice</DialogTitle>
                <DialogDescription>Create a professional invoice for your client.</DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Select Project</label>
                    <select 
                      className="w-full h-12 bg-secondary/50 border border-border rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      value={selectedJobId}
                      onChange={(e) => setSelectedJobId(e.target.value)}
                    >
                      <option value="">Choose a project...</option>
                      {myJobs.map(job => (
                        <option key={job.id} value={job.id}>{job.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Due Date</label>
                    <Input 
                      type="date" 
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="h-12 rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Invoice Items</label>
                    <Button variant="ghost" size="sm" onClick={handleAddItem} className="text-primary font-bold">
                      <Plus className="w-4 h-4 mr-1" /> Add Item
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {items.map((item, index) => (
                      <div key={index} className="flex gap-3 items-start animate-in fade-in slide-in-from-top-2">
                        <div className="flex-1">
                          <Input 
                            placeholder="Description" 
                            className="h-11 rounded-xl"
                            value={item.description}
                            onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                          />
                        </div>
                        <div className="w-20">
                          <Input 
                            type="number" 
                            placeholder="Qty" 
                            className="h-11 rounded-xl"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))}
                          />
                        </div>
                        <div className="w-32">
                          <Input 
                            type="number" 
                            placeholder="Price" 
                            className="h-11 rounded-xl"
                            value={item.unitPrice}
                            onChange={(e) => handleItemChange(index, 'unitPrice', Number(e.target.value))}
                          />
                        </div>
                        <div className="w-32 flex items-center px-4 bg-secondary/30 rounded-xl h-11 text-sm font-bold">
                          R {item.total.toLocaleString()}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-11 w-11 rounded-xl text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveItem(index)}
                          disabled={items.length === 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pr-12">
                   <div className="w-64 space-y-2 p-4 bg-secondary/30 rounded-2xl border border-border">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal:</span>
                        <span className="font-bold">R {subtotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">VAT ({taxRate}%):</span>
                        <span className="font-bold">R {taxAmount.toLocaleString()}</span>
                      </div>
                      <div className="pt-2 border-t border-border flex justify-between">
                        <span className="font-heading font-bold">TOTAL:</span>
                        <span className="font-heading font-bold text-primary">R {totalAmount.toLocaleString()}</span>
                      </div>
                   </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Internal Notes (Optional)</label>
                  <Input 
                    placeholder="e.g. Bank details, references..." 
                    className="h-12 rounded-xl"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateModalOpen(false)} className="rounded-full px-8">Cancel</Button>
                <Button onClick={handleCreateInvoice} className="rounded-full px-8 bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
                  Create Draft
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard icon={<Receipt className="text-blue-500" />} label="Total Invoiced" value={`R ${invoices.reduce((sum, inv) => sum + inv.totalAmount, 0).toLocaleString()}`} />
        <StatsCard icon={<CheckCircle2 className="text-green-500" />} label="Total Paid" value={`R ${invoices.filter(i => i.status === 'paid').reduce((sum, inv) => sum + inv.totalAmount, 0).toLocaleString()}`} />
        <StatsCard icon={<Clock className="text-orange-500" />} label="Pending" value={`R ${invoices.filter(i => i.status === 'sent').reduce((sum, inv) => sum + inv.totalAmount, 0).toLocaleString()}`} />
        <StatsCard icon={<AlertCircle className="text-red-500" />} label="Overdue" value={`R ${invoices.filter(i => i.status === 'overdue').reduce((sum, inv) => sum + inv.totalAmount, 0).toLocaleString()}`} />
      </div>

      <Card className="rounded-[2.5rem] border-border shadow-sm overflow-hidden">
        <CardHeader className="bg-secondary/10 px-10 py-8 border-b border-border">
          <CardTitle className="text-xl font-heading font-bold">All Invoices</CardTitle>
          <CardDescription>View and manage all your billing history.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary/30 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                <tr>
                  <th className="px-10 py-4">Invoice #</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Due Date</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-10 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-secondary/10 transition-colors group">
                    <td className="px-10 py-5">
                      <div className="font-bold flex items-center gap-2">
                        {invoice.invoiceNumber}
                        <FileText className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-[10px] text-muted-foreground">Created {new Date(invoice.createdAt).toLocaleDateString()}</p>
                    </td>
                    <td className="px-6 py-5">
                      {getStatusBadge(invoice.status)}
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm font-medium">{new Date(invoice.dueDate).toLocaleDateString('en-ZA', { dateStyle: 'medium' })}</p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-lg font-bold">R {invoice.totalAmount.toLocaleString()}</p>
                    </td>
                    <td className="px-10 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {invoice.pdfUrl && (
                          <Button variant="ghost" size="sm" className="rounded-full hover:bg-primary/5 hover:text-primary" onClick={() => window.open(invoice.pdfUrl, '_blank')}>
                            <Download className="w-4 h-4 mr-2" /> PDF
                          </Button>
                        )}
                        
                        {user.role === 'architect' && invoice.status === 'draft' && (
                          <Button 
                            size="sm" 
                            className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-4 font-bold"
                            onClick={() => handleSendInvoice(invoice)}
                            disabled={generatingPdfId === invoice.id}
                          >
                            {generatingPdfId === invoice.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                            Send to Client
                          </Button>
                        )}

                        {user.role === 'admin' && invoice.status === 'sent' && (
                          <Button size="sm" variant="outline" className="rounded-full border-green-500 text-green-500 hover:bg-green-50" onClick={() => handleMarkAsPaid(invoice)}>
                            Mark Paid
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-10 py-20 text-center text-muted-foreground italic">
                      No invoices found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatsCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <Card className="rounded-[1.5rem] border-border shadow-sm p-6 bg-white hover:border-primary/50 transition-colors group">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-secondary/50 rounded-2xl group-hover:bg-primary/10 transition-colors">
          {icon}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </div>
    </Card>
  );
}
