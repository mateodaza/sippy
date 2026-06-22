Most people in Latin America who ask for dollars are not making a crypto bet. They are doing normal life math: a rent deposit, a freelance invoice, money for mom, savings that should still be worth something next month.

The hard part is not wanting dollars. The hard part is getting to them without being sent through a bank that says no, an exchange counter that takes a cut, or a wallet setup that starts with twelve random words and a warning not to lose them.

Sippy starts from a smaller question: what if the dollar wallet began where people already are?

Inside WhatsApp.

You say hi. Sippy creates a self-custodial dollar wallet tied to your phone number. You do not download another app. You do not write down a seed phrase. To move money, you text the way you already text.

## The thirty-second version

From then on, a transfer can look this simple:

> envía 10 a mamá

A moment later your mom has ten dollars, and both of you get a clear receipt. No network names. No gas. No contract addresses. If you can send a voice note, you can send a dollar.

The dollars are USDC, a fully backed digital dollar, on Arbitrum, a fast and cheap network built on Ethereum. That matters to the system. It does not have to matter to the user, the same way SMTP matters to email without showing up in your inbox.

## What actually happens when you hit send

Under the friendly surface, a message goes through a plain payment path:

1. Your WhatsApp message reaches Sippy.
2. Fast rules check whether it is something obvious: balance, help, a standard send, a payment QR.
3. If it is a send, Sippy resolves the recipient, confirms the amount, and checks that the command is valid.
4. The USDC moves on-chain from your wallet.
5. Sippy pays the small network fee for you and sends both sides a receipt.

Two details in that flow matter more than the rest.

The first is custody. Sippy uses non-custodial smart accounts built on Coinbase's developer infrastructure. Your balance is not pooled in a Sippy company account. The product is the interface; the wallet is yours.

The second is interpretation. Money over chat only works if the system can understand messy human messages without giving a model permission to spend.

## The rule that keeps AI away from the button

Sippy has an AI layer. It helps turn "mándale a mi hermano lo de la pizza" into a structured intent: a transfer, to a person, for an amount.

But the model does not move funds. It can help read a message. It can propose what it thinks the user meant. The actual money path is handled by deterministic rules: plain, auditable code that checks the recipient, the amount, the balance, and the allowed action.

About 80% of everyday messages never need the model at all. Balance checks, common sends, saved contacts, and "ayuda" go through fast rules in under a millisecond. The model is only for the ambiguous edge cases, and even there it does not get the final say.

That split is the reason a chat interface can be safe near money. Understanding can be flexible. Spending cannot.

## The design rules we don't break

We learned most of these by watching 45 people in a closed beta try to send real money to people they care about. Every awkward step showed up immediately.

**Every number on screen is a promise.** Early on, people could choose a $500 daily limit during setup while the system quietly kept them at $50 until they verified an email. The number they chose and the number they actually had were different. That meant a $80 dinner payment could fail without a clear reason. We fixed the screen so it tells the truth: show the limit you have, and show the bigger one as available after email verification. In a money app, a number you cannot trust is worse than no number at all.

**People do not type like command lines.** Two thousand pesos is "2mil," not "2000." Half the continent writes decimals with a comma. People stretch words, drop accents, and abbreviate. A parser that only accepts the textbook version of a command is really telling normal people they are wrong.

**Sometimes the product is too simple to believe.** One of the first surprises was people who could not find their wallet. Not because it was hidden, but because it was so simple they did not trust it was real. They kept waiting for an app to install, a dashboard to log into, an account number to copy down. When the honest answer was "it is right here, in this chat, tied to your number," some people could not place where their money actually lived. We learned to say it plainly: there is nothing else to set up, and that is the point, not a missing step.

**A skipped step still needs a landing place.** We cut onboarding hard. Email is optional. Legal screens stay out of the fast path. There should be as few taps as possible between "hola Sippy" and a working wallet. But cutting a step only works if you know exactly where the user lands afterward. Subtraction is product work, not just deletion.

**Crypto nouns belong in our code, not in the chat.** A normal Sippy conversation should not ask you to understand gas, L2s, bridges, or contract approvals. Those are our problems to handle.

## Does it work?

So far, yes, in the only way that matters at this stage: real people have used it with real money.

We are early, and we will not pretend otherwise. But the traction is not imaginary. It is people, most of them in Colombia, sending dollars to family, friends, vendors, and themselves over a chat. That is the thing we needed to prove first: that someone with no interest in crypto will still use a conversation to move a real dollar.

## Who it's for

The person sending part of their paycheck home. The freelancer who invoices abroad and wants to hold dollars without a U.S. bank. The vendor who would rather take a digital dollar than worry about change. The family trying to save in something that holds its value.

None of them should have to become a crypto user to get that. With Sippy, they can start with a message.

[Say hi to Sippy on WhatsApp](https://wa.me/14722261449). It takes about thirty seconds, and then you have a dollar wallet where your money conversations already happen.

But how it works is the small story. The bigger one is why a chat, an AI that is never allowed to move your money, and an open network are the combination that finally puts the dollar in reach of the people who have always been priced out of it — and why the ones who need it first are not looking for crypto at all. That is what the next piece is about.
