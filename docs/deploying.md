# Deploying to Cloud Run + Neon

The hosted instance runs on Google Cloud Run, with its data in a Neon Postgres database
(ADR 0012). Every commit on `main` that passes CI is deployed by `.github/workflows/deploy.yml`:

```
merge to main ─► CI ─► build image (tag = commit) ─► smoke test ─► push to Artifact Registry
                                                                         │
     production keeps the previous revision ◄─ fail ─ check ◄─ new revision, no traffic
                                                     │ pass
                                                     └─► all traffic to the new revision
```

- **One image per commit**, never rebuilt: what was tested is what runs, and every past version
  can be brought back.
- **The new revision starts without traffic** under a `candidate` URL. Only when it answers with
  the right version and can read the database does it get the traffic, so a broken release never
  reaches you.
- **Migrations run when the new revision starts**, while the previous one is still serving. So a
  migration must keep the previous release working: add tables and columns, don't rename or drop
  them in the same release (drop them a release later, once nothing reads them).

## One-time setup

Takes about half an hour. Run the `gcloud` commands in [Cloud Shell](https://shell.cloud.google.com)
(it has `gcloud` installed and signed in).

### 1. Neon

1. Sign up at [neon.tech](https://neon.tech) and create a project `agendina`: Postgres 17, region
   **AWS Europe Central 1 (Frankfurt)**, close to Cloud Run's `europe-west3`.
2. **Connect** → turn **Connection pooling off** (one small instance does not need it) → copy
   the connection string.
3. Replace everything after `?` with `sslmode=verify-full`:
   `postgresql://agendina_owner:…@ep-…eu-central-1.aws.neon.tech/agendina?sslmode=verify-full`

### 2. Google Cloud

Use a project under your **personal** account. A company Google Workspace organization usually
forbids public services (the "Domain restricted sharing" policy), and then the deploy fails at
`--allow-unauthenticated`. Create the project in the console or with
`gcloud projects create <id>`, and link a billing account (needed even for the free tier). Then
set a budget alert, e.g. €1, under **Billing → Budgets & alerts**, so nothing costs money
unnoticed.

```sh
PROJECT_ID=your-project-id
REGION=europe-west3
GITHUB_REPO=Spezialissimo/Agendina

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')
```

**Image registry**, keeping the 10 most recent images (the free tier stores 0.5 GB):

```sh
gcloud artifacts repositories create agendina --repository-format docker --location "$REGION"
cat > cleanup.json <<'EOF'
[
  { "name": "keep-recent", "action": { "type": "Keep" }, "mostRecentVersions": { "keepCount": 10 } },
  { "name": "delete-old", "action": { "type": "Delete" }, "condition": { "olderThan": "7d" } }
]
EOF
gcloud artifacts repositories set-cleanup-policies agendina --location "$REGION" \
  --policy cleanup.json --no-dry-run
```

**The service's own identity**, the only one allowed to read the database URL. `read -s` asks
for the Neon connection string from step 1 without showing it or keeping it in the shell history:

```sh
gcloud iam service-accounts create agendina-runtime --display-name "Agendina (Cloud Run)"
RUNTIME_SA=agendina-runtime@$PROJECT_ID.iam.gserviceaccount.com

read -rsp 'Neon connection string: ' DATABASE_URL; echo
printf '%s' "$DATABASE_URL" | gcloud secrets create agendina-database-url --data-file -
gcloud secrets add-iam-policy-binding agendina-database-url \
  --member "serviceAccount:$RUNTIME_SA" --role roles/secretmanager.secretAccessor
```

**The deployer**, used by GitHub Actions: it may deploy the service, push images and run the
service as `agendina-runtime`, nothing else. A just-created service account can take a few
seconds to be known everywhere: if a command says it "does not exist", run that command again.

```sh
gcloud iam service-accounts create agendina-deployer --display-name "Agendina deploys (GitHub)"
DEPLOYER_SA=agendina-deployer@$PROJECT_ID.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:$DEPLOYER_SA" --role roles/run.admin --condition None
gcloud artifacts repositories add-iam-policy-binding agendina --location "$REGION" \
  --member "serviceAccount:$DEPLOYER_SA" --role roles/artifactregistry.writer
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member "serviceAccount:$DEPLOYER_SA" --role roles/iam.serviceAccountUser
```

**Workload Identity Federation**: GitHub Actions proves who it is with a short-lived token, and
Google trusts it only for jobs of this repository running in its `production` environment. No
key is stored anywhere:

```sh
gcloud iam workload-identity-pools create github --location global --display-name GitHub
gcloud iam workload-identity-pools providers create-oidc agendina \
  --location global --workload-identity-pool github \
  --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping google.subject=assertion.sub,attribute.repository=assertion.repository \
  --attribute-condition "assertion.repository == '$GITHUB_REPO'"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" \
  --role roles/iam.workloadIdentityUser \
  --member "principal://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/subject/repo:$GITHUB_REPO:environment:production"

echo "GCP_WORKLOAD_IDENTITY_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/agendina"
```

### 3. GitHub

Repository variables (not secrets: none of these is sensitive), from a checkout with `gh`:

```sh
gh variable set GCP_PROJECT_ID --body your-project-id
gh variable set GCP_REGION --body europe-west3
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --body projects/…/providers/agendina
```

The `production` environment is created by the first deploy. To approve every deploy by hand
(continuous _delivery_ instead of _deployment_), add yourself as a required reviewer under
**Settings → Environments → production**.

### 4. First deploy

The workflow stays off (skipped) until `GCP_PROJECT_ID` is set.

**Actions → Deploy → Run workflow** (or merge anything to `main`). The job's summary links to the
service (`https://agendina-….run.app`). **Open it and create your account right away**: the
first account on a new instance becomes the admin, and the URL is public. Sign-ups close after
it.

## Day to day

- **Deploy**: merge to `main`. Follow it under **Actions → Deploy**.
- **Roll back** to an earlier revision (the code; the database stays as it is, see migrations
  above):

  ```sh
  gcloud run revisions list --service agendina --region europe-west3
  gcloud run services update-traffic agendina --region europe-west3 --to-revisions agendina-00012-abc=100
  ```

  The next deploy moves traffic forward again. Don't use `--to-latest` by hand after a failed
  deploy: the latest revision is then the one that failed its check.

- **Logs**: **Cloud Run → agendina → Logs** in the console, or
  `gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=agendina' --limit 50`.
- **Change the database URL**: add a new secret version
  (`gcloud secrets versions add agendina-database-url --data-file -`); the next deploy uses it.

## Costs

With one person using it, everything stays within the free tiers (when this was written: Cloud Run 2 million
requests and 180,000 vCPU-seconds a month, Artifact Registry 0.5 GB, Secret Manager 6 secret
versions, Neon 0.5 GB). Both Cloud Run and Neon stop when idle, so the first request after a
while takes a second or two longer.
