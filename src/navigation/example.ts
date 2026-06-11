/**
 * Example usage of the Architex Navigation Framework
 */
import { architexNavigation } from './architexNavigationConfig';
import { getDefaultPageForNavKey, getPagesForNavKey } from './navDashboardAdapter';
import type { NavigationItem } from './navTypes';

// Navigation config usage
const allNavItems: NavigationItem[] = architexNavigation;
const commandCentre = allNavItems.find((item) => item.key === 'command_centre');
const cpdDefault = getDefaultPageForNavKey('cpd_learning');
const projectPages = getPagesForNavKey('projects');

console.log('Command Centre sections:', commandCentre?.sections.map((s) => s.label));
console.log('CPD landing page:', cpdDefault);
console.log('Project pages:', projectPages);
