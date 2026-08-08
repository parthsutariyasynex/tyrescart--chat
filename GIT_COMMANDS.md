# 🚀 Daily Git Workflow & Essential Commands Guide

This document outlines the standard Git workflow and essential commands used for daily development in this repository.

---

## 🔄 1. Daily Development Workflow

### 🔹 Step 1: Update the `development` branch
Before starting any new work, switch to the `development` branch and pull the latest changes from remote:
```bash
git checkout development
git pull origin development
```

### 🔹 Step 2: Check changes and commit your work
```bash
# 1. Check which files have been modified
git status

# 2. Stage all modified files
git add .

# 3. Commit your changes with a descriptive message
git commit -m "Your commit message here"
```

### 🔹 Step 3: Push to `development` branch
```bash
git push origin development
```

### 🔹 Step 4: Deploying to `main` (Production)

#### Option A: Cherry-Pick a specific commit
Use this when you only want to push a specific tested commit to `main`:
```bash
git checkout main
git pull origin main
git cherry-pick <COMMIT_HASH>
git push origin main
git checkout development
```

**⚡ Quick 1-Line Copy-Paste:**
```bash
git checkout main && git pull origin main && git cherry-pick <COMMIT_HASH> && git push origin main && git checkout development
```

#### Option B: Merge all development commits
Use this when all changes on `development` are ready for production:
```bash
git checkout main
git pull origin main
git merge development
git push origin main
git checkout development
```

---

## ⚠️ 2. Common Errors & Solutions (Troubleshooting)

### ❓ Error 1: `Your local changes to the following files would be overwritten by checkout`
**Cause:** Uncommitted local changes exist on the current branch when trying to switch branches.
**Solution:**
```bash
# 1. Temporarily save (stash) local uncommitted changes
git stash

# 2. Switch to the target branch
git checkout development

# 3. Restore your stashed changes on the new branch
git stash pop
```

### ❓ Error 2: `[rejected] development -> development (fetch first)`
**Cause:** Remote repository contains commits that you do not have locally yet.
**Solution:**
```bash
# 1. Fetch remote commits and rebase your local commits on top
git pull origin development --rebase

# 2. Push your changes again
git push origin development
```

---

## 🛠️ 3. Quick Reference Table of Essential Git Commands

| Command | Description |
| :--- | :--- |
| `git status` | View modified, staged, or untracked files |
| `git branch -a` | List all local and remote branches |
| `git checkout <branch-name>` | Switch to a specific branch |
| `git checkout -b <new-branch>` | Create a new branch and switch to it |
| `git diff` | View line-by-line file modifications |
| `git log -n 5 --oneline` | View concise history of the last 5 commits |
| `git stash` | Temporarily save uncommitted working directory changes |
| `git stash pop` | Apply and remove the most recent stashed changes |
| `git cherry-pick <commit>` | Apply a specific commit from another branch |
| `git restore <file>` | Discard uncommitted changes in a specific file |

---

## ⚡ 4. Trigger Empty Vercel Redeployment
If you need to trigger a fresh Vercel build without making code changes:
```bash
git commit --allow-empty -m "Trigger Vercel redeploy"
git push origin main
```
