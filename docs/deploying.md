# Deploying to Cloud Run + Neon

Our own instance runs on **Google Cloud Run** (runs the app's Docker image, free when idle) with
its data in **Neon** (a hosted Postgres database). See ADR 0012 for why.

Once set up, there is nothing to do by hand: every commit on `main` that passes CI is deployed by
`.github/workflows/deploy.yml`.

```
merge to main ─► CI ─► build image (tag = commit) ─► smoke test ─► push to Artifact Registry
                                                                         │
     production keeps the previous revision ◄─ fail ─ check ◄─ new revision, no traffic
                                                     │ pass
                                                     └─► all traffic to the new revision
```

- **One image per commit**, never rebuilt: what was tested is what runs, and every past version
  can be brought back.
- **The new version starts without traffic** (Cloud Run calls each version a _revision_). Only
  when it answers with the right version and can read the database does it get the traffic, so
  a broken release never reaches you.
- **Database migrations run when the new version starts**, while the old one is still serving.
  So a migration must keep the old version working: add tables and columns; rename or drop them
  only a release later.

## One-time setup

About 30 minutes. You need a Google account (a personal one, see step 2), the GitHub CLI (`gh`)
signed in to this repository, and a terminal.

### The words you will meet

- **Project**: a container in Google Cloud for everything below, and the unit that is billed.
- **Artifact Registry**: Google's storage for Docker images; Cloud Run can only run images from
  there.
- **Service account**: an identity for a program instead of a person. We make two:
  `agendina-runtime` (what the app runs as) and `agendina-deployer` (what GitHub Actions uses to
  deploy).
- **Secret Manager**: stores the database URL; only `agendina-runtime` may read it.
- **Workload Identity Federation**: lets GitHub Actions sign in as `agendina-deployer` without a
  password or key file. GitHub hands each job a signed token saying which repository and
  environment it runs for; Google accepts only this repository's `production` environment.

### 1. Create the database (Neon)

1. Sign up at [neon.tech](https://neon.tech) and create a project:
   - name `agendina`, Postgres version **17**
   - region **AWS Europe Central 1 (Frankfurt)**, close to the Google region we use
2. On the project dashboard, click **Connect**, turn **Connection pooling off**, and copy the
   connection string. It looks like
   `postgresql://agendina_owner:SECRET@ep-name-123456.eu-central-1.aws.neon.tech/agendina?sslmode=require&channel_binding=require`
3. In a text editor, replace everything after the `?` with `sslmode=verify-full`, which makes the
   app check the database's certificate:
   `postgresql://agendina_owner:SECRET@ep-name-123456.eu-central-1.aws.neon.tech/agendina?sslmode=verify-full`

Keep this URL at hand for step 5, and don't share it: it contains the database password.

### 2. Create the Google Cloud project

Use your **personal** Google account. Company accounts (Google Workspace) usually forbid making a
service public, and the deploy then fails.

1. Open [console.cloud.google.com](https://console.cloud.google.com), sign in, and create a
   project (project picker at the top → **New project**). Note its **project ID**, e.g.
   `agendina-513015`; it is not always the name you typed.
2. **Billing → Link a billing account** for the project. A card is required even though one
   person's use stays in the free tier.
3. **Billing → Budgets & alerts → Create budget**, e.g. €1, so you get an email before anything
   costs money.

### 3. Get a terminal with `gcloud`

`gcloud` is Google Cloud's command-line tool. Either:

- **On your Mac**: `brew install --cask gcloud-cli`, then `gcloud auth login` (opens the browser
  to sign in). The commands below are written for zsh (macOS's shell) and bash alike.
- **In the browser**: [shell.cloud.google.com](https://shell.cloud.google.com) is a terminal with
  `gcloud` installed and signed in. It disconnects after a while of inactivity.

### 4. Settings for this terminal

Paste this with **your** project ID. Every later block uses these settings; if you open a new
terminal (or Cloud Shell reconnects), paste it again: the later blocks stop with
`Run the settings block first` when it is missing.

```sh
PROJECT_ID=agendina-513015
REGION=europe-west3
GITHUB_REPO=Spezialissimo/Agendina

gcloud config set project "${PROJECT_ID}"
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format 'value(projectNumber)')
RUNTIME_SA="agendina-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOYER_SA="agendina-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
echo "Project ${PROJECT_ID} (number ${PROJECT_NUMBER})"
```

It should print your project ID and a long number.

Paste the blocks below **one at a time** and read the output before going on. Running one twice
is harmless: what already exists is reported as `already exists`, and you can go on.

### 5. Turn on the services, create the image registry and the database secret

```sh
: "${PROJECT_ID:?Run the settings block first}"

# The Google Cloud services we use (takes a minute).
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iamcredentials.googleapis.com sts.googleapis.com

# Where deploys store the app's images. Old images are deleted, keeping the 10 newest.
gcloud artifacts repositories create agendina --repository-format docker --location "${REGION}"
cat > cleanup.json <<'EOF'
[
  { "name": "keep-recent", "action": { "type": "Keep" }, "mostRecentVersions": { "keepCount": 10 } },
  { "name": "delete-old", "action": { "type": "Delete" }, "condition": { "olderThan": "7d" } }
]
EOF
gcloud artifacts repositories set-cleanup-policies agendina --location "${REGION}" \
  --policy cleanup.json --no-dry-run
```

Now the database URL from step 1. Paste it **between the quotes**, replacing the whole
`postgresql://…` text:

```sh
printf '%s' 'postgresql://PASTE-YOUR-NEON-URL?sslmode=verify-full' |
  gcloud secrets create agendina-database-url --data-file -
```

To change it later (or if you pasted the wrong text), add a new version, which then replaces the
old one:

```sh
printf '%s' 'postgresql://PASTE-YOUR-NEON-URL?sslmode=verify-full' |
  gcloud secrets versions add agendina-database-url --data-file -
```

### 6. Create the two service accounts and their permissions

```sh
: "${PROJECT_ID:?Run the settings block first}"

gcloud iam service-accounts create agendina-runtime --display-name "Agendina (Cloud Run)"
gcloud iam service-accounts create agendina-deployer --display-name "Agendina deploys (GitHub)"
sleep 30 # a new service account takes a few seconds to be known everywhere

# The app may read the database URL.
gcloud secrets add-iam-policy-binding agendina-database-url \
  --member "serviceAccount:${RUNTIME_SA}" --role roles/secretmanager.secretAccessor
# The deployer may deploy Cloud Run services, push images, and run the app as agendina-runtime.
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "serviceAccount:${DEPLOYER_SA}" --role roles/run.admin --condition None
gcloud artifacts repositories add-iam-policy-binding agendina --location "${REGION}" \
  --member "serviceAccount:${DEPLOYER_SA}" --role roles/artifactregistry.writer
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --member "serviceAccount:${DEPLOYER_SA}" --role roles/iam.serviceAccountUser
```

If one of them still says the service account `does not exist`, wait a minute and paste the
block again.

### 7. Let GitHub Actions sign in (Workload Identity Federation)

```sh
: "${PROJECT_ID:?Run the settings block first}"

gcloud iam workload-identity-pools create github --location global --display-name GitHub
gcloud iam workload-identity-pools providers create-oidc agendina \
  --location global --workload-identity-pool github \
  --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping google.subject=assertion.sub,attribute.repository=assertion.repository \
  --attribute-condition "assertion.repository == '${GITHUB_REPO}'"
gcloud iam service-accounts add-iam-policy-binding "${DEPLOYER_SA}" \
  --role roles/iam.workloadIdentityUser \
  --member "principal://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/subject/repo:${GITHUB_REPO}:environment:production"
```

The last command's output must show
`…/subject/repo:Spezialissimo/Agendina:environment:production` (your repository). The braces in
`${GITHUB_REPO}` matter: in zsh, `$GITHUB_REPO:environment` would be cut to
`…:nvironment`.

### 8. Tell GitHub where to deploy

From a checkout of this repository, with `gh` signed in:

```sh
: "${PROJECT_ID:?Run the settings block first}"

gh variable set GCP_PROJECT_ID --body "${PROJECT_ID}"
gh variable set GCP_REGION --body "${REGION}"
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER \
  --body "projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/providers/agendina"
```

These are _variables_, not secrets: none of them is sensitive. Until `GCP_PROJECT_ID` is set, the
Deploy workflow is skipped.

### 9. Check the setup

```sh
: "${PROJECT_ID:?Run the settings block first}"

gcloud artifacts repositories list --location "${REGION}" --format 'value(name)'
gcloud iam service-accounts list --format 'value(email)' | grep agendina
gcloud secrets versions list agendina-database-url --format 'table(name,state)'
gcloud projects get-iam-policy "${PROJECT_ID}" --flatten 'bindings[].members' \
  --filter "bindings.members:${DEPLOYER_SA}" --format 'value(bindings.role)'
gcloud iam service-accounts get-iam-policy "${DEPLOYER_SA}" --format 'value(bindings)'
gh variable list
```

You should see: the `agendina` repository; both service accounts; an `enabled` secret version (older ones may say `destroyed`);
`roles/run.admin`; the `…repo:Spezialissimo/Agendina:environment:production` binding; and the
three variables.

### 10. First deploy

On GitHub: **Actions → Deploy → Run workflow** (or merge anything to `main`). When it finishes,
the job page links to the app, `https://agendina-….run.app`.

**Open it and create your account right away**: the first account on a new instance becomes the
admin, and the address is public. Sign-ups close after it.

Optional: to approve every deploy by hand (continuous _delivery_ instead of _deployment_), add
yourself as a required reviewer under GitHub **Settings → Environments → production**.

## Day to day

- **Deploy**: merge to `main`, and follow it under **Actions → Deploy**.
- **Roll back** to an earlier version of the code (the database stays as it is, see migrations
  above):

  ```sh
  gcloud run revisions list --service agendina --region europe-west3
  gcloud run services update-traffic agendina --region europe-west3 --to-revisions agendina-00012-abc=100
  ```

  The next deploy moves traffic forward again. Don't use `--to-latest` by hand after a failed
  deploy: the latest revision is then the one that failed its check.

- **Logs**: **Cloud Run → agendina → Logs** in the console, or
  `gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=agendina' --limit 50`.
- **Change the database URL**: add a secret version (step 5); the next deploy uses it.

## Costs

With one person using it, everything stays within the free tiers (when this was written: Cloud
Run 2 million requests and 180,000 vCPU-seconds a month, Artifact Registry 0.5 GB, Secret Manager
6 secret versions, Neon 0.5 GB). Both Cloud Run and Neon stop when idle, so the first request
after a while takes a second or two longer.
