@echo off
echo ===================================================
echo [TRIBUTARY FIX] Syncing and pushing to PR #295 branch (main)
echo ===================================================

echo [TRIBUTARY FIX] Checking out main branch...
git checkout main

echo [TRIBUTARY FIX] Staging and committing all local fixes...
git add .
git commit -m "fix(ci): add reentrancy to cspell dictionary and fix SECURITY.md link" 2>nul

echo [TRIBUTARY FIX] Fetching latest from origin...
git fetch origin

echo [TRIBUTARY FIX] Rebasing local changes onto origin/main...
git rebase origin/main

echo [TRIBUTARY FIX] Pushing updates to origin/main...
git push origin main

echo ===================================================
echo [TRIBUTARY FIX] PR #295 branch successfully updated!
echo ===================================================
pause
