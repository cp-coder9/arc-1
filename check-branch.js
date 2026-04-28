import { execSync } from 'child_process';

console.log('=== Git Branch Comparison: main vs municipal-tracker ===\n');

try {
  // Get commits in municipal-tracker but not in main
  console.log('📋 COMMITS in municipal-tracker but NOT in main:\n');
  try {
    const commits = execSync('git log main..municipal-tracker --oneline', { 
      cwd: process.cwd(),
      encoding: 'utf-8' 
    });
    console.log(commits || '(No commits ahead of main)');
  } catch (e) {
    console.log('Error getting commits:', e.message);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Get changed files stats
  console.log('📁 CHANGED FILES (stat):\n');
  try {
    const stats = execSync('git diff main..municipal-tracker --stat', { 
      cwd: process.cwd(),
      encoding: 'utf-8' 
    });
    console.log(stats || '(No file changes)');
  } catch (e) {
    console.log('Error getting stats:', e.message);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Get detailed diff summary
  console.log('🔍 DETAILED DIFF:\n');
  try {
    const diff = execSync('git diff main..municipal-tracker --name-status', { 
      cwd: process.cwd(),
      encoding: 'utf-8' 
    });
    console.log(diff || '(No diff)');
  } catch (e) {
    console.log('Error getting diff:', e.message);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Show branch info
  console.log('🌿 BRANCH INFO:\n');
  try {
    const info = execSync('git branch -v', { 
      cwd: process.cwd(),
      encoding: 'utf-8' 
    });
    console.log(info);
  } catch (e) {
    console.log('Error getting branch info:', e.message);
  }

} catch (error) {
  console.error('Failed to run git commands:', error.message);
  process.exit(1);
}
