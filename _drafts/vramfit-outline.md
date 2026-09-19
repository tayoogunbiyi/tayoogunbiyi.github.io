# Will this LLM fit? Building and testing a GPU memory estimator

Working outline for a fresh post. Audience: engineers, hiring managers and people
working on AI inference. Target length: 1,800–2,400 words.

## Story and voice

A first-person walkthrough: a practical question, the calculation behind it, a
working tool, and experiments that sharpen what “fits” means. Explain concepts
through concrete examples and short code excerpts. Let the engineering decisions
and measurements demonstrate the work.

Voice references:

- [microgpt](https://karpathy.github.io/2026/02/12/microgpt/): build intuition alongside small pieces of code.
- [A from-scratch tour of Bitcoin in Python](https://karpathy.github.io/2021/06/21/blockchain/): move from curiosity to a concrete working result.

Use these structural qualities in an original voice. Source the post from the
implementation, recorded experiments and our project discussion. Do not reuse
the earlier draft reports or posts.

## 1. I wanted to know which GPU I needed

Open with the practical question: given a model, input length, output length and
number of simultaneous requests, how much GPU memory do I need?

- Briefly describe trying estimation tools and wanting to understand their assumptions.
- Introduce the difference between loading weights and serving a workload.
- Preview the tool and the experiments in a few sentences.

Before drafting the personal history, establish which tools were actually tried
and what prompted further investigation. Do not invent comparisons or shortcomings.

## 2. Start by counting bytes

Build the estimate from two components:

1. Weights: learned parameter count × bytes per parameter.
2. KV cache: stored attention keys and values, growing with tokens and concurrent requests.

Explain each term before combining them:

```text
KV bytes per token =
    2 × layers × KV heads × head dimension × bytes per element

Workload KV bytes =
    KV bytes per token × (input tokens + maximum output tokens) × concurrency
```

Use Qwen3-4B as the worked example. Explain why the calculation uses KV heads,
which need not equal the number of query heads. Budget every request's full
input and maximum output at once.

Takeaway: parameter count alone cannot answer the serving-memory question.

## 3. Turning the arithmetic into a useful tool

Introduce `vramfit` through the decisions that matter:

- Inspect Hugging Face metadata without downloading model weights.
- Resolve learned parameter counts and model geometry, including shared weights.
- Apply the selected runtime precision to weights and KV cache.
- Support a defined set of dense, full-attention decoders.
- Report missing evidence as unknown and reject unsupported configurations.

Show a short excerpt from `src/vramfit/memory.py`, then the actual Qwen3-32B CLI
run: an 80 GiB budget, 15% headroom, BF16, eight simultaneous requests with 8,192
input and 2,048 output tokens each. The estimate is 81.02 GiB against 68.00 GiB
usable; weights fit, but the workload exceeds the budget by 13.02 GiB.

Label this as an estimator run. Qwen3-32B was not one of the models tested on the GPU.

## 4. Does the estimate agree with a real GPU?

Explain the experiment before showing results:

- One NVIDIA A40 with 44.99 GiB visible VRAM.
- Qwen3-4B and DeepSeek-R1-Distill-Llama-8B, using pinned revisions.
- BF16 weights/cache, vLLM 0.11.0 and GuideLLM 0.7.3.
- A: one request, 512 input + 128 output tokens.
- B: eight requests with the same lengths.
- C: eight requests, 4,096 input + 256 output tokens.

Compare predicted parameter bytes with logged model allocations, and predicted KV
with occupied cache inferred from sampled engine blocks. These are component
comparisons, not an independent measurement of total GPU memory.

| Model | Case | Predicted KV (GiB) | Peak occupied KV (GiB) | Delta |
| --- | --- | ---: | ---: | ---: |
| Qwen3-4B | A | 0.08789 | 0.09009 | +2.50% |
| Qwen3-4B | B | 0.70312 | 0.72070 | +2.50% |
| Qwen3-4B | C | 4.78125 | 4.79883 | +0.37% |
| Distill-Llama-8B | A | 0.07812 | 0.08008 | +2.50% |
| Distill-Llama-8B | B | 0.62500 | 0.64062 | +2.50% |
| Distill-Llama-8B | C | 4.25000 | 4.25391 | +0.09% |

Delta is observed minus predicted, divided by predicted. Logged model allocations
were within 0.9% of predicted weight memory.

Explain the differences immediately: chat-template tokens and 16-token cache
blocks. Requests also reach different lengths at different times, and samples
can miss peaks; DeepSeek C's smaller delta does not establish better accuracy.

## 5. A successful request is not enough

The main experimental turn: baseline requests completed, but that did not show
where simultaneous resident capacity ends.

Describe the follow-up:

1. Restrict Qwen's KV pool to 2 GiB.
2. Predict that three long requests fit and four do not.
3. Run three, then four, then repeat three.
4. Increase the pool to 4 GiB as a control.
5. Keep the server sequence limit at eight, above the tested concurrency.

| Cache | Offered concurrency | Peak running | Samples with a queue |
| --- | ---: | ---: | ---: |
| 2 GiB | 3 | 3 | 0.0% |
| 2 GiB | 4 | 3 | 88.1% |
| 2 GiB, repeat | 3 | 3 | 0.0% |
| 4 GiB | 4 | 4 | 4.9% |

Walk through the block arithmetic: 909 usable blocks; each full sequence requires
273 blocks, so three need 819 and four need 1,092. The remaining 90 blocks cannot
hold another complete 257-block prompt.

Main finding: the server can complete requests by making them wait. Completion
does not establish that the requested concurrency fits in memory. This experiment
restricts the cache on an A40; it does not validate a smaller physical GPU.

## 6. What I now look at when sizing a workload

Close with the practical lessons:

- Budget input/output lengths and concurrency alongside weights.
- Distinguish reserved cache, occupied cache and queued requests.
- Treat headroom as an allowance, not measured runtime overhead.
- Use the estimate to narrow choices, then measure the intended serving configuration.

State the limits briefly: two models, one GPU, no quantization or multi-GPU
validation, and no throughput guarantee. End with the tool and reproduction links.

## Source map for drafting

- [Project and actual CLI output](https://github.com/tayoogunbiyi/vramfit)
- [Memory calculation](https://github.com/tayoogunbiyi/vramfit/blob/main/src/vramfit/memory.py)
- [Model adapters](https://github.com/tayoogunbiyi/vramfit/tree/main/src/vramfit/adapters)
- [Validation results and reproduction](https://github.com/tayoogunbiyi/vramfit/blob/main/validation/README.md)
- [Baseline measurements](https://github.com/tayoogunbiyi/vramfit/blob/main/validation/evidence/baseline/results.csv)
- [Boundary measurements](https://github.com/tayoogunbiyi/vramfit/blob/main/validation/evidence/boundary/results.csv)

Keep package setup, SSH troubleshooting and detailed logs out of the narrative
unless they explain a measurement or an engineering decision. Link to the
validation README for operational details.
