# CoinFlow — Product Scope

## Core Idea

CoinFlow is a personal finance and expense-tracking app designed to make recording expenses as effortless as possible.

The primary problem it solves is that manually tracking every transaction is tedious, while many existing finance apps can feel slow, complicated, or disconnected from the way people actually make payments.

CoinFlow's core principle is:

> The user should record as little as possible.

Instead of requiring users to manually enter every transaction, CoinFlow detects transaction SMS messages and turns them into transaction suggestions that the user can quickly confirm.

The ideal experience is:

Transaction happens
→ Bank/UPI SMS arrives
→ CoinFlow detects and parses it
→ CoinFlow sends a notification
→ User taps the notification
→ User quickly reviews/edits the transaction
→ Transaction is added

Over time, CoinFlow should become increasingly intelligent and require less manual input.

---

# Target Users

Primary target:

- College students
- Young adults
- People who have recently started working

The initial product is primarily designed around the creator's own everyday use case.

The target users are people who:

- Make frequent digital payments
- Use UPI/bank accounts/cards regularly
- Want to understand where their money goes
- Find manual expense tracking tedious
- Want something fast and simple rather than a complicated personal-finance platform

---

# VERSION 1 — Core Expense Tracking

## 1. Automatic Transaction Detection

CoinFlow should detect relevant transaction SMS messages.

It should determine information such as:

- Whether money was credited or debited
- Transaction amount
- Date/time
- Merchant/person when available
- Payment method when available
- Other useful information that can be extracted from the SMS

CoinFlow should NOT attempt to import the user's entire historical SMS history initially.

The primary workflow is:

> Detect transactions as they happen.

---

## 2. Transaction Notification

When CoinFlow detects a relevant transaction, it should immediately notify the user.

Example:

> ₹450 debited
>
> Swiggy
>
> Add transaction?

The notification should allow the user to quickly open the transaction confirmation interface.

The goal is to make recording a transaction take as few interactions as possible.

---

## 3. Transaction Confirmation

When the user opens the notification, CoinFlow should show the transaction details that were automatically detected.

For example:

> ₹450  
> Swiggy  
> UPI  
> Food

The user should be able to review and edit the information before adding it.

CoinFlow should avoid asking the user to manually enter information that can already be inferred from the SMS.

The ideal interaction should be:

> Detect → Review → Confirm → Done

---

## 4. Manual Transactions

Not every transaction will generate an SMS.

For example:

- Cash payments
- Certain transactions CoinFlow cannot detect
- Transactions where the SMS parser fails

Therefore, CoinFlow should provide a manual "Add Transaction" option.

The user should be able to specify:

- Amount
- Credit/debit
- Payment method
- Category
- Date/time
- Merchant/person
- Optional note

---

## 5. Transaction List

CoinFlow should maintain a chronological list of recorded transactions.

Each transaction should contain information such as:

- Amount
- Credit/debit
- Merchant/person
- Category
- Payment method
- Date/time

Users should be able to open a transaction and edit its details.

---

## 6. Categories

Users should be able to categorize transactions.

Example categories:

- Food
- Transport
- Shopping
- Entertainment
- Education
- Bills
- Groceries
- Health
- Other

Categories should eventually be customizable.

Users should be able to create, rename, or modify categories according to their own needs.

---

## 7. Uncategorized Transactions

If CoinFlow cannot confidently determine a category, it should not guess blindly.

Instead, it can mark the transaction as:

> Uncategorized

The user can assign a category manually.

This information can later be used to improve automatic categorization.

---

## 8. Automatic Categorization

CoinFlow should gradually become more intelligent.

For example:

First transaction:

> ₹430 — Swiggy
>
> Category: ?

User selects:

> Food

Later:

> ₹290 — Swiggy
>
> Category: Food

Eventually, CoinFlow should be able to automatically suggest or assign categories based on previous user behavior.

The goal is:

> The more the user uses CoinFlow, the less they need to manually categorize transactions.

---

## 9. Spending Summary

CoinFlow should provide basic spending statistics.

For a selected period, especially a month, the user should be able to see:

- Total expenditure
- Total income/credits
- Spending by category
- Average spending
- Largest expenses
- Other useful summary statistics

Example:

> August Spending: ₹18,420
>
> Food: ₹5,200
> Shopping: ₹3,800
> Transport: ₹2,100
> Entertainment: ₹1,400
> Other: ₹5,920

The exact charts/visualizations will be decided later based on what information is actually useful to the user.

---

## 10. Insights

CoinFlow should eventually translate raw transaction data into useful observations.

Examples:

> Food was your biggest expense this month.

> You spent 18% more this month than last month.

> Your average daily spending was ₹594.

> Shopping accounted for 21% of your spending.

The goal is not simply to display charts, but to help the user understand their spending.

---

# Important V1 Product Principle

A bank transaction is NOT necessarily the same thing as an expense.

CoinFlow should distinguish between:

- Expenses
- Income
- Transfers
- Reimbursements
- Refunds
- Other money movements

This distinction is important because simply treating every debit as an expense can produce incorrect spending statistics.

For example:

₹1,000 transferred between the user's own accounts should not count as ₹1,000 of spending.

This underlying transaction model should be designed with these distinctions in mind, even if some advanced functionality is implemented later.

---

# VERSION 1.5 — Split Expenses & Reimbursements

V1.5 introduces the concept of shared expenses.

## 1. The Split Expense Problem

Example:

Three friends buy ₹90 worth of momos.

One person pays the full ₹90.

The other two friends send ₹30 each.

The bank activity becomes:

> ₹90 debited
>
> ₹30 credited
>
> ₹30 credited

But the user's actual expense is only:

> ₹30

CoinFlow should not treat all three transactions as independent expenses.

---

## 2. Group / Split Expenses

The user should be able to mark an expense as shared.

Example:

> Momos — ₹90
>
> People: 3
>
> Your share: ₹30
>
> Others owe you: ₹60

CoinFlow should represent the original ₹90 transaction as a shared expense rather than simply treating it as a ₹90 personal expense.

---

## 3. Settlements

When the other people pay their shares, those incoming transactions should be recognized as settlements/reimbursements rather than new income.

Example:

Original expense:

> ₹90

Friend A:

> +₹30

Friend B:

> +₹30

Final effective expense:

> ₹30

The ₹60 received should offset the shared expense.

---

## 4. Automatic Split Detection

CoinFlow should eventually be able to recognize possible shared expenses without the user explicitly setting them up beforehand.

Example:

> ₹90 debited
>
> followed shortly by
>
> ₹30 credited
>
> ₹30 credited

CoinFlow could suggest:

> Possible split expense detected.
>
> ₹90 paid
> ₹60 received back
>
> Effective expense: ₹30
>
> [Confirm] [Keep Separate]

This should initially be based on simple rules/heuristics rather than requiring sophisticated AI.

---

## 5. Manual Split

After any transaction, the user should eventually be able to select:

> Split

Then specify:

- Number of people
- Each person's share
- Who owes whom
- Optional names/contacts

CoinFlow can calculate:

> Total: ₹1,200
>
> Your share: ₹300
>
> Others owe you: ₹900

---

## 6. Settlement Tracking

CoinFlow could eventually keep track of outstanding amounts.

Example:

> Rahul owes you ₹450
>
> Dinner: ₹300
> Cab: ₹150

When Rahul pays, CoinFlow can associate the incoming transaction with the outstanding amount.

---

# Long-Term Product Direction

The long-term goal is not simply to build another expense tracker.

The vision is:

> A personal finance app that learns how you spend and requires progressively less effort to maintain.

The product should move toward:

Manual tracking
→ Automatic transaction detection
→ Automatic categorization
→ Automatic recognition of transfers/reimbursements
→ Intelligent spending insights
→ Minimal user input

---

# Core Product Principles

1. Minimize manual entry.

2. Detect information automatically whenever possible.

3. Do not ask the user for information the system already knows.

4. Never confuse money movement with actual spending.

5. Make common actions extremely fast.

6. Learn from the user's corrections and behavior.

7. Prefer useful financial insights over decorative charts.

8. Keep the core experience simple before adding advanced financial features.

9. Design the underlying transaction model to support future features such as split expenses, reimbursements, transfers, refunds, and recurring transactions.

10. The ultimate goal is:

> "I don't track my expenses. CoinFlow does it for me."