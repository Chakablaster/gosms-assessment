# SMS Credit Reload – Backend

The backend handles quotation generation, SMS credit allocation, balance management, and email delivery for the GoSMS SMS Credit Reload feature.

Its main responsibility is to ensure that the credits requested by a user are allocated correctly and that a failed or repeated request does not result in duplicate allocations.

The implementation uses JavaScript services for business logic, with Upstash Redis providing persistent storage for the deployed feature.

## Quotation Generation

When a quotation request is received, the backend checks the selected brand and the submitted credit amounts before processing anything.

It verifies that the brand exists, that the outlets belong to the selected brand, and that the credit amounts are valid. Empty amounts are treated as zero, while negative numbers, decimals, invalid characters, and amounts exceeding the supported integer limit are rejected.

A quotation must contain at least one SMS credit allocation.

Once the request passes validation, the backend generates a quotation containing:

- A unique quotation reference and generation date.
- The selected brand's information.
- Companies and their corresponding outlets.
- SMS credits allocated to each outlet.
- Individual company totals and the overall credit total.

Only outlets receiving credits are included in the generated quotation. The backend groups these outlets by company, keeping the allocation details organised.

Credit calculations use `BigInt` to maintain integer precision, while credit amounts are represented as strings in API responses and stored records.

## Credit Allocation

After a quotation is generated, its allocation details are checked before any credits are added to the existing balances.

The backend verifies that each outlet belongs to the correct company and brand, that no outlet appears more than once, and that the company totals match the quotation total.

When an allocation succeeds, the requested credits are added to the corresponding outlet balances. Company balances are calculated from the credits held by their outlets.

Separate quotations can add further credits to an outlet without replacing its existing balance.

## Persistent Storage

The deployed feature uses Upstash Redis to store credit balances, processed operations, and quotation history.

Balances are maintained for individual outlets, while quotation history is organised by brand. This allows previously allocated credits and saved quotations to remain available after refreshing or reopening the application.

Credit allocation is performed using a Redis Lua script. Before writing anything, the script checks whether the history storage is valid and whether the requested allocation would cause an outlet's balance to exceed the supported limit.

If either check fails, the operation is rejected without modifying balances or creating a quotation record.

When the checks succeed, the allocation, operation record, and quotation history entry are committed together. This prevents a failed transaction from leaving only part of an allocation saved.

## Preventing Duplicate Allocations

A quotation request includes an operation ID that identifies the credit reload being processed.

This is important because a network failure does not always mean the allocation itself failed. The server may have completed the transaction even if the frontend never received its response.

To handle this, the backend checks whether the operation ID has already been processed.

If the same operation is submitted again with identical allocation details, the original quotation is returned without adding the credits a second time.

If an existing operation ID is submitted with different allocation details, the request is rejected with an HTTP 409 conflict response.

These checks allow uncertain requests to be retried without creating duplicate allocations or quotation history entries.

## Email Delivery

Generated quotations can be sent to the email address registered for the selected brand.

Email delivery is handled separately from credit allocation. The backend validates the quotation and recipient information before attempting to send the message through the configured SMTP service using Nodemailer.

The email contains the quotation reference, date, brand, company details, outlet allocations, and total SMS credits.

If the email cannot be sent, the already completed credit allocation remains unchanged. The frontend can request another delivery attempt using the existing quotation.

The email service also tracks successful and ongoing delivery attempts within the current server instance to avoid unnecessary duplicate sends. This tracking is held in memory rather than persistent storage.

Email delivery status is not stored as part of quotation history.

## API

The deployed feature communicates with the backend through the Vercel serverless handler in `api/gosms.js`.

The handler supports the following operations through `/api/gosms`:

| Request | Purpose |
|---|---|
| `GET ?resource=businesses` | Retrieve available brands, companies, and outlets. |
| `GET ?resource=credits` | Retrieve current credit balances and quotation counts. |
| `GET ?resource=history&brandId=...` | Retrieve saved quotations for a selected brand. |
| `POST ?resource=quotations` | Generate a quotation and process its credit allocation. |
| `POST ?resource=email` | Send an existing quotation to the registered recipient. |

The API validates incoming requests and returns appropriate error responses when an operation cannot be completed.

Business and validation errors are returned separately from unexpected server failures, allowing the frontend to respond appropriately.

## Local Backend

The repository also includes a local Node.js HTTP server in `backend/index.js`.

This server uses the same core quotation and allocation logic but maintains its credit balances and processed operations in memory.

Unlike the deployed Redis implementation, local in-memory balances do not persist after restarting the server, and the local server does not provide persistent quotation history.

The local server also uses separate `/api/` routes rather than the resource-based Vercel endpoint currently used by the frontend.

## Backend Tests

Automated backend tests are written with Vitest and maintained in `backend/tests/`.

They cover quotation calculations, input validation, credit allocation, repeated requests, and error handling.

Particular attention is given to verifying that:

- Credits are allocated to the correct companies and outlets.
- Existing balances increase correctly across separate allocations.
- Invalid quotations and conflicting requests are rejected.
- Retrying an already processed operation does not allocate credits again.
- Failed allocations do not produce partial balance changes.
- Persistent allocation logic retains balances across service instances.

The persistent allocation tests use a simulated Redis implementation to check the service behaviour without modifying live credit balances.