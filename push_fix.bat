@echo off
echo ===================================================
echo [TRIBUTARY FIX] Syncing and pushing to PR #296 branch
echo ===================================================

echo [TRIBUTARY FIX] Checking out feature/security-threat-model branch...
git checkout feature/security-threat-model

echo [TRIBUTARY FIX] Staging and committing all local changes...
git add .
git commit -m "fix(ci): fix relative markdown link in SECURITY.md and update cspell words" 2>nul

echo [TRIBUTARY FIX] Fetching latest from origin...
git fetch origin

echo [TRIBUTARY FIX] Rebasing local changes onto origin/feature/security-threat-model...
git rebase origin/feature/security-threat-model

echo [TRIBUTARY FIX] Pushing updates to origin/feature/security-threat-model...
git push origin feature/security-threat-model

echo ===================================================
echo [TRIBUTARY FIX] PR #296 branch successfully updated!
echo ===================================================
pause
