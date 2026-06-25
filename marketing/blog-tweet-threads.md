# Blog cross-post threads (X / Twitter)

Condensed thread versions of the two blog posts (the "Documentation and blog posts"
M2 deliverable). Voice: build-in-public, concrete, low jargon. Each tweet ≈280
chars.

**Before posting — verify:** the blog URLs go live once `/blog` deploys. Numbers are
kept qualitative on purpose (no hard KPI figures published). Want a Spanish version?
These are English to match the posts — say the word and I'll translate (your audience
skews ES, so a Spanish thread may convert better).

---

## Thread 1 — Dollars, over WhatsApp (the product)

**1/**
Most people in LATAM who ask for dollars are not making a crypto bet.

They're doing normal life math: rent, invoices, money for mom, savings that should still be worth something next month.

So we built the dollar wallet where they already are: WhatsApp.

**2/**
Sippy starts with a message.

Say hi, get a self-custodial USDC wallet tied to your phone number. No app store. No seed phrase. Then sending can be as simple as:

"envía 10 a mamá"

A moment later, your mom has $10 and both sides get a receipt.

**3/**
Under the hood: USDC on Arbitrum, gas sponsored by us, non-custodial smart accounts.

That matters to the system. It should not have to matter to the user.

The product is the interface. The wallet is yours.

**4/**
The rule we care about most:

AI can help read a message. It cannot move money.

Common messages go through deterministic rules. Ambiguous ones may get model help, but the payment path still checks recipient, amount, balance, and confirmation.

**5/**
What 45 beta users taught us fast:

- Every number on screen is a promise.
- Some people couldn't find their wallet — it was so simple they didn't believe it was real.
- A skipped onboarding step still needs a landing place.
- Crypto nouns belong in our code, not in the chat.

**6/**
Does it work?

Early, but yes. Real people — most of them in Colombia — are sending real dollars to family, friends, and vendors over a chat. No crypto interest required.

Still small. Also real.

**7/**
Full tour of how it works: https://sippy.lat/blog/how-sippy-works

Try it on WhatsApp: https://wa.me/14722261449
About 30 seconds and you have a dollar wallet where your money conversations already happen.

---

## Thread 2 — Crypto before the crypto lesson (AI + crypto, and where we're going)

**1/**
Consumer crypto spent years asking people to pass the class before getting the benefit.

Install the wallet. Learn the chain. Buy the gas token. Save the phrase. Understand the bridge.

Most people stopped at the class.

**2/**
Sippy starts with the benefit.

A dollar account inside WhatsApp.

The crypto is still real: USDC in a self-custodial wallet, settling on a public network.

We just don't make the user learn the words before the product works.

**3/**
Why now:

Stablecoins made dollars usable on open rails.
Cheap networks made small transfers practical.
WhatsApp solved distribution.
AI gives people a plain-language interface.

The pieces finally fit.

**4/**
The line we will not cross:

The model can help understand what you meant. It cannot move money.

Money commands go through deterministic checks. Recipient, amount, balance, confirmation.

Helpful interface. Boring payment path.

**5/**
Training wheels still count.

The user is not in a simulation. They are holding digital dollars in their own wallet and moving them over public rails.

They just don't have to learn the whole machine on day one.

**6/**
We watched this happen in Cartagena.

141 people, most with no crypto background, opened WhatsApp and had working dollar wallets within seconds. Some used them to pay vendors.

The interesting part was not that they understood the stack. It was that they did not need to.

**7/**
If a dollar wallet can be as easy as a chat, a lot changes:

- Remittances can start with a message.
- Merchant payments do not need hardware first.
- Savings do not need to start with a bank account.
- Routine money work can get an assistant, with limits.

**8/**
We are not betting on a sudden jump to fully autonomous money. That is how you lose trust.

The path is gradual: simple transfers, reliability, bounded help, user control.

People can get the useful parts of crypto before learning the words.

**9/**
Full piece: https://sippy.lat/blog/training-wheels-for-web3

Building toward the same future? Let's talk: hello@sippy.lat
Or just say hi: https://wa.me/14722261449
