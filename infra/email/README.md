# Friendminton transactional email

This stack owns Friendminton's SES resources in `us-west-2` for account `973118666773`:

- Separate staging and production domain identities, Easy DKIM, custom MAIL FROM domains, and
  transactional configuration sets.
- Account and configuration-set suppression for hard bounces and complaints.
- EventBridge delivery events in 30-day CloudWatch log groups.
- AWS-recommended account bounce- and complaint-rate alarms plus alarms for failed EventBridge log
  delivery.
- Separate, least-privilege staging and production IAM sender users.

It does not manage external DNS, submit the SES production-access request, confirm an SNS email
subscription, create IAM access keys, or edit a server's environment file.

## Plan and apply

Authenticate to the Friendminton AWS account, initialize the independent state, and review a saved
plan:

```sh
aws sts get-caller-identity
cd infra/email
terraform init -backend-config=../backend/email.hcl
terraform fmt -check
terraform validate
terraform plan -out=email.tfplan
terraform apply email.tfplan
```

Set `alert_email` in an uncommitted `terraform.tfvars` only if an operator should receive SES alarm
messages. AWS sends that address a confirmation message after apply; alerts are not delivered until
the recipient confirms the subscription.

## Publish external DNS

After the first apply, print the exact DKIM, MAIL FROM, SPF, and DMARC records:

```sh
terraform output -json required_dns_records
```

Publish every record at the authoritative DNS provider for `friendminton.com`. The staging
`sslip.io` API hostname is not a sending identity because Friendminton does not control its DNS.
Do not create a second DMARC TXT record if one already exists; reconcile the existing policy with
the output instead. The initial `p=none` policy is for observation. Move to `quarantine` and then
`reject` only after legitimate mail is consistently aligned, and add a `rua` address only when that
mailbox is actively monitored.

SES can take up to 72 hours to observe DNS. Confirm both identities:

```sh
aws sesv2 get-email-identity \
  --region us-west-2 \
  --email-identity staging.friendminton.com

aws sesv2 get-email-identity \
  --region us-west-2 \
  --email-identity friendminton.com
```

Do not deploy SES-backed application email until `VerificationStatus` is `SUCCESS` and
`VerifiedForSendingStatus` is `true`.

## Leave the SES sandbox

SES sandbox status is regional. While `us-west-2` remains in the sandbox, Friendminton can send
only to verified recipients or the SES mailbox simulator, at most 200 messages per day and one
message per second.

Check the account:

```sh
aws sesv2 get-account --region us-west-2
```

After the production identity is verified, request production access as transactional mail:

```sh
aws sesv2 put-account-details \
  --region us-west-2 \
  --production-access-enabled \
  --mail-type TRANSACTIONAL \
  --website-url https://friendminton.com \
  --additional-contact-email-addresses YOUR_MONITORED_CONTACT \
  --contact-language EN
```

The command submits an AWS review; Terraform cannot approve it. Wait until
`ProductionAccessEnabled` and `SendingEnabled` are both `true`. Before using real recipients, test
success, bounce, and complaint behavior with the SES mailbox simulator.

## Create sender credentials outside Terraform

Lightsail cannot attach an EC2-style IAM instance role. The stack therefore creates one sender user
per environment but deliberately creates no access key:

```sh
aws iam create-access-key --user-name friendminton-staging-ses-sender
aws iam create-access-key --user-name friendminton-production-ses-sender
```

Each secret access key is shown only once. Put each environment's key only in that server's
deployment-user-owned `.env.staging` or `.env.production`, set the file mode to `0600`, and never
put it in Git, GitHub Actions, Terraform variables, or Terraform state. The deploy user must own the
file because it runs Docker Compose and reads the environment during deployment.

Use the non-secret values shown by:

```sh
terraform output -json runtime_email_configuration
```

The application intentionally uses `SES_AWS_ACCESS_KEY_ID` and `SES_AWS_SECRET_ACCESS_KEY`, not the
standard AWS credential variable names. Standard variables would override Lightsail's temporary
object-storage credential chain and break media access. `SES_AWS_SESSION_TOKEN` remains empty for
these IAM-user keys.

## Inspect events and alarms

SES event records contain recipient addresses and delivery metadata, but not message bodies.
Access them only for operations and allow the configured 30-day retention to expire them:

```sh
aws logs tail /aws/events/friendminton/ses/staging \
  --region us-west-2 \
  --since 1h \
  --follow

aws logs tail /aws/events/friendminton/ses/production \
  --region us-west-2 \
  --since 1h \
  --follow
```

The configuration sets publish send, reject, bounce, complaint, delivery, rendering-failure, and
delivery-delay events. Open and click tracking are intentionally disabled so SES does not rewrite
verification or password-reset links. Account alarms fire at a 5% bounce rate and a 0.1% complaint
rate; EventBridge `FailedInvocations` alarms detect a broken CloudWatch event-log path.
