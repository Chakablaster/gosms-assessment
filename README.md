# GoSMS – SMS Credit Reload Feature

This project is an implementation of the SMS Credit Reload feature for GoSMS, a digital loyalty software platform.

The feature allows SMS credits to be allocated across multiple outlets under a selected brand. Instead of handling each outlet separately, users can enter the required credits, review the total, and generate a quotation containing the allocation details.

The implementation also includes credit balance tracking, quotation history, email delivery, and safeguards against duplicate allocations.

## How It Works

The process starts by selecting a brand. Each brand has its own outlets, which are displayed alongside their existing SMS credit balances.

Users enter the number of credits they want to allocate to each outlet. The total updates automatically, and the inputs are validated before a quotation can be generated.

Once the quotation is confirmed, the system:

1. Allocates the requested SMS credits to the corresponding outlets.
2. Saves the quotation and allocation records.
3. Refreshes the displayed credit balances.
4. Attempts to send the quotation to the brand's registered email address.

Previously generated quotations can be accessed through History, where their original details can be viewed without modifying the allocation.

## Features

### Brand and Outlet Management

- Select from multiple brands with their respective outlets.
- View existing SMS credit balances for each outlet.
- Enter different credit amounts for individual outlets.
- Switch between brands without losing unfinished entries during the current session.

### SMS Credit Allocation

- Automatically calculate the total credits being allocated.
- Validate credit amounts before quotation generation.
- Treat empty inputs as zero.
- Reject negative numbers, decimals, invalid characters, and unsupported amounts.
- Prevent quotations with zero total credits.

### Quotation Generation

- Generate quotations containing brand, company, and outlet information.
- Display individual outlet allocations and their totals.
- Save generated quotations for later reference.
- Start a new allocation with cleared inputs after completing a quotation.

### Credit Balances and History

Credit balances and generated quotations are stored in Upstash Redis, allowing them to remain available after refreshing or reopening the application.

Quotation history is maintained separately for each brand. Saved quotations can be opened for reference without changing their original allocation details.

### Error Handling and Recovery

A key consideration was preventing duplicate credit allocations when requests fail.

If the connection is interrupted during quotation generation, the system retains the original operation details. Retrying the request uses the same operation identifier, allowing the server to recognise an allocation that has already been completed.

Credit allocation and quotation storage are handled atomically to prevent partial updates.

Email delivery and balance refreshing are handled separately from the confirmed allocation. A failure in either operation does not reverse successfully allocated credits. Failed email delivery can also be retried without generating another quotation.

## Technology Stack

| Technology | Usage |
|---|---|
| React | Frontend interface |
| Vite | Frontend development tooling |
| Tailwind CSS | Interface styling |
| JavaScript | Application and backend logic |
| Node.js | Backend services |
| Vercel | Serverless API deployment |
| Upstash Redis | Persistent balances and quotation history |
| Nodemailer | Quotation email delivery |
| Vitest | Automated testing |
| React Testing Library | Component and interaction testing |

## Project Scope

This repository implements the SMS Credit Reload feature, not the complete GoSMS platform.

The brand, company, and outlet information is provided through sample data for demonstrating the feature. The implementation focuses on the credit reload process and the supporting functionality required to manage quotations and allocations reliably.