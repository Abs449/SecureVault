---
description: Alternative deployment options for SecureVault
---

# SecureVault - Alternative Deployment Options

This guide covers various deployment platforms for your zero-knowledge password manager, with pros/cons and step-by-step instructions for each.

---

## Deployment Options Comparison

| Platform | Difficulty | Cost | Best For | Auto-Deploy | Edge Network |
|----------|-----------|------|----------|-------------|--------------|
| **Vercel** | Easy | Free tier generous | Next.js apps | ✅ Yes | ✅ Global |
| **Firebase Hosting** | Easy | Free tier good | Firebase-integrated apps | ✅ Yes | ✅ Global |
| **Netlify** | Easy | Free tier generous | Static sites & SSR | ✅ Yes | ✅ Global |
| **AWS Amplify** | Medium | Pay-as-you-go | AWS ecosystem | ✅ Yes | ✅ Global |
| **Cloudflare Pages** | Easy | Free tier excellent | Edge-first apps | ✅ Yes | ✅ Global |
| **Railway** | Easy | $5/month | Full-stack apps | ✅ Yes | ❌ Regional |
| **Render** | Easy | Free tier limited | Full-stack apps | ✅ Yes | ❌ Regional |
| **DigitalOcean App Platform** | Medium | $5/month | Scalable apps | ✅ Yes | ❌ Regional |
| **Self-Hosted (VPS)** | Hard | $5-20/month | Full control | ❌ Manual | ❌ Single region |
| **Docker + Cloud Run** | Medium | Pay-as-you-go | Containerized apps | ⚠️ Partial | ✅ Multi-region |

---

## Option 1: Firebase Hosting (Recommended for Firebase Users)

### Why Choose Firebase Hosting?
- ✅ Seamless integration with Firebase services
- ✅ Free SSL certificate
- ✅ Global CDN
- ✅ Easy rollbacks
- ✅ Free tier: 10GB storage, 360MB/day transfer

### Prerequisites
```bash
npm install -g firebase-tools
```

### Deployment Steps

**Step 1: Configure Next.js for static export**

Add to `next.config.ts`:
```typescript
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true, // Required for static export
  },
};

export default nextConfig;
```

**Step 2: Update package.json**

Add export script:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "export": "next build",
    "start": "next start"
  }
}
```

**Step 3: Initialize Firebase Hosting**

// turbo
```bash
firebase init hosting
```

Configuration:
- Public directory: `out`
- Single-page app: `Yes`
- Automatic builds with GitHub: `Yes` (optional)

**Step 4: Update firebase.json**

```json
{
  "hosting": {
    "public": "out",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**",
        "headers": [
          {
            "key": "X-Content-Type-Options",
            "value": "nosniff"
          },
          {
            "key": "X-Frame-Options",
            "value": "DENY"
          },
          {
            "key": "X-XSS-Protection",
            "value": "1; mode=block"
          }
        ]
      }
    ]
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

**Step 5: Build and Deploy**

```bash
npm run build
firebase deploy --only hosting
```

**Step 6: Set up environment variables**

Create `.env.production`:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

**Note:** With static export, environment variables are baked into the build.

---

## Option 2: Netlify

### Why Choose Netlify?
- ✅ Excellent free tier
- ✅ Easy Git integration
- ✅ Built-in CI/CD
- ✅ Environment variable management
- ✅ Instant rollbacks

### Deployment Steps

**Step 1: Install Netlify CLI**

```bash
npm install -g netlify-cli
```

**Step 2: Login to Netlify**

```bash
netlify login
```

**Step 3: Create netlify.toml**

Create `netlify.toml` in project root:
```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"

[build.environment]
  NODE_VERSION = "18"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    X-XSS-Protection = "1; mode=block"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

**Step 4: Initialize and Deploy**

```bash
netlify init
```

Follow prompts:
- Create & configure a new site
- Build command: `npm run build`
- Publish directory: `.next`

**Step 5: Set Environment Variables**

```bash
netlify env:set NEXT_PUBLIC_FIREBASE_API_KEY "your_value"
netlify env:set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN "your_value"
netlify env:set NEXT_PUBLIC_FIREBASE_PROJECT_ID "your_value"
netlify env:set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET "your_value"
netlify env:set NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID "your_value"
netlify env:set NEXT_PUBLIC_FIREBASE_APP_ID "your_value"
```

**Step 6: Deploy**

```bash
netlify deploy --prod
```

---

## Option 3: Cloudflare Pages

### Why Choose Cloudflare Pages?
- ✅ Unlimited bandwidth (free tier)
- ✅ Global edge network
- ✅ Excellent performance
- ✅ Built-in DDoS protection
- ✅ Free SSL

### Deployment Steps

**Step 1: Install Wrangler CLI**

```bash
npm install -g wrangler
```

**Step 2: Login to Cloudflare**

```bash
wrangler login
```

**Step 3: Configure for Cloudflare Pages**

Next.js works with Cloudflare Pages using `@cloudflare/next-on-pages`.

Install adapter:
```bash
npm install --save-dev @cloudflare/next-on-pages
```

**Step 4: Update package.json**

```json
{
  "scripts": {
    "pages:build": "npx @cloudflare/next-on-pages",
    "pages:dev": "npx @cloudflare/next-on-pages --watch",
    "pages:deploy": "npm run pages:build && wrangler pages deploy .vercel/output/static"
  }
}
```

**Step 5: Deploy via Git (Recommended)**

1. Push code to GitHub/GitLab
2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
3. Pages → Create a project → Connect to Git
4. Select repository
5. Build settings:
   - Build command: `npx @cloudflare/next-on-pages`
   - Build output directory: `.vercel/output/static`
6. Add environment variables in dashboard
7. Deploy

**Step 6: Deploy via CLI**

```bash
npm run pages:build
wrangler pages deploy .vercel/output/static --project-name=securevault
```

---

## Option 4: AWS Amplify

### Why Choose AWS Amplify?
- ✅ Full AWS integration
- ✅ Scalable infrastructure
- ✅ Built-in CI/CD
- ✅ Custom domains
- ✅ Free tier: 1000 build minutes/month

### Deployment Steps

**Step 1: Install Amplify CLI**

```bash
npm install -g @aws-amplify/cli
```

**Step 2: Configure AWS credentials**

```bash
amplify configure
```

**Step 3: Initialize Amplify**

```bash
amplify init
```

Configuration:
- Environment name: `production`
- Default editor: (your choice)
- App type: `javascript`
- Framework: `react`
- Source directory: `src`
- Distribution directory: `.next`
- Build command: `npm run build`
- Start command: `npm run start`

**Step 4: Add hosting**

```bash
amplify add hosting
```

Choose:
- Hosting with Amplify Console
- Manual deployment

**Step 5: Deploy**

```bash
amplify publish
```

**Step 6: Set environment variables**

In AWS Amplify Console:
1. Go to App Settings → Environment variables
2. Add all `NEXT_PUBLIC_*` variables
3. Redeploy

---

## Option 5: Railway

### Why Choose Railway?
- ✅ Simple deployment
- ✅ Automatic HTTPS
- ✅ Database support
- ✅ Easy environment management
- ⚠️ $5/month minimum

### Deployment Steps

**Step 1: Install Railway CLI**

```bash
npm install -g @railway/cli
```

**Step 2: Login**

```bash
railway login
```

**Step 3: Initialize project**

```bash
railway init
```

**Step 4: Add environment variables**

```bash
railway variables set NEXT_PUBLIC_FIREBASE_API_KEY="your_value"
railway variables set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your_value"
railway variables set NEXT_PUBLIC_FIREBASE_PROJECT_ID="your_value"
railway variables set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your_value"
railway variables set NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your_value"
railway variables set NEXT_PUBLIC_FIREBASE_APP_ID="your_value"
```

**Step 5: Deploy**

```bash
railway up
```

Railway automatically detects Next.js and configures build settings.

---

## Option 6: Render

### Why Choose Render?
- ✅ Free tier available
- ✅ Auto-deploy from Git
- ✅ Easy setup
- ✅ Built-in SSL
- ⚠️ Free tier has limitations (spins down after inactivity)

### Deployment Steps

**Step 1: Create render.yaml**

```yaml
services:
  - type: web
    name: securevault
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_VERSION
        value: 18
      - key: NEXT_PUBLIC_FIREBASE_API_KEY
        sync: false
      - key: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
        sync: false
      - key: NEXT_PUBLIC_FIREBASE_PROJECT_ID
        sync: false
      - key: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
        sync: false
      - key: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
        sync: false
      - key: NEXT_PUBLIC_FIREBASE_APP_ID
        sync: false
```

**Step 2: Deploy via Dashboard**

1. Go to [Render Dashboard](https://dashboard.render.com)
2. New → Web Service
3. Connect your Git repository
4. Render auto-detects Next.js
5. Add environment variables
6. Deploy

---

## Option 7: DigitalOcean App Platform

### Why Choose DigitalOcean?
- ✅ Simple pricing ($5/month)
- ✅ Reliable infrastructure
- ✅ Good documentation
- ✅ Managed databases available

### Deployment Steps

**Step 1: Install doctl CLI**

```bash
# Windows (via Chocolatey)
choco install doctl

# Or download from GitHub releases
```

**Step 2: Authenticate**

```bash
doctl auth init
```

**Step 3: Create app spec**

Create `.do/app.yaml`:
```yaml
name: securevault
services:
  - name: web
    github:
      repo: your-username/your-repo
      branch: main
      deploy_on_push: true
    build_command: npm run build
    run_command: npm start
    environment_slug: node-js
    instance_count: 1
    instance_size_slug: basic-xxs
    envs:
      - key: NEXT_PUBLIC_FIREBASE_API_KEY
        value: ${FIREBASE_API_KEY}
      - key: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
        value: ${FIREBASE_AUTH_DOMAIN}
      - key: NEXT_PUBLIC_FIREBASE_PROJECT_ID
        value: ${FIREBASE_PROJECT_ID}
      - key: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
        value: ${FIREBASE_STORAGE_BUCKET}
      - key: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
        value: ${FIREBASE_MESSAGING_SENDER_ID}
      - key: NEXT_PUBLIC_FIREBASE_APP_ID
        value: ${FIREBASE_APP_ID}
```

**Step 4: Deploy**

```bash
doctl apps create --spec .do/app.yaml
```

---

## Option 8: Self-Hosted on VPS (Advanced)

### Why Choose Self-Hosting?
- ✅ Complete control
- ✅ No vendor lock-in
- ✅ Custom configurations
- ⚠️ Requires server management skills

### Deployment Steps (Ubuntu/Debian)

**Step 1: Set up VPS**

Providers: DigitalOcean, Linode, Vultr, Hetzner ($5-10/month)

**Step 2: SSH into server**

```bash
ssh root@your-server-ip
```

**Step 3: Install Node.js and PM2**

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Install PM2
npm install -g pm2

# Install Nginx
apt install -y nginx

# Install Certbot for SSL
apt install -y certbot python3-certbot-nginx
```

**Step 4: Clone and build your app**

```bash
# Create app directory
mkdir -p /var/www/securevault
cd /var/www/securevault

# Clone repository
git clone https://github.com/your-username/your-repo.git .

# Install dependencies
npm install

# Create .env.local with your variables
nano .env.local

# Build
npm run build
```

**Step 5: Configure PM2**

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'securevault',
    script: 'npm',
    args: 'start',
    cwd: '/var/www/securevault',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

Start app:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

**Step 6: Configure Nginx**

Create `/etc/nginx/sites-available/securevault`:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:
```bash
ln -s /etc/nginx/sites-available/securevault /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

**Step 7: Set up SSL**

```bash
certbot --nginx -d your-domain.com
```

**Step 8: Set up automatic updates**

Create update script `/var/www/securevault/update.sh`:
```bash
#!/bin/bash
cd /var/www/securevault
git pull
npm install
npm run build
pm2 restart securevault
```

Make executable:
```bash
chmod +x update.sh
```

---

## Option 9: Docker + Google Cloud Run

### Why Choose Cloud Run?
- ✅ Pay only for what you use
- ✅ Auto-scaling
- ✅ Serverless
- ✅ Container-based

### Deployment Steps

**Step 1: Create Dockerfile**

```dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for build
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID

ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID

RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

**Step 2: Update next.config.ts**

```typescript
const nextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

**Step 3: Build and push to Google Container Registry**

```bash
# Install Google Cloud SDK
# https://cloud.google.com/sdk/docs/install

# Login
gcloud auth login

# Set project
gcloud config set project YOUR_PROJECT_ID

# Build image
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/securevault

# Deploy to Cloud Run
gcloud run deploy securevault \
  --image gcr.io/YOUR_PROJECT_ID/securevault \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NEXT_PUBLIC_FIREBASE_API_KEY=your_value,NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_value
```

---

## Recommendation Matrix

### Choose Firebase Hosting if:
- ✅ Already using Firebase services
- ✅ Want seamless integration
- ✅ Need simple deployment
- ✅ Don't need server-side rendering

### Choose Netlify if:
- ✅ Want excellent free tier
- ✅ Need easy Git integration
- ✅ Want instant rollbacks
- ✅ Prefer simple UI

### Choose Cloudflare Pages if:
- ✅ Need unlimited bandwidth
- ✅ Want best performance
- ✅ Need DDoS protection
- ✅ Want edge computing

### Choose Vercel if:
- ✅ Want best Next.js support
- ✅ Need edge functions
- ✅ Want preview deployments
- ✅ Prefer developer experience

### Choose Railway/Render if:
- ✅ Want simple full-stack deployment
- ✅ Need database integration
- ✅ Prefer straightforward pricing
- ✅ Don't need edge network

### Choose Self-Hosted if:
- ✅ Need complete control
- ✅ Have server management skills
- ✅ Want to avoid vendor lock-in
- ✅ Need custom configurations

---

## Cost Comparison (Monthly)

| Platform | Free Tier | Paid Tier |
|----------|-----------|-----------|
| Firebase Hosting | 10GB storage, 360MB/day | $0.026/GB storage |
| Netlify | 100GB bandwidth | $19/month (Pro) |
| Cloudflare Pages | Unlimited bandwidth | $20/month (Pro) |
| Vercel | 100GB bandwidth | $20/month (Pro) |
| Railway | $5 credit | $5+ usage-based |
| Render | 750 hours/month | $7/month (Starter) |
| DigitalOcean | - | $5/month (Basic) |
| VPS | - | $5-20/month |
| Cloud Run | 2M requests/month | Pay-per-use |

---

## Final Recommendation for SecureVault

**Best Choice: Firebase Hosting**
- Seamless Firebase integration
- Free tier sufficient for most users
- Easy deployment and rollbacks
- Global CDN included

**Runner-up: Cloudflare Pages**
- Unlimited bandwidth
- Excellent performance
- Great free tier
- Edge network

Both options provide excellent security, performance, and cost-effectiveness for your password manager! 🔒
