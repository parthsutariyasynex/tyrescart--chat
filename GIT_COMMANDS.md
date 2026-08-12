# ============================================================
# TYRESCART - GIT COMMANDS & WORKFLOW GUIDE
# ============================================================

This document serves as the comprehensive reference guide for Git commands, daily workflow, branch management, cherry-picking, and troubleshooting in the TyresCart project.

---

## 1. Current Status & History Check

```bash
# Check working directory and staged status
git status

# Check current active branch and local branches
git branch

# Check current branch name only
git branch --show-current

# View concise log of last 3 commits
git log -3 --oneline

# View last 1 commit details
git log -1 --oneline
```

---

## 2. Working on Development Branch

```bash
# Switch to development branch
git checkout development

# Pull the latest changes from remote
git pull origin development

# Make your code changes...
```

---

## 3. Checking Changes in Development

```bash
# Check modified / staged files
git status

# Review line-by-line diffs
git diff
```

---

## 4. Committing & Pushing to Development

```bash
# Stage all modified and new files
git add .

# Verify staged files
git status

# Commit changes with a descriptive message
git commit -m "Your commit message"

# Push changes to remote development branch
git push origin development
```

---

## 5. Verification After Development Push

```bash
# Check working tree status
git status

# Verify latest commit log
git log -3 --oneline
```

---

## 6. Moving Changes from Development to Main (Production)

### Step A: Switch and Update Main
```bash
# Switch to main branch
git checkout main

# Ensure local main is up to date with remote
git pull origin main

# View latest commits on development branch
git log development -3 --oneline
```

---

## 7. Applying Specific Commits (Cherry-Pick)

When you want to bring only specific tested commits into `main`:

```bash
# Cherry-pick a specific commit hash from development into main
git cherry-pick <DEVELOPMENT_COMMIT_HASH>

# Example:
# git cherry-pick 69bf415
```

---

## 8. Pushing to Main (Production Release)

```bash
# Push main branch to trigger Vercel production build
git push origin main
```

---

## 9. Verifying Main Branch State

```bash
git status
git log -3 --oneline

# Expected output:
# Your branch is up to date with 'origin/main'.
# nothing to commit, working tree clean
```

---

## 💡 Important: Option A vs Option B for Main Deployment

### Option A: Specific Commit (Cherry-Pick)
Use when only specific commits are ready for production:
```bash
git checkout main
git pull origin main
git cherry-pick <COMMIT_HASH>
git push origin main
```

### Option B: Merge All Development Commits into Main
Use when all development commits are tested and ready:
```bash
git checkout main
git pull origin main
git merge development
git push origin main
```

---

## 10. Keeping Changes Isolated in Development Only

If a feature or fix should stay in `development` and **NOT** go to `main`:

```bash
git checkout development
git add .
git commit -m "Development feature or test fix"
git push origin development

# Do NOT switch to main or run cherry-pick / merge.
```

---

## 11. Discarding Uncommitted Changes (Reset / Clean)

> ⚠️ **WARNING**: The commands below will permanently delete local uncommitted changes and untracked files.

```bash
# Discard uncommitted changes in tracked files
git restore .

# Remove all untracked files and directories
git clean -fd
```

---

## 12. Handling Committed but Unpushed Changes

```bash
# Check status to see how many commits local is ahead of remote
git status

# Push to development
git push origin development

# Or push to main (if on main)
git push origin main
```

---

## 13. Comparing Branches

```bash
# View commits that are in development but NOT in main
git log main..development --oneline

# View commits that are in main but NOT in development
git log development..main --oneline
```

---

## 14. Remote Branch Sync & Tracking Check

```bash
# Fetch latest references from remote
git fetch origin

# Check local vs remote status
git status

# View detailed branch status with remote tracking info
git branch -vv
```

---

## ⚠️ 15. Troubleshooting Common Git Scenarios

### Error: `Your local changes to the following files would be overwritten by checkout`
**Solution:**
```bash
# 1. Stash local changes temporarily
git stash

# 2. Switch branch
git checkout development

# 3. Restore stashed changes
git stash pop
```

### Error: `[rejected] development -> development (fetch first)`
**Solution:**
```bash
# Rebase local commits on top of remote
git pull origin development --rebase
git push origin development
```

---

## ⚡ 16. Trigger Empty Vercel Redeployment
If you need to force a fresh Vercel production deployment without code changes:
```bash
git checkout main
git commit --allow-empty -m "Trigger Vercel redeploy"
git push origin main
```

---

## 🔄 17. Recommended Daily Workflow Summary

```bash
# 1. Start on Development & update
git checkout development
git pull origin development

# 2. Code & test locally

# 3. Review changes
git status
git diff

# 4. Commit & push development
git add .
git commit -m "Describe your changes"
git push origin development

# 5. Verify on development preview

# 6. Deploy to Production (Main)
git checkout main
git pull origin main
git cherry-pick <COMMIT_HASH>   # or git merge development
git push origin main

# 7. Verify status
git status
git log -3 --oneline

# 8. Switch back to development
git checkout development
```

---

## 🚀 18. Direct Cross-Branch Pushing (Without Checkout)

When you are working on `main` and want to push the latest `main` commits directly to the remote `development` branch without switching branches:

```bash
# Push main branch commits directly to remote development branch
git push origin main:development
```

Conversely, to push `development` commits directly to `main` without switching:

```bash
# Push development branch commits directly to remote main branch
git push origin development:main
```

