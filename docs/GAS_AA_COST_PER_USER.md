# Sippy — gasless onboarding cost per user

What it costs to give one new user a deployed smart wallet + a $50/day spend permission, fully sponsored (zero ETH drip), via the Track-B cold-onboard (`deploy + approve` in one Pimlico-sponsored ERC-4337 UserOperation).

## The fixed part (gas), measured on the first prod onboard

Reference op: account `0xf0aeAea578783e982749e6F3B439137F79Ae1833`, setup tx `0x387d3e19c56bf4d1b7c771fbefbf686bbe39fa9e90707463d7d0ea042f45c99f` (Arbitrum One).

| Component                             | Value                                                         |
| ------------------------------------- | ------------------------------------------------------------- |
| Gas used (actual)                     | **431,533** (≈ 432k; deterministic for a cold deploy+approve) |
| Effective gas price                   | ~**0.020 gwei** (Arbitrum One, typical)                       |
| On-chain `actualGasCost`              | **0.000008694 ETH**                                           |
| Pimlico Verifying Paymaster surcharge | **+10%**                                                      |
| **Billed per onboard**                | **≈ 0.00000956 ETH**                                          |
| Pimlico API credits                   | **$0** — 10M/mo free tier; we use ~22k/wk                     |

The gas _amount_ barely moves between onboards (same deploy+approve). The only real variables are the **ETH price** and the **Arbitrum gas price (gwei)**, which is already at the floor.

## Cost per user vs. ETH price

`cost ≈ 0.00000956 ETH × ETH_price` (gas + 10% surcharge; API credits free).

|          ETH price | Cost / onboard | 1,000 onboards |   10,000 |    100,000 |
| -----------------: | -------------: | -------------: | -------: | ---------: |
|             $1,500 |        $0.0143 |            $14 |     $143 |     $1,434 |
| **$1,600 (today)** |    **$0.0153** |        **$15** | **$153** | **$1,530** |
|             $2,000 |        $0.0191 |            $19 |     $191 |     $1,913 |
|             $2,500 |        $0.0239 |            $24 |     $239 |     $2,391 |
|             $3,000 |        $0.0287 |            $29 |     $287 |     $2,869 |
|             $4,000 |        $0.0382 |            $38 |     $382 |     $3,825 |
|             $5,000 |        $0.0478 |            $48 |     $478 |     $4,782 |
|            $10,000 |        $0.0956 |            $96 |     $956 |     $9,563 |

So today an onboard is **~1.5 cents**; even at a $10k ETH it's under **10 cents**. (The earlier "$0.09" intuition was the _cumulative_ week-of-testing spend, ~$0.12 across ~8 sponsored ops — not one user.)

## Cost per transaction (a WhatsApp send)

A regular send (the free-send: pull from the user's spend permission + USDC transfer, no deploy) is cheaper than onboarding. Measured on a real prod send, tx `0x21b60c980240aafe2ab58ef49b2248998d5c8bbd2e22b46170e74d281b533025`:

| Component                | Value                                       |
| ------------------------ | ------------------------------------------- |
| Gas used (actual)        | **239,272** (~55% of an onboard; no deploy) |
| On-chain `actualGasCost` | **0.000004965 ETH**                         |
| + 10% Pimlico surcharge  | → **0.00000546 ETH billed**                 |

`cost ≈ 0.00000546 ETH × ETH_price`:

|          ETH price | Cost / send |
| -----------------: | ----------: |
| **$1,600 (today)** | **$0.0087** |
|             $3,000 |     $0.0164 |
|             $5,000 |     $0.0273 |
|            $10,000 |     $0.0546 |

A send is **under a cent** today.

## Worked example: a power user (onboard + 100 sends)

One onboard (0.00000956 ETH) plus 100 sends (100 × 0.00000546 ETH) = **0.000556 ETH** of sponsored gas over the user's lifetime:

|          ETH price | Onboard | 100 sends | **Total / power user** |
| -----------------: | ------: | --------: | ---------------------: |
| **$1,600 (today)** |  $0.015 |     $0.87 |              **$0.89** |
|             $3,000 |  $0.029 |     $1.64 |                  $1.67 |
|             $5,000 |  $0.048 |     $2.73 |                  $2.78 |
|            $10,000 |  $0.096 |     $5.46 |                  $5.56 |

A very active user — signs up and sends 100 times — costs us **under $1 in gas today**, and under ~$3 even if ETH triples.

## Sensitivities & levers

- **ETH price** — the dominant driver (table above). Linear.
- **Arbitrum gas price (gwei)** — usually ~0.01–0.05 gwei. A congestion spike scales the ETH-gas linearly, but off such a tiny base it stays sub-cent-to-few-cents. The 599k `verificationGasLimit` reservation is _not_ a cost — the EntryPoint refunds unused gas (this op used 54% of reserved).
- **Pimlico 10% surcharge** — fixed; only avoidable by self-operating a paymaster (not worth it at this scale).
- **Arbitrum Gas Station grant (ARBIFUEL)** — if approved, covers the **gas portion**, driving cost-per-user toward **~$0**. Application in progress.

## One-line takeaway

≈ **$0.015 to onboard a user** and **~$0.009 per send**, at today's ETH (~$1.6k). A power user (onboard + 100 sends) ≈ **$0.89**. Scales linearly with ETH price; API credits free; ~$0 if the ARBIFUEL grant lands. 100k onboards ≈ $1.5k today.

_Last updated 2026-06-27. ETH ≈ $1,590. Recompute `cost/onboard = 0.00000956 × ETH_price` if ETH moves materially._
