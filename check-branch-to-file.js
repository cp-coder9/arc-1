import { execSync } from 'child_process';
import fs from 'fs';

let output = '=== Git Branch Comparison: main vs municipal-tracker ===\n\n';

try {
  // Get commits in municipal-tracker but not in main
  output += '📋 COMMITS in municipal-tracker but NOT in main:\n\n';
  try {
    const commits = execSync('git log main..municipal-tracker --oneline', { 
      cwd: process.cwd(),
      encoding: 'utf-8' 
    });
    output += (commits || '(No commits ahead of main)') + '\n';
  } catch (e) {
    output += 'Error getting commits: ' + e.message + '\n';
  }

  output += '\n' + '='.repeat(60) + '\n\n';

  // Get changed files stats
  output += '📁 CHANGED FILES (stat):\n\n';
  try {
    const stats = execSync('git diff main..municipal-tracker --stat', { 
      cwd: process.cwd(),
      encoding: 'utf-8' 
    });
    output += (stats || '(No file changes)') + '\n';
  } catch (e) {
    output += 'Error getting stats: ' + e.message + '\n';
  }

  output += '\n' + '='.repeat(60) + '\n\n';

  // Get detailed diff summary
  output += '🔍 DETAILED DIFF (name-status):\n\n';
  try {
    const diff = execSync('git diff main..municipal-tracker --name-status', { 
      cwd: process.cwd(),
      encoding: 'utf-8' 
    });
    output += (diff || '(No diff)') + '\n';
  } catch (e) {
    output += 'Error getting diff: ' + e.message + '\n';
  }

  output += '\n' + '='.repeat(60) + '\n\n';

  // Show branch info
  output += '🌿 BRANCH INFO:\n\n';
  try {
    const info = execSync('git branch -v', { 
      cwd: process.cwd(),
      encoding: 'utf-8' 
    });
    output += info + '\n';
  } catch (e) {
    output += 'Error getting branch info: ' + e.message + '\n';
  }

  fs.writeFileSync('branch-diff-report.txt', output);
  console.log('Report saved to branch-diff-report.txt');

} catch (error) {
  console.error('Failed to run git commands:', error.message);
  process.exit(1);
}
