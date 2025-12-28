---
description: Deploy SecureVault to Vercel with Firebase
---

# SecureVault Deployment Workflow

This workflow guides you through deploying the SecureVault zero-knowledge password manager to production using Vercel and Firebase.

## Prerequisites Checklist

Before starting deployment, ensure you have:
- [ ] A Firebase project with Authentication and Firestore enabled
- [ ] Firebase CLI installed (`npm install -g firebase-tools`)
- [ ] A Vercel account (free tier works)
- [ ] Vercel CLI installed (`npm install -g vercel`)
- [ ] All environment variables configured in `.env.local`
- [ ] Tested the application locally with `npm run dev`

---

## Phase 1: Firebase Configuration

### Step 1: Install Firebase CLI (if not already installed)

```bash
npm install -g firebase-tools
```

### Step 2: Login to Firebase

```bash
firebase login
```

This will open a browser window for authentication.

### Step 3: Initialize Firebase in your project

```bash
firebase init
```

When prompted:
- Select **Firestore** (use spacebar to select)
- Choose **Use an existing project**
- Select your Firebase project from the list
- Accept default file names for `firestore.rules` and `firestore.indexes.json`

### Step 4: Deploy Firestore Security Rules

```bash
firebase deploy --only firestore:rules
```

This publishes the security rules that ensure:
- Users can only access their own data
- Proper authentication is required
- Data structure is validated

### Step 5: Verify Firestore Rules

Go to [Firebase Console](https://console.firebase.google.com) → Your Project → Firestore Database → Rules

Confirm the rules match your `firestore.rules` file.

---

## Phase 2: Vercel Deployment

### Step 6: Install Vercel CLI (if not already installed)

```bash
npm install -g vercel
```

### Step 7: Login to Vercel

```bash
vercel login
```

Follow the authentication prompts.

### Step 8: Build the application locally (test)

// turbo
```bash
npm run build
```

This ensures there are no build errors before deploying.

### Step 9: Deploy to Vercel (Preview)

```bash
vercel
```

When prompted:
- **Set up and deploy**: Yes
- **Which scope**: Select your account
- **Link to existing project**: No (first time) or Yes (subsequent deploys)
- **Project name**: `securevault` (or your preferred name)
- **Directory**: `./` (current directory)
- **Override settings**: No

This creates a preview deployment.

### Step 10: Configure Environment Variables in Vercel

You have two options:

**Option A: Via Vercel Dashboard**
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to Settings → Environment Variables
4. Add each variable from your `.env.local`:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
5. Set environment to: **Production**, **Preview**, and **Development**

**Option B: Via CLI**
```bash
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID
vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
vercel env add NEXT_PUBLIC_FIREBASE_APP_ID
```

### Step 11: Deploy to Production

```bash
vercel --prod
```

This deploys to your production domain.

---

## Phase 3: Firebase Configuration for Production

### Step 12: Add Vercel Domain to Firebase Authorized Domains

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Navigate to Authentication → Settings → Authorized domains
3. Click **Add domain**
4. Add your Vercel production domain (e.g., `securevault.vercel.app`)
5. Add any custom domains you plan to use

### Step 13: Update Firebase Authentication Settings

1. In Firebase Console → Authentication → Settings
2. Verify **Email/Password** is enabled
3. Consider enabling **Email enumeration protection** for additional security

---

## Phase 4: Post-Deployment Verification

### Step 14: Test Production Deployment

Visit your production URL and verify:
- [ ] Homepage loads correctly
- [ ] Registration works (create a test account)
- [ ] Login works with the test account
- [ ] Master password entry works
- [ ] Can add/view/edit/delete passwords
- [ ] Password generator works
- [ ] Auto-lock functionality works (wait 15 minutes or adjust timer for testing)
- [ ] Search and filtering work
- [ ] Copy to clipboard works
- [ ] All UI elements render properly

### Step 15: Security Verification

Check the following security aspects:
- [ ] HTTPS is enforced (Vercel does this automatically)
- [ ] Firestore rules are active (try accessing data from another account)
- [ ] Master password is never sent to server (check Network tab in DevTools)
- [ ] Encryption/decryption happens client-side only
- [ ] No sensitive data in browser localStorage

### Step 16: Performance Check

1. Run Lighthouse audit in Chrome DevTools
2. Verify scores for:
   - Performance: 90+
   - Accessibility: 90+
   - Best Practices: 90+
   - SEO: 90+

---

## Phase 5: Optional Enhancements

### Step 17: Set up Custom Domain (Optional)

If you have a custom domain:

1. In Vercel Dashboard → Your Project → Settings → Domains
2. Add your custom domain
3. Configure DNS records as instructed by Vercel
4. Add the custom domain to Firebase Authorized Domains (Step 12)

### Step 18: Configure Firebase Hosting (Alternative to Vercel)

If you prefer Firebase Hosting instead of Vercel:

```bash
firebase init hosting
```

Configure:
- Public directory: `out`
- Single-page app: Yes
- GitHub integration: Optional

Add build script to `package.json`:
```json
"export": "next build && next export"
```

Deploy:
```bash
npm run build
firebase deploy --only hosting
```

### Step 19: Set up Monitoring (Optional)

**Vercel Analytics:**
1. In Vercel Dashboard → Your Project → Analytics
2. Enable Web Analytics

**Firebase Analytics:**
1. In Firebase Console → Analytics
2. Enable Google Analytics
3. Add Firebase Analytics SDK to your app

### Step 20: Set up Backup Strategy

Create a backup workflow:
1. Document the export feature for users
2. Consider implementing automated Firestore backups
3. Set up Firebase backup schedule in Google Cloud Console

---

## Continuous Deployment

### Automatic Deployments with Git

1. **Connect GitHub/GitLab to Vercel:**
   - In Vercel Dashboard → Add New Project
   - Import your Git repository
   - Vercel will auto-deploy on every push to main branch

2. **Set up Branch Previews:**
   - Every pull request gets a preview deployment
   - Test changes before merging to production

---

## Rollback Procedure

If something goes wrong:

### Rollback Vercel Deployment:
1. Go to Vercel Dashboard → Your Project → Deployments
2. Find the last working deployment
3. Click the three dots → Promote to Production

### Rollback Firestore Rules:
1. Go to Firebase Console → Firestore → Rules
2. Click on the version history
3. Select a previous version and publish

---

## Troubleshooting

### Issue: Build fails on Vercel
- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Verify TypeScript has no errors: `npm run build` locally

### Issue: Firebase Authentication not working
- Verify authorized domains include your Vercel domain
- Check that environment variables are set correctly
- Ensure Firebase Auth is enabled in console

### Issue: Firestore permission denied
- Verify Firestore rules are deployed
- Check that user is authenticated
- Verify rules match expected data structure

### Issue: Environment variables not loading
- Ensure variables start with `NEXT_PUBLIC_` for client-side access
- Redeploy after adding environment variables
- Check Vercel dashboard that variables are set for correct environment

---

## Security Checklist for Production

- [ ] HTTPS is enforced
- [ ] Firestore security rules are deployed and tested
- [ ] Firebase Auth is properly configured
- [ ] No API keys or secrets in client-side code (except NEXT_PUBLIC_ vars)
- [ ] Master password never sent to server
- [ ] Encryption happens client-side only
- [ ] Auto-lock is functioning
- [ ] No sensitive data in browser storage
- [ ] CORS is properly configured
- [ ] Rate limiting is considered (Firebase has built-in limits)

---

## Maintenance

### Regular Tasks:
- Monitor Firebase usage and quotas
- Review Firestore security rules periodically
- Update dependencies: `npm update`
- Check for Next.js and Firebase updates
- Review Vercel analytics for errors
- Test backup/restore procedures

### Scaling Considerations:
- Firebase free tier: 50K reads/day, 20K writes/day
- Upgrade to Blaze plan if needed
- Consider implementing caching strategies
- Monitor Vercel bandwidth usage

---

## Success Criteria

Your deployment is successful when:
✅ Application is accessible via HTTPS
✅ Users can register and login
✅ Passwords are encrypted and stored securely
✅ All features work as expected
✅ Firestore rules prevent unauthorized access
✅ Performance metrics are acceptable
✅ No console errors in production

---

**Congratulations! Your SecureVault password manager is now live! 🎉🔒**
