import { chromium, Browser, Page } from 'playwright';

export interface SACAPVerificationResult {
  verified: boolean;
  registrationDetails?: {
    firstName: string;
    lastName: string;
    category: string;
  };
  error?: string;
}

/**
 * Service to verify SACAP registration by scraping the official registry.
 */
export async function verifySACAPRegistration(name: string): Promise<SACAPVerificationResult> {
  if (!name || name.length < 3) {
    return { verified: false, error: 'Name must be at least 3 characters long' };
  }

  const browser: Browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page: Page = await browser.newPage();

    // Set a reasonable timeout
    page.setDefaultTimeout(30000);

    console.log(`[SACAP Service] Verifying: ${name}`);
    await page.goto('https://search.mymembership.co.za/Search/?Id=4f3f0fde-d5dc-4af0-97cd-0a192a56830e', {
      waitUntil: 'networkidle'
    });

    // Fill search box
    await page.fill('#WildCardSearch', name);

    // Click Search
    await page.click('#butSubmit');

    // Wait for the results table to appear
    try {
      await page.waitForSelector('.table tr td', { timeout: 15000 });
    } catch (e) {
      console.log(`[SACAP Service] No results found for: ${name}`);
      return { verified: false };
    }

    // Extract results
    const results = await page.$$eval('.table tr', rows => {
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        return cells.map(cell => cell.innerText.trim());
      }).filter(row => row.length >= 3);
    });

    console.log(`[SACAP Service] Found ${results.length} potential matches`);

    // Basic fuzzy match: check if the name parts are present in the results
    const nameParts = name.toLowerCase().split(' ').filter(p => p.length > 1);

    for (const row of results) {
      const firstName = row[0];
      const lastName = row[1];
      const category = row[2];

      const fullName = `${firstName} ${lastName}`.toLowerCase();

      // If all parts of the search name are in the full name found
      const isMatch = nameParts.every(part => fullName.includes(part));

      if (isMatch) {
        console.log(`[SACAP Service] Verified match: ${firstName} ${lastName} (${category})`);
        return {
          verified: true,
          registrationDetails: {
            firstName,
            lastName,
            category
          }
        };
      }
    }

    return { verified: false };
  } catch (error: any) {
    console.error(`[SACAP Service] Error during verification:`, error);
    return { verified: false, error: error.message };
  } finally {
    await browser.close();
  }
}
