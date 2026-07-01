import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Search,
  Filter,
  MapPin,
  Shield,
  CheckCircle2,
  AlertCircle,
  Wrench,
  Award,
  BookOpen,
  X,
} from 'lucide-react';
import type { UserProfile } from '@/types';
import type {
  ComplianceSearchResult,
  AutoSuggestion,
  ComplianceSearchQuery,
} from '../types';

interface ComplianceSearchProps {
  user: UserProfile;
}

const mockSuggestions: AutoSuggestion[] = [
  { type: 'tool', label: 'Structural Load Calculator', value: 'structural-load-calculator' },
  { type: 'tool', label: 'Fenestration Analyser', value: 'fenestration-analyser' },
  { type: 'sans_clause', label: 'SANS 10400-K (Walls)', value: 'SANS 10400-K' },
  { type: 'sans_clause', label: 'SANS 10400-N (Glazing)', value: 'SANS 10400-N' },
  { type: 'discipline', label: 'Structural Engineering', value: 'structural-engineering' },
  { type: 'region', label: 'Gauteng', value: 'gauteng' },
  { type: 'region', label: 'Western Cape', value: 'western-cape' },
];

const mockResults: ComplianceSearchResult[] = [
  {
    userId: 'prof-1',
    displayName: 'Thandi Mokoena Pr.Eng',
    registrationNumber: 'ECSA-2019-4521',
    cpdStatus: 'compliant',
    trustScore: 94,
    toolUsageHistory: { 'structural-load-calculator': 42, 'fenestration-analyser': 18 },
    municipalApprovalCount: 31,
    disputeCount: 0,
    badges: ['top_10_percent'],
  },
  {
    userId: 'prof-2',
    displayName: 'Johan van der Merwe Pr.Arch',
    registrationNumber: 'SACAP-2017-8834',
    cpdStatus: 'compliant',
    trustScore: 88,
    toolUsageHistory: { 'structural-load-calculator': 12, 'fenestration-analyser': 25, 'energy-compliance-tool': 30 },
    municipalApprovalCount: 22,
    disputeCount: 0,
    badges: [],
  },
  {
    userId: 'prof-3',
    displayName: 'Naledi Khumalo Pr.Eng',
    registrationNumber: 'ECSA-2020-1127',
    cpdStatus: 'compliant',
    trustScore: 82,
    toolUsageHistory: { 'structural-load-calculator': 8, 'fire-safety-analyser': 14 },
    municipalApprovalCount: 15,
    disputeCount: 0,
    badges: [],
  },
];

function getSuggestionTypeColor(type: AutoSuggestion['type']): string {
  switch (type) {
    case 'tool': return 'bg-primary-500/20 text-primary-400 border-primary-500/30';
    case 'sans_clause': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'discipline': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'region': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  }
}

function getSuggestionTypeLabel(type: AutoSuggestion['type']): string {
  switch (type) {
    case 'tool': return 'Tool';
    case 'sans_clause': return 'SANS';
    case 'discipline': return 'Discipline';
    case 'region': return 'Region';
  }
}

export default function ComplianceSearch({ user }: ComplianceSearchProps) {
  const [searchText, setSearchText] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<AutoSuggestion[]>([]);
  const [results] = useState<ComplianceSearchResult[]>(mockResults);

  const filteredSuggestions = searchText.length >= 2
    ? mockSuggestions.filter((s) =>
        s.label.toLowerCase().includes(searchText.toLowerCase())
      ).slice(0, 10)
    : [];

  const handleSelectSuggestion = (suggestion: AutoSuggestion) => {
    if (!selectedFilters.find((f) => f.value === suggestion.value)) {
      setSelectedFilters([...selectedFilters, suggestion]);
    }
    setSearchText('');
    setShowSuggestions(false);
  };

  const handleRemoveFilter = (value: string) => {
    setSelectedFilters(selectedFilters.filter((f) => f.value !== value));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Search className="h-5 w-5 text-primary-400" />
        <h2 className="text-2xl font-bold text-white">Compliance Search</h2>
      </div>

      {/* Search Input with Auto-suggestions */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
            <Input
              placeholder="Search professionals by tool, SANS reference, discipline, or region..."
              className="pl-10 bg-surface-900/50 border-surface-700/50"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setShowSuggestions(e.target.value.length >= 2);
              }}
              onFocus={() => {
                if (searchText.length >= 2) setShowSuggestions(true);
              }}
              onBlur={() => {
                // Delay to allow click on suggestions
                setTimeout(() => setShowSuggestions(false), 200);
              }}
            />

            {/* Auto-suggestion dropdown */}
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-surface-800 border border-surface-700/50 rounded-lg shadow-xl overflow-hidden">
                {filteredSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.value}
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-700/50 transition-colors text-left"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectSuggestion(suggestion);
                    }}
                  >
                    <span className="text-sm text-white">{suggestion.label}</span>
                    <Badge className={`text-[10px] ${getSuggestionTypeColor(suggestion.type)}`}>
                      {getSuggestionTypeLabel(suggestion.type)}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Active filters */}
          {selectedFilters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedFilters.map((filter) => (
                <Badge
                  key={filter.value}
                  className={`gap-1 ${getSuggestionTypeColor(filter.type)}`}
                >
                  {filter.label}
                  <button
                    type="button"
                    onClick={() => handleRemoveFilter(filter.value)}
                    className="ml-1 hover:opacity-80"
                    aria-label={`Remove ${filter.label} filter`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setSelectedFilters([])}
              >
                Clear all
              </Button>
            </div>
          )}

          {/* Filter buttons */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              Tools
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              SANS Refs
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              Region
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              Min Trust Score
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      <div className="space-y-4">
        <p className="text-sm text-surface-400">
          {results.length} professional{results.length !== 1 ? 's' : ''} found — sorted by Trust Score
        </p>

        {results.map((result) => (
          <Card key={result.userId} className="bg-surface-800/70 backdrop-blur border-surface-700/50">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  {/* Name and badges */}
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-white">{result.displayName}</h3>
                    {result.badges.includes('top_10_percent') && (
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1">
                        <Award className="h-3 w-3" />
                        Top 10%
                      </Badge>
                    )}
                  </div>

                  {/* Key info row */}
                  <div className="flex flex-wrap gap-4 text-xs text-surface-400">
                    <span className="flex items-center gap-1">
                      <Shield className="h-3.5 w-3.5 text-primary-400" />
                      Trust Score: <strong className="text-white ml-0.5">{result.trustScore}</strong>
                    </span>
                    <span className="flex items-center gap-1 font-mono text-surface-300">
                      {result.registrationNumber}
                    </span>
                    <span className="flex items-center gap-1">
                      {result.cpdStatus === 'compliant' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                      )}
                      CPD: {result.cpdStatus === 'compliant' ? 'Compliant' : 'Non-Compliant'}
                    </span>
                    <span className="flex items-center gap-1">
                      Municipal approvals: {result.municipalApprovalCount}
                    </span>
                    <span className="flex items-center gap-1">
                      Disputes: {result.disputeCount}
                    </span>
                  </div>

                  {/* Tool usage */}
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(result.toolUsageHistory).map(([tool, count]) => (
                      <Badge key={tool} variant="outline" className="text-xs border-primary-700/50 text-primary-400">
                        <Wrench className="h-3 w-3 mr-1" />
                        {tool}: {count} uses
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Trust Score badge (large) */}
                <div className="flex flex-col items-center p-3 rounded-lg bg-surface-900/50 border border-surface-700/30 min-w-[80px]">
                  <span className="text-2xl font-bold text-primary-400">{result.trustScore}</span>
                  <span className="text-[10px] uppercase tracking-wider text-surface-400">Trust</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
