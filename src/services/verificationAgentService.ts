import { chromium, type Page } from 'playwright';
import { verifySACAPByName } from './sacapVerificationService';
import type { VerificationSource, VerificationStatus, VerificationSubjectType } from '../types';
import { inferVerificationProvider, normalizeRegistrationNumber, normalizeStatutoryBody, type ProviderVerificationResult, type VerificationProvider } from './userVerificationService';

export interface VerificationAgentInput {
  subjectType: VerificationSubjectType;
  statutoryBody?: string;
  registrationNumber?: string;
  displayName?: string;
  businessName?: string;
}

export interface VerificationAgentResult extends ProviderVerificationResult {
  checkedAt: string;
  officialUrl: string;
  searchMode: 'name' | 'registration_number' | 'business_name';
  requiresHumanReview?: boolean;
}

interface BrowserProviderConfig {
  provider: VerificationProvider;
  statutoryBody: string;
  officialUrl: string;
  source: VerificationSource;
  searchInputSelectors: string[];
  submitSelectors: string[];
  resultContainerSelectors: string[];
}

const PROVIDER_CONFIGS: Record<Exclude<VerificationProvider, 'sacap' | 'manual'>, BrowserProviderConfig> = {
  ecsa: {
    provider: 'ecsa',
    statutoryBody: 'ECSA',
    officialUrl: 'https://www.ecsa.co.za/registered-persons/',
    source: 'automated_browser_agent',
    searchInputSelectors: [
      'input[type="search"]',
      'input[placeholder*="Search" i]',
      'input[placeholder*="registration" i]',
      'input[name*="search" i]',
      'input[id*="search" i]',
      'input[type="text"]',
    ],
    submitSelectors: ['button[type="submit"]', 'button:has-text("Search")', 'input[type="submit"]'],
    resultContainerSelectors: ['table', '[role="table"]', '.table', '.results', '[class*="result" i]', 'body'],
  },
  cidb: {
    provider: 'cidb',
    statutoryBody: 'CIDB',
    officialUrl: 'https://portal.cidb.org.za/RegisterOfContractors/',
    source: 'automated_browser_agent',
    searchInputSelectors: [
      'input[type="search"]',
      'input[placeholder*="Search" i]',
      'input[placeholder*="contractor" i]',
      'input[name*="search" i]',
      'input[id*="search" i]',
    ],
    submitSelectors: ['button[type="submit"]', 'button:has-text("Search")', 'input[type="submit"]'],
    resultContainerSelectors: ['table', '[role="table"]', '.table', '.results', '[class*="result" i]'],
  },
  nhbrc: {
    provider: 'nhbrc',
    statutoryBody: 'NHBRC',
    officialUrl: 'https://www.eservices.nhbrc.org.za/Home/CertificateVerication',
    source: 'automated_browser_agent',
    searchInputSelectors: [
      'input[name*="Registration" i]',
      'input[name*="Company" i]',
      'input[id*="Registration" i]',
      'input[id*="Company" i]',
      'input[type="text"]',
    ],
    submitSelectors: ['button[type="submit"]', 'button:has-text("Search")', 'button:has-text("Verify")', 'input[type="submit"]'],
    resultContainerSelectors: ['table', '.table', '.results', '[class*="result" i]', 'body'],
  },
  cipc: {
    provider: 'cipc',
    statutoryBody: 'CIPC',
    officialUrl: 'https://www.cipc.co.za/?page_id=1649',
    source: 'automated_browser_agent',
    searchInputSelectors: [
      'input[type="search"]',
      'input[placeholder*="company" i]',
      'input[name*="company" i]',
      'input[name*="search" i]',
      'input[type="text"]',
    ],
    submitSelectors: ['button[type="submit"]', 'button:has-text("Search")', 'input[type="submit"]'],
    resultContainerSelectors: ['table', '.table', '.results', '[class*="result" i]', 'body'],
  },
};

function chooseSearchTerm(input: VerificationAgentInput): { term?: string; mode: VerificationAgentResult['searchMode'] } {
  const registrationNumber = normalizeRegistrationNumber(input.registrationNumber);
  if (registrationNumber) return { term: registrationNumber, mode: 'registration_number' };
  if (input.businessName?.trim()) return { term: input.businessName.trim(), mode: 'business_name' };
  if (input.displayName?.trim()) return { term: input.displayName.trim(), mode: 'name' };
  return { term: undefined, mode: 'registration_number' };
}

function canonicalRegistrationNumber(value?: string): string | undefined {
  return normalizeRegistrationNumber(value)?.toUpperCase();
}

function normalizeRegisterComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function firstVisible(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout: 2500 })) return locator;
    } catch {
      // Try the next selector.
    }
  }
  return null;
}

export function assessVerificationRegisterText(text: string, term: string): { status: VerificationStatus; requiresHumanReview: boolean } {
  const normalizedText = text.toLowerCase();
  const normalizedTerm = term.toLowerCase();
  const comparableText = normalizeRegisterComparable(text);
  const comparableTerm = normalizeRegisterComparable(term);
  const containsTerm = normalizedText.includes(normalizedTerm) || (comparableTerm.length >= 4 && comparableText.includes(comparableTerm));
  if (containsTerm && !normalizedText.includes('no record') && !normalizedText.includes('not found')) {
    return { status: 'verified', requiresHumanReview: false };
  }
  if (normalizedText.includes('no record') || normalizedText.includes('not found') || normalizedText.includes('no result')) {
    return { status: 'rejected', requiresHumanReview: false };
  }
  return { status: 'pending', requiresHumanReview: true };
}

async function runGenericBrowserProvider(config: BrowserProviderConfig, input: VerificationAgentInput): Promise<VerificationAgentResult> {
  const { term, mode } = chooseSearchTerm(input);
  const checkedAt = new Date().toISOString();
  if (!term) {
    return {
      provider: config.provider,
      status: 'pending',
      source: config.source,
      checkedAt,
      officialUrl: config.officialUrl,
      searchMode: mode,
      requiresHumanReview: true,
      error: 'A registration number, business name, or display name is required for automated browser verification.',
    };
  }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(config.officialUrl, { waitUntil: 'domcontentloaded' });

    const inputLocator = await firstVisible(page, config.searchInputSelectors);
    if (!inputLocator) {
      const title = await page.title().catch(() => 'Unknown title');
      return {
        provider: config.provider,
        status: 'pending',
        source: config.source,
        checkedAt,
        officialUrl: page.url() || config.officialUrl,
        searchMode: mode,
        requiresHumanReview: true,
        details: { title },
        error: `Verification agent could not locate a search input on the official ${config.statutoryBody} page.`,
      };
    }

    await inputLocator.fill(term);
    const submitLocator = await firstVisible(page, config.submitSelectors);
    if (submitLocator) {
      await Promise.allSettled([
        page.waitForLoadState('networkidle', { timeout: 15000 }),
        submitLocator.click(),
      ]);
    } else {
      await inputLocator.press('Enter');
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    }

    let resultText = '';
    for (const selector of config.resultContainerSelectors) {
      const locator = page.locator(selector).first();
      try {
        if (await locator.isVisible({ timeout: 5000 })) {
          resultText = (await locator.innerText({ timeout: 5000 })).slice(0, 5000);
          break;
        }
      } catch {
        // Try next result container.
      }
    }
    if (!resultText) resultText = (await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')).slice(0, 5000);

    const score = assessVerificationRegisterText(resultText, term);
    return {
      provider: config.provider,
      status: score.status,
      source: config.source,
      checkedAt,
      officialUrl: page.url() || config.officialUrl,
      searchMode: mode,
      requiresHumanReview: score.requiresHumanReview,
      details: {
        searchTerm: term,
        statutoryBody: config.statutoryBody,
        resultExcerpt: resultText.slice(0, 1200),
      },
    };
  } catch (error: any) {
    return {
      provider: config.provider,
      status: 'pending',
      source: config.source,
      checkedAt,
      officialUrl: config.officialUrl,
      searchMode: mode,
      requiresHumanReview: true,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await browser.close();
  }
}

export async function runVerificationBrowserAgent(input: VerificationAgentInput): Promise<VerificationAgentResult> {
  const provider = inferVerificationProvider({ subjectType: input.subjectType, statutoryBody: input.statutoryBody });
  const checkedAt = new Date().toISOString();
  if (provider === 'sacap') {
    const name = input.displayName?.trim();
    if (!name) {
      return {
        provider: 'sacap',
        status: 'pending',
        source: 'automated_browser_agent',
        checkedAt,
        officialUrl: 'https://search.mymembership.co.za/Search/?Id=4f3f0fde-d5dc-4af0-97cd-0a192a56830e',
        searchMode: 'name',
        requiresHumanReview: true,
        error: 'A full display name is required for SACAP browser verification.',
      };
    }
    const result = await verifySACAPByName(name);
    const requestedRegistration = canonicalRegistrationNumber(input.registrationNumber);
    const resultRegistration = canonicalRegistrationNumber(result.registrationDetails?.registrationNumber);
    const registrationMatches = !requestedRegistration || !resultRegistration || requestedRegistration === resultRegistration;
    const verified = result.verified === true && registrationMatches;
    return {
      provider: 'sacap',
      status: verified ? 'verified' : 'pending',
      source: 'automated_browser_agent',
      checkedAt,
      officialUrl: 'https://search.mymembership.co.za/Search/?Id=4f3f0fde-d5dc-4af0-97cd-0a192a56830e',
      searchMode: 'name',
      requiresHumanReview: !verified,
      details: { ...result.registrationDetails, registrationMatches, searchedName: name },
      error: result.error,
    };
  }

  if (provider === 'manual') {
    return {
      provider,
      status: 'pending',
      source: 'automated_browser_agent',
      checkedAt,
      officialUrl: 'unconfigured',
      searchMode: 'registration_number',
      requiresHumanReview: true,
      error: 'No official browser verification target is configured for this verification subject.',
    };
  }

  return runGenericBrowserProvider(PROVIDER_CONFIGS[provider], input);
}
