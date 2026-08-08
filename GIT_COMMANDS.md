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

### 🔹 Step 4: Merge to `main` for Production (Vercel) Deployment
```bash
# 1. Switch to the main branch
git checkout main

# 2. Pull the latest changes from main
git pull origin main

# 3. Merge development changes into main
git merge development

# 4. Push main branch to trigger Vercel deployment
git push origin main

# 5. Switch back to development branch for ongoing work
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
| `git restore <file>` | Discard uncommitted changes in a specific file |

---

## ⚡ 4. Trigger Empty Vercel Redeployment
If you need to trigger a fresh Vercel build without making code changes:
```bash
git commit --allow-empty -m "Trigger Vercel redeploy"
git push origin main
```
