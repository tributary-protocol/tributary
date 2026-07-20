@echo off
echo ===================================================
echo [TRIBUTARY FIX] Syncing and pushing to PR #297 branch
echo ===================================================

echo [TRIBUTARY FIX] Staging and committing all local changes...
git add .
git commit -m "fix(ci): resolve CI check errors and update branch" 2>nul

echo [TRIBUTARY FIX] Fetching latest from origin...
git fetch origin

echo [TRIBUTARY FIX] Rebasing local changes onto origin/feature/pay-live-preview...
git rebase origin/feature/pay-live-preview

echo [TRIBUTARY FIX] Pushing updates to origin/feature/pay-live-preview...
git push origin feature/pay-live-preview

echo ===================================================
echo [TRIBUTARY FIX] PR #297 branch successfully updated!
echo ===================================================
pause
