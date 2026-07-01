import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Package,
  Plus,
  Search,
  Clock,
  MapPin,
  DollarSign,
  FileCheck,
  Send,
  Filter,
} from 'lucide-react';
import type { UserProfile } from '@/types';
import type { MaterialListing, QuoteRequest } from '../types';

interface SupplierMarketplaceProps {
  user: UserProfile;
}

const mockListings: MaterialListing[] = [
  {
    id: 'mat-1',
    supplierId: 'supplier-1',
    productName: 'Concrete Roof Tiles — Marley Modern',
    description: 'SANS 542 compliant concrete roof tiles. Available in charcoal, terracotta, and slate grey.',
    sansComplianceReference: 'SANS 542',
    leadTimeDays: 14,
    warrantyTerms: '30-year structural warranty; 15-year colour warranty',
    deliveryZones: ['Gauteng', 'North West', 'Mpumalanga'],
    unitPriceZar: 12.50,
    certificationDocuments: [
      { fileId: 'cert-1', fileName: 'SANS-542-certificate.pdf', format: 'pdf', sizeBytes: 245000 },
    ],
    status: 'active',
    createdAt: '2026-05-20T09:00:00.000Z',
  },
  {
    id: 'mat-2',
    supplierId: 'supplier-2',
    productName: 'Structural Steel — IPE 200',
    description: 'Hot-rolled structural steel IPE 200 sections. SANS 1431 grade 300W.',
    sansComplianceReference: 'SANS 1431',
    leadTimeDays: 7,
    warrantyTerms: 'Material certification provided per batch. No warranty on fabrication.',
    deliveryZones: ['Gauteng', 'Western Cape', 'KwaZulu-Natal'],
    unitPriceZar: 3850.00,
    certificationDocuments: [
      { fileId: 'cert-2', fileName: 'mill-certificate.pdf', format: 'pdf', sizeBytes: 180000 },
      { fileId: 'cert-3', fileName: 'test-report.pdf', format: 'pdf', sizeBytes: 320000 },
    ],
    status: 'active',
    createdAt: '2026-06-01T11:00:00.000Z',
  },
  {
    id: 'mat-3',
    supplierId: 'supplier-3',
    productName: 'Fire-Rated Drywall — 60min FRL',
    description: 'Fire-rated gypsum board achieving 60-minute fire resistance. SANS 10400-T compliant system.',
    sansComplianceReference: 'SANS 10400-T',
    leadTimeDays: 5,
    warrantyTerms: '10-year product warranty subject to correct installation per manufacturer spec.',
    deliveryZones: ['Gauteng', 'Western Cape', 'Free State', 'KwaZulu-Natal'],
    unitPriceZar: 285.00,
    certificationDocuments: [
      { fileId: 'cert-4', fileName: 'fire-test-report.pdf', format: 'pdf', sizeBytes: 520000 },
    ],
    status: 'active',
    createdAt: '2026-06-05T14:30:00.000Z',
  },
];

function formatCurrency(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

export default function SupplierMarketplace({ user }: SupplierMarketplaceProps) {
  const [activeTab, setActiveTab] = useState('browse');
  const [searchText, setSearchText] = useState('');
  const [_listings] = useState<MaterialListing[]>(mockListings);

  const filteredListings = _listings.filter((listing) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      listing.productName.toLowerCase().includes(q) ||
      listing.sansComplianceReference.toLowerCase().includes(q) ||
      listing.deliveryZones.some((z) => z.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-primary-400" />
          <h2 className="text-2xl font-bold text-white">Supplier & Material Marketplace</h2>
        </div>
        {user.role === 'supplier' && (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            List Material
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="browse">Browse Materials</TabsTrigger>
          <TabsTrigger value="quotes">Quote Requests</TabsTrigger>
          {user.role === 'supplier' && (
            <TabsTrigger value="my-listings">My Listings</TabsTrigger>
          )}
        </TabsList>

        {/* Browse Materials */}
        <TabsContent value="browse">
          <div className="space-y-4">
            {/* Search & Filter */}
            <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
                    <Input
                      placeholder="Search by product name, SANS reference, or zone..."
                      className="pl-10 bg-surface-900/50 border-surface-700/50"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Filter className="h-3.5 w-3.5" />
                      SANS Ref
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      Zone
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Lead Time
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Material Listings */}
            {filteredListings.map((listing) => (
              <Card key={listing.id} className="bg-surface-800/70 backdrop-blur border-surface-700/50">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-white">{listing.productName}</h3>
                        <Badge variant="outline" className="text-xs border-surface-600 text-surface-300">
                          {listing.sansComplianceReference}
                        </Badge>
                      </div>
                      <p className="text-sm text-surface-300 line-clamp-2">{listing.description}</p>

                      <div className="flex flex-wrap gap-4 text-xs text-surface-400">
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5" />
                          {formatCurrency(listing.unitPriceZar)} / unit
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {listing.leadTimeDays} day lead time
                        </span>
                        <span className="flex items-center gap-1">
                          <FileCheck className="h-3.5 w-3.5" />
                          {listing.certificationDocuments.length} cert(s)
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {listing.deliveryZones.map((zone) => (
                          <Badge key={zone} variant="outline" className="text-xs border-surface-600 text-surface-300">
                            <MapPin className="h-3 w-3 mr-1" />
                            {zone}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Send className="h-3.5 w-3.5" />
                      Request Quote
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Quote Requests */}
        <TabsContent value="quotes">
          <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
            <CardHeader>
              <CardTitle className="text-white text-base">Quote Request Panel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-4 rounded-lg bg-surface-900/50 border border-surface-700/30 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-white">Concrete Roof Tiles — 2,400 units</h4>
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Pending</Badge>
                </div>
                <p className="text-xs text-surface-400">
                  Linked to: Sandton Phase 2 · Delivery: Gauteng · Requested 3 days ago
                </p>
                <p className="text-xs text-surface-500">Expires in 4 days</p>
              </div>
              <div className="p-4 rounded-lg bg-surface-900/50 border border-surface-700/30 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-white">Structural Steel IPE 200 — 12 lengths</h4>
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Quoted</Badge>
                </div>
                <p className="text-xs text-surface-400">
                  Quoted: R 46,200.00 · Delivery: 7 days · Valid 4 more days
                </p>
                <div className="flex gap-2 pt-1">
                  <Button size="sm">Accept Quote</Button>
                  <Button size="sm" variant="outline">Decline</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* My Listings (Supplier only) */}
        {user.role === 'supplier' && (
          <TabsContent value="my-listings">
            <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
              <CardContent className="p-8 text-center">
                <Package className="h-10 w-10 text-surface-500 mx-auto mb-3" />
                <p className="text-surface-400">Your material listings will appear here.</p>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
