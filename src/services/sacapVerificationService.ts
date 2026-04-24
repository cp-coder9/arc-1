import { chromium, Browser, Page } from 'playwright';

export interface SACAPVerificationResult {
  verified: boolean;
  registrationDetails?: {
    firstName: string;
    lastName: string;
    category: string;
    registrationNumber?: string;
  };
  error?: string;
}

/**
 * Service to verify SACAP registration by scraping the official registry.
 */
export async function verifySACAPRegistration(firstName: string, lastName: string): Promise<SACAPVerificationResult> {
  const fullName = `${firstName} ${lastName}`.trim();

  if (!firstName || firstName.length < 2 || !lastName || lastName.length < 2) {
    return { verified: false, error: 'First name and last name are required' };
  }

  const browser: Browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page: Page = await browser.newPage();

    // Set a reasonable timeout
    page.setDefaultTimeout(30000);

    console.log(`[SACAP Service] Verifying: ${fullName}`);
    await page.goto('https://search.mymembership.co.za/Search/?Id=4f3f0fde-d5dc-4af0-97cd-0a192a56830e', {
      waitUntil: 'networkidle'
    });

    // Fill search box with full name
    await page.fill('#WildCardSearch', fullName);

    // Click Search
    await page.click('#butSubmit');

    // Wait for the results table to appear
    try {
      await page.waitForSelector('.table tr td', { timeout: 15000 });
    } catch (e) {
      console.log(`[SACAP Service] No results found for: ${fullName}`);
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

    // Normalize search names
    const searchFirstName = firstName.toLowerCase().trim();
    const searchLastName = lastName.toLowerCase().trim();

    // Look for exact or close match
    for (const row of results) {
      const resultFirstName = row[0]?.toLowerCase().trim() || '';
      const resultLastName = row[1]?.toLowerCase().trim() || '';
      const category = row[2];
      const registrationNumber = row[3] || '';

      // Check for exact match of first and last name
      const firstNameMatch = resultFirstName === searchFirstName || resultFirstName.includes(searchFirstName);
      const lastNameMatch = resultLastName === searchLastName || resultLastName.includes(searchLastName);

      if (firstNameMatch && lastNameMatch) {
        console.log(`[SACAP Service] Verified match: ${row[0]} ${row[1]} (${category})`);
        return {
          verified: true,
          registrationDetails: {
            firstName: row[0],
            lastName: row[1],
            category: category,
            registrationNumber
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

/**
 * Verify SACAP registration using display name (splits into first/last name)
 */
export async function verifySACAPByName(displayName: string): Promise<SACAPVerificationResult> {
  const nameParts = displayName.trim().split(/\s+/);

  if (nameParts.length < 2) {
    return { verified: false, error: 'Full name (first and last) is required' };
  }

  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');

  return verifySACAPRegistration(firstName, lastName);
}
