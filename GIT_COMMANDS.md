# 🚀 TyresCart - Master Git Commands & Workflow Guide

This document is the comprehensive reference guide for Git commands, daily workflow, branch management, cherry-picking, troubleshooting, and production deployment rules for the TyresCart project.

---

## 📋 1. Current Status & Verification Commands

```bash
# Check working directory status, staged files, and uncommitted modifications
git status

# List all local branches (asterisk indicates active branch)
git branch

# Print active branch name only
git branch --show-current

# View concise history of the last 5 commits
git log -5 --oneline

# View detailed stats of the latest commit
git log -1 --stat
```

---

## 🔄 2. Daily Development Workflow (`development` Branch)

### Step A: Switch & Update `development`
Always update your local `development` branch before starting work:
```bash
# Switch to development branch
git checkout development

# Pull the latest changes from remote repository
git pull origin development
```

### Step B: Stage & Commit Changes
```bash
# Stage all modified and new files
git add .

# Verify staged files before committing
git status

# Commit changes with a descriptive message
git commit -m "feat: your feature or bugfix summary"
```

### Step C: Push to Remote `development`
```bash
# Push committed changes to remote development branch
git push origin development
```

---

## 🚀 3. Production Deployment to `main` (Vercel)

### Option A: Cherry-Pick a Specific Commit (Recommended for Single Tested Feature)
Use this when you want to deploy only **one specific tested commit** from `development` to `main` without bringing unverified commits.

**Step-by-step commands:**
```bash
# 1. Switch to main branch
git checkout main

# 2. Ensure local main is up to date with remote
git pull origin main

# 3. Apply the specific commit from development using its Hash ID
git cherry-pick <COMMIT_HASH>

# 4. Push to remote main (Triggers Vercel Production Build)
git push origin main

# 5. Switch back to development branch for ongoing work
git checkout development
```

**⚡ 1-Line Copy-Paste Shortcut for Option A:**
```bash
git checkout main && git pull origin main && git cherry-pick <COMMIT_HASH> && git push origin main && git checkout development
```

---

### Option B: Merge All Development Commits to `main`
Use this when **all commits on `development`** have been tested and are ready to deploy to production together.

**Step-by-step commands:**
```bash
# 1. Switch to main branch
git checkout main

# 2. Pull latest main code
git pull origin main

# 3. Merge all development commits into main
git merge development

# 4. Push to remote main (Triggers Vercel Production Build)
git push origin main

# 5. Switch back to development branch for ongoing work
git checkout development
```

**⚡ 1-Line Copy-Paste Shortcut for Option B:**
```bash
git checkout main && git pull origin main && git merge development && git push origin main && git checkout development
```

---

## ⚠️ 4. Common Errors & Troubleshooting Solutions

### ❓ Error 1: `Your local changes to the following files would be overwritten by checkout`
**Cause:** Uncommitted local modifications exist on your current branch when trying to switch branches.  
**Solution:** Use `git stash` to temporarily save changes:
```bash
# 1. Temporarily save uncommitted changes to stash
git stash

# 2. Switch to target branch
git checkout development

# 3. Restore your stashed changes on the target branch
git stash pop
```

---

### ❓ Error 2: `[rejected] development -> development (fetch first)`
**Cause:** Remote server has commits that you do not have locally yet.  
**Solution:** Rebase local commits on top of remote commits:
```bash
# 1. Fetch remote commits and rebase local commits on top
git pull origin development --rebase

# 2. Push changes again
git push origin development
```

---

### ❓ Error 3: Discarding Unwanted Local Modifications
```bash
# Discard uncommitted changes in tracked files
git restore .

# Delete untracked new files and directories
git clean -fd
```

---

## ⚡ 5. Trigger Empty Vercel Redeployment
If you need to force a fresh Vercel production build without making any code changes:
```bash
git checkout main
git commit --allow-empty -m "Trigger Vercel redeploy"
git push origin main
git checkout development
```

---

## 🛠️ 6. Quick Reference Table of Essential Git Commands

| Command | Purpose / Explanation |
| :--- | :--- |
| `git status` | Check status of modified, staged, or untracked files |
| `git branch -a` | List all local and remote tracking branches |
| `git checkout <branch>` | Switch to a specific local branch |
| `git checkout -b <new-branch>` | Create and switch to a new branch |
| `git diff` | View exact line-by-line code changes |
| `git log -n 5 --oneline` | View last 5 commit IDs and messages |
| `git cherry-pick <hash>` | Copy a specific commit from development into main |
| `git merge <branch>` | Merge all commits from another branch into current branch |
| `git stash` | Temporarily save uncommitted work |
| `git stash pop` | Restore previously stashed work |
| `git restore <file>` | Revert uncommitted changes in a specific file |
