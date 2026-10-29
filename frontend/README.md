# SMS Credit Reload – Frontend

The frontend provides the user interface for the SMS Credit Reload feature developed for GoSMS. Built with React and Tailwind CSS, it allows users to manage SMS credit allocations across different brands and outlets without having to process each outlet individually.

The interface covers brand selection, credit entry, quotation generation, email delivery feedback, and quotation history. It also handles validation and failed requests so users can recover from errors without accidentally submitting duplicate allocations.

## The Interface

### Choose Business

The feature begins with a brand selection screen. Users choose the client brand they want to work with before proceeding to its outlets.

The Continue button remains disabled until a brand is selected. If the initial business or credit balance data cannot be loaded, an error message appears with an option to retry.

### SMS Top Up

Once a brand is selected, the SMS Top Up screen displays its outlets in a table containing:

- Outlet name and code
- Company name
- Existing SMS credit balance
- SMS credits to be allocated

Users can enter the required credit amount for each outlet, with the total updating automatically.

Each brand maintains its own unfinished entries during the current session. Switching to another brand does not overwrite previously entered amounts.

The screen also provides access to quotation history and allows users to return to brand selection.

### Quotation

After submitting a valid allocation, the frontend displays the generated quotation returned by the server.

The quotation includes its reference number, date, selected brand, company details, outlet allocations, and total SMS credits.

Companies and their outlets are grouped together so the allocation details can be reviewed clearly.

Once a quotation has been generated successfully, returning to SMS Top Up starts a fresh allocation with cleared inputs.

### History

The History screen allows users to access quotations previously generated for the selected brand.

It displays the number of quotations, total quoted SMS credits, and a list of saved records. Each quotation can be opened to view its original details without modifying the allocation.

When no quotations exist, an empty history message is displayed. If the history request fails, users can retry loading it. Quotations available from the current session can still be displayed while the full history is unavailable.

## Input Validation

Credit amounts are validated as users enter them, rather than waiting until the quotation is submitted.

Only nonnegative whole numbers within the supported integer limit are accepted. Empty fields are treated as zero, while negative values, decimals, letters, and oversized amounts produce inline validation errors.

Quotation generation is prevented when invalid entries remain or when the total allocation is zero.

The total is calculated using `BigInt` to avoid precision problems when handling larger credit values.

## State Management

The frontend uses React hooks and a reducer to manage the feature's different states.

The main workflow is handled by `useSmsReload.js`, which coordinates brand selection, credit entry, quotation requests, email delivery, balance refreshing, and quotation history.

`quotationWorkflow.js` manages the state of individual credit requests, including their draft and generated states. It also tracks email delivery progress for quotations generated during the current session.

The frontend keeps unfinished credit entries in memory, separately for each brand. These drafts are not preserved after a page refresh.

Credit balances and quotation history are retrieved from the backend, allowing previously completed allocations to remain accessible across sessions.

## API Communication

The frontend communicates with the backend through the services in `frontend/src/services/`.

`gosmsApi.js` handles requests for business information, existing credit balances, quotation generation, and quotation history. `quotationEmail.js` handles requests to send generated quotations.

The deployed frontend uses the `/api/gosms` endpoint with resource parameters to access the corresponding serverless functions.

Responses are checked before their data is used, and failed requests produce error messages that can be displayed in the interface.

## Error Handling and Recovery

Quotation generation requires particular care because a failed network request does not necessarily mean the server failed to allocate the credits.

When a quotation request is submitted, the frontend assigns an operation ID to it. If the result cannot be confirmed because of a network or server failure, the original operation details are retained.

During this uncertain state, the credit fields and brand switching are locked. The user can select Retry Quotation, which resubmits the same operation rather than starting a new one.

The backend is responsible for confirming whether the allocation has already been completed.

Credit balance refreshing and email delivery take place independently after successful quotation generation.

If the balance refresh fails, the interface displays unavailable values instead of potentially outdated balances. If email delivery fails, the quotation remains valid and a Retry Email option becomes available.

Email delivery status is only tracked for the current frontend session and is not included in the saved quotation history.

## Frontend Testing

Automated tests are maintained in `frontend/src/tests/` using Vitest and React Testing Library.

They cover the interface components, input validation, credit calculations, quotation workflow, brand switching, history interactions, and email related behaviour.

The tests focus on checking that user interactions produce the expected results and that the frontend handles different workflow states correctly.