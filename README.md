<p align="center">
  <img src="https://raw.githubusercontent.com/PrositAS/ksef-n8n/main/src/nodes/Ksef/ksef.svg" alt="KSeF logo" width="80" height="80" />
</p>

<h1 align="center">n8n-nodes-ksef</h1>

<p align="center">
  <strong>The open-source n8n community node for Poland's KSeF e-invoicing system</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/n8n-nodes-ksef"><img src="https://img.shields.io/npm/v/n8n-nodes-ksef?style=flat-square&color=1a3c6e" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/n8n-nodes-ksef"><img src="https://img.shields.io/npm/dm/n8n-nodes-ksef?style=flat-square&color=4a9eff" alt="npm downloads" /></a>
  <a href="https://github.com/PrositAS/ksef-n8n/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/n8n-nodes-ksef?style=flat-square&color=4aff88" alt="license" /></a>
  <a href="https://n8n.io"><img src="https://img.shields.io/badge/n8n-v2.x-ff6d5a?style=flat-square" alt="n8n v2.x" /></a>
</p>

<p align="center">
  Authenticate with token or qualified certificate · Query invoice metadata · Download invoice XML · Manage sessions
</p>

---

## ✨ What Is This?

**KSeF** (Krajowy System e-Faktur) is Poland's mandatory National e-Invoice System operated by the Ministry of Finance. This node lets you connect your [n8n](https://n8n.io/) workflows directly to the KSeF API — no paid plugins, no license keys, fully open-source.

### What can you do with it?

| | Operation | Description |
|---|---|---|
| 🔍 | **Query Metadata** | Search invoices by date range, role, and filters with automatic pagination |
| 📄 | **Download Invoice** | Fetch invoice XML by KSeF number, with optional JSON parsing |
| 🔐 | **Start Session** | Authenticate and verify your credentials |
| 📊 | **Check Status** | List all active sessions and their details |

---

## 🚀 Quick Start

### Step 1 — Install the Node

In your n8n instance, go to **Settings → Community Nodes → Install** and enter:

```
n8n-nodes-ksef
```

### Step 2 — Generate a KSeF Token

1. Go to the [KSeF Taxpayer Portal (MCU)](https://ksef.podatki.gov.pl/)
2. Log in with your qualified certificate or Profil Zaufany
3. Navigate to **Tokeny** → **Generuj nowy token**
4. Select the permissions for the token:
   - ✅ **Odczyt faktur** (Invoice Read) — required for querying and downloading
   - ❌ Do **not** grant write permissions unless you need them — principle of least privilege
5. Copy the generated token (format: `YYYYMMDD-XX-XXXXXXXXXX-XXXXXXXXXX-XX|nip-XXXXXXXXXX|hash`)

### Step 3 — Configure Credentials in n8n

1. In your n8n workflow, add a **KSeF** node
2. Click **Create New Credential** and fill in:

   | Field | Value |
   |-------|-------|
   | **Environment** | `Test` for testing, `Production` for real invoices |
   | **NIP** | Your 10-digit Polish tax ID (e.g., `1234567890`) |
   | **Auth Type** | `Token` |
   | **KSeF Token** | Paste the token from Step 2 |

3. Click **Test Credential** — you should see a ✅ success message

### Step 4 — Build Your First Workflow

Here's a minimal 3-node workflow to fetch and process your invoices:

```
┌─────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│   Manual     │────▶│  KSeF: Query         │────▶│  KSeF: Download      │
│   Trigger    │     │  Invoice Metadata    │     │  Invoice             │
└─────────────┘     └──────────────────────┘     └──────────────────────┘
```

**Node 1 — Manual Trigger** (or Schedule Trigger for daily syncs)

**Node 2 — KSeF: Query Invoice Metadata**
- **Resource:** Invoice
- **Operation:** Query Metadata
- **Subject Type:** Buyer (invoices TO you) or Seller (invoices FROM you)
- **Date From:** `{{ $now.minus(30, 'days').toISO() }}` (last 30 days)
- **Date To:** *(leave empty for "now")*
- **Return All:** ✅ Yes

**Node 3 — KSeF: Download Invoice**
- **Resource:** Invoice
- **Operation:** Download
- **KSeF Number:** `{{ $json.ksefNumber }}` *(auto-mapped from query results)*
- **Parse XML:** ✅ Yes *(get structured JSON alongside raw XML)*

### Step 5 — Save to Your Favourite Destination

Chain additional nodes to store the results wherever you need:

| Destination | n8n Node |
|-------------|----------|
| Google Sheets | **Google Sheets** → Append Row |
| PostgreSQL | **Postgres** → Insert |
| MySQL | **MySQL** → Insert |
| Excel file | **Spreadsheet File** → Write to CSV/XLSX |
| Airtable | **Airtable** → Create Record |
| Email digest | **Send Email** → Weekly summary |

---

## 📋 Operations Reference

### Invoice → Query Metadata

Search for invoices within a date range. Returns flattened metadata for easy processing.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| **Subject Type** | Select | Buyer | Your role: Buyer, Seller, Third Party, or Authorized Subject |
| **Date From** | DateTime | — | Start of date range (required). Max range: 3 months |
| **Date To** | DateTime | *now* | End of date range |
| **Date Type** | Select | Permanent Storage | Filter by: Permanent Storage, Issue Date, or Invoicing Date |
| **Return All** | Boolean | ✅ | Paginate automatically through all results |
| **Limit** | Number | 50 | Max invoices when Return All is off (1–10,000) |

**Output fields:** `ksefNumber`, `invoiceNumber`, `issueDate`, `invoicingDate`, `permanentStorageDate`, `sellerNip`, `sellerName`, `buyerNip`, `buyerName`, `netAmount`, `grossAmount`, `vatAmount`, `currency`, `invoiceType`, and more.

### Invoice → Download

Download the raw XML of an invoice, with optional parsing to JSON.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| **KSeF Number** | String | — | The KSeF invoice number (e.g., from query results) |
| **Parse XML** | Boolean | ❌ | Parse XML into structured JSON alongside the raw XML |

**Output fields:** `ksefNumber`, `xml` (always), `parsed` (when Parse XML is enabled).

### Session → Start

Explicitly authenticate and return session info. All operations authenticate automatically — use this to verify your setup or warm up a session.

### Session → Check Status

List active KSeF sessions for your NIP, including auth method, start date, and token redemption status.

---

## 🔐 Authentication

### Token Authentication

The simplest method. Generate a token in the [KSeF portal](https://ksef.podatki.gov.pl/) and paste it into the credentials.

> **Note:** n8n's credential storage may transform pipe characters (`|`) in tokens. This node handles that automatically — just paste your token as-is.

### Certificate Authentication (Qualified Seal / Signature)

For organizations using qualified electronic seals or signatures:

| Field | Description |
|-------|-------------|
| **Private Key (PEM)** | Your PKCS#8 or traditional RSA private key |
| **Certificate (PEM)** | Your X.509 public certificate |
| **Passphrase** | *(Optional)* For encrypted private keys |

The node builds and signs an XAdES-BES (Basic Electronic Signature) XML request with your certificate — the same standard used by Poland's qualified trust services.

### How the Auth Flow Works Under the Hood

```
Your n8n workflow
       │
       ▼
   ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
   │ Get Challenge  │────▶│ Encrypt Token │────▶│ Submit Auth   │
   │ POST /auth/    │     │ or Sign XML   │     │ Request       │
   │   challenge    │     │ (local crypto)│     │               │
   └───────────────┘     └───────────────┘     └───────────────┘
                                                       │
       ┌───────────────────────────────────────────────┘
       ▼
   ┌───────────────┐     ┌───────────────┐
   │ Poll Status   │────▶│ Redeem Tokens │──── access + refresh tokens
   │ (auto-retry)  │     │               │     cached & auto-refreshed
   └───────────────┘     └───────────────┘
```

Sessions are cached and tokens are automatically refreshed — subsequent operations in the same workflow execution reuse the existing session.

---

## 🔧 Environments

| Environment | API Endpoint | Use Case |
|-------------|-------------|----------|
| **Production** | `api.ksef.mf.gov.pl/v2` | Real invoices |
| **Test** | `api-test.ksef.mf.gov.pl/v2` | Integration testing with test data |
| **Demo** | `api-demo.ksef.mf.gov.pl/v2` | Sandbox / learning |

---

## 🛡️ Error Handling

The node provides human-readable error messages for all KSeF API error codes:

| Code | Meaning |
|------|---------|
| 400 | Bad request — details extracted from KSeF response |
| 401 | Session expired — automatically re-authenticates on next run |
| 403 | Insufficient permissions — actionable suggestions included |
| 415 | No permissions assigned to the token |
| 429 | Rate limited — retry after the indicated delay |
| 450 | Token authentication failed |
| 460 | Certificate error |

All operations support n8n's **Continue On Fail** mode for resilient workflows.

---

## 📦 Compatibility

| | Requirement |
|---|---|
| **n8n** | v2.x (tested) |
| **KSeF API** | v2 |
| **Node.js** | 18+ |
| **Auth methods** | Token, Certificate (XAdES-BES) |
| **Environments** | Production, Test, Demo |

---

## 📜 License

[MIT](LICENSE) — use it freely in personal and commercial projects.

---

<p align="center">
  Made with ❤️ by <a href="mailto:greg@prosit.no">Greg Brzezinka @ Prosit AS</a><br />
  Need help? <a href="https://www.linkedin.com/in/brzezinka">Reach out to me</a>!
</p>
