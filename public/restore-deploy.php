<?php
// RESTORE deploy script - fetches deploy-restore branch, copies dist to web root
header('Content-Type: text/plain');
$repo = '/home/archite4/public_html/architex.co.za/ai/repo';
$target = '/home/archite4/public_html/architex.co.za/ai/';

echo "=== Fetching deploy-restore branch ===\n";
chdir($repo);
echo shell_exec("git fetch origin deploy-restore 2>&1");
echo shell_exec("git checkout deploy-restore 2>&1");

if (!is_dir("$repo/dist")) {
    die("FAIL: no dist dir in repo\n");
}

echo "=== Copying dist to web root ===\n";
echo shell_exec("cp -r $repo/dist/* $target 2>&1");
echo shell_exec("cp $repo/dist/.htaccess $target 2>&1");

// Verify
$index = $target . 'index.html';
if (file_exists($index)) {
    echo "OK: index.html restored (" . filesize($index) . " bytes)\n";
    echo "First bytes: " . substr(file_get_contents($index), 0, 80) . "\n";
} else {
    echo "FAIL: index.html missing\n";
}

$assets = glob($target . 'assets/*');
echo "Assets: " . count($assets) . " files\n";

// Write proper .htaccess
$htaccess = $target . '.htaccess';
file_put_contents($htaccess, "ErrorDocument 404 /index.html\nHeader set Cache-Control \"no-store, no-cache, must-revalidate\"\n");
echo "htaccess: written\n";

echo "=== DONE ===\n";
