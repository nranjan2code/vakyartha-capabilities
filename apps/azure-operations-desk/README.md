# Azure Operations Desk

A local desk for managed customer subscriptions. Register scopes, review inventory and operational signals, assign owners and notes, and export the current queue or inventory as CSV.

## Capture and review

1. In **Customers**, register a customer name, subscription name, subscription tenant ID and subscription ID. The optional default owner is used for new signals. Select a saved subscription to edit its names or default owner.
2. Use a signed-in Azure CLI session with permission to read the subscription and the three sources. From this package folder, run the command shown in **Captures**, using Node 26. This collector uses the public Azure cloud.
3. Paste the JSON output in **Captures**, then select **Import capture**. Each source has a UTC observation time and coverage status. A report of unavailable data carries a reason and no rows. A successful zero-row capture appears separately.
4. In **Needs attention**, review the top-priority open signal first, or filter by subscription and local status. Open a signal to see its observed condition and dates, save triage, and inspect its Azure resource references. Save a local status, owner and follow-up note. **Inventory** shows searchable, sortable Resource Graph records for one subscription. **Export queue CSV** and **Export inventory CSV** use the host Downloads action.

The collector checks subscription ownership with Azure Resource Manager and fetches projected Resource Graph inventory, fired Azure Monitor alerts in the previous 30 days, and active Service Health events or current advisories and maintenance within the query window. Coverage describes the result of the scoped capture and the signed-in identity's visibility. The collector marks unfinished pages and malformed results unavailable. Resource-scoped delegation may be insufficient for these subscription-level reads. The app accepts 32 subscriptions, up to 1,200 inventory rows, 200 alerts, and 100 health events per subscription, and up to 768 KiB per submitted capture. An overall local checkpoint limit also applies.

A new capture replaces that subscription's prior source results. The desk keeps local triage keyed by the original signal ID, so a previously triaged signal keeps its follow-up when it reappears. The visual and spoken counts are derived from the same imported data. Captures older than 24 hours display as stale when projections next render. A successful empty capture refers to the source's query and time window only.

Collection runs manually in the engineer's terminal. The desk stores validated capture fields and local triage in Vakyartha, and makes no Azure calls from the app. Azure Monitor supplies paging. Triage changes are local, and protected or sensitive event details remain in Azure. Use the Azure resource ID to locate the source record in the portal. The queue CSV excludes follow-up notes.

**Service review** has a handover snapshot, work log, and billing. Open monitor alerts and service work are summarized by severity or type. A ring chart appears when the records span more than one category. The work log records incident, maintenance, backup, patching, security, access, cost and change follow-up, with a due date and optional ticket reference. Closing an item requires evidence. The service-review CSV includes recorded evidence and scope, so review its contents before handing it over.

Billing accepts a complete single-invoice reconciliation CSV with `InvoiceNumber`, `CustomerId`, `Currency`, `Subtotal`, `TaxTotal`, and `Total`. Enter the matching invoiced charges total before pasting the CSV. The desk adds exact decimals, groups lines by customer tenant, flags unmatched customer mappings, and shows the difference between the entered amount and the sum of the reconciliation lines. It keeps only normalized aggregates, with one currency per invoice and currency key. It does not initiate a purchase, issue an invoice, or change billing records.

The Workbench can use the two shared read tools to list registered scopes and load one selected subscription's snapshot. Tool access is governed by the host.

The package is for Vakyartha Dev. The collector's response paths are checked against fixtures with detached customer scopes. An authorized live subscription is needed to validate permissions and collection in the target environment.

[Resource Graph REST API](https://learn.microsoft.com/en-us/rest/api/azureresourcegraph/resourcegraph/resources/resources) · [Fired alerts API](https://learn.microsoft.com/en-us/rest/api/alerts-management/alerts/alerts/get-all) · [Service Health queries](https://learn.microsoft.com/en-us/azure/governance/resource-graph/samples/samples-by-category)

[Invoice reconciliation fields](https://learn.microsoft.com/en-us/partner-center/billing/modern-invoice-reconciliation-file)
