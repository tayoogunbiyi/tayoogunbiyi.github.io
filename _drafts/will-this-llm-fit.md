---
layout: post
title: "Will this LLM fit? Building and testing a GPU memory estimator"
description: "From counting weights and KV cache bytes to testing where concurrent requests start to queue on an A40."
---

I wanted to understand how to choose a GPU for serving an LLM. Given a model,
input and output lengths, and a target number of simultaneous requests,
how much GPU memory would I need?

I tried a few tools, then got curious about the calculation underneath. A model
name gives a rough parameter count: Qwen3-4B, for example, has about four billion
parameters. Multiplying that count by the bytes used to store each parameter
gives a starting estimate for the weights. But how much memory do the requests
need? What changes when one request becomes eight running at once, or when the
input and output lengths get much larger?

That became [vramfit](https://github.com/tayoogunbiyi/vramfit), a small CLI that
estimates weight and KV cache memory from Hugging Face model metadata.

Then I rented an A40 through [RunPod](https://www.runpod.io) to check the estimates.
Across six workloads on two models, peak occupied KV cache was within 2.5% of
vramfit's prediction. In a second experiment, I restricted the KV cache to see
how vLLM behaves when it cannot hold the requested concurrency in memory.

Let's work through both parts.

## Start by counting bytes

There are two components I wanted to estimate: the model's learned weights and
the attention state retained for each request.

Weights are the simpler part. Once we know the parameter count and runtime
precision:

```python
weight_bytes = parameter_count * bytes_per_element
```

Take Qwen3-4B. Using its rounded name as a starting point, four billion parameters
stored in BF16 at two bytes each would occupy eight billion bytes, or about
7.45 GiB. The checkpoint's actual parameter count gives a slightly larger
estimate: 7.4924 GiB.

The model weights are shared across requests, so eight simultaneous requests
still use one loaded model. The KV cache also needs space for the tokens retained
by each active request.

### The memory that grows with tokens and requests

During generation, attention uses keys and values from earlier tokens. The
server retains these in the **KV cache** so it can reuse them as it generates
the next token. Longer sequences need more stored keys and values.

The server manages a shared pool of cache memory and assigns blocks to requests.
For this estimate, each request needs enough blocks for its own input and output
tokens: eight requests of the same length need eight times the KV memory of one.
This assumes no reuse of cached prefixes between requests; prefix caching was
disabled in the GPU experiments below.

For the full-attention decoders supported here, the calculation per token is:

```python
kv_bytes_per_token = (
    2                  # keys and values
    * num_layers
    * num_kv_heads
    * head_dim
    * bytes_per_element
)
```

Each layer stores a key and a value, each with `num_kv_heads * head_dim` elements.
Notice that this uses the number of **KV heads**. With grouped-query attention,
multiple query heads share a set of keys and values. Using the query-head count
instead would overestimate the cache.

For Qwen3-4B in BF16, this works out to 147,456 bytes, or 144 KiB, per token. A
request with 4,096 input tokens and a maximum of 256 generated tokens has a
4,352-token budget:

```python
kv_per_request = 147_456 * (4096 + 256)
# 641,728,512 bytes = 0.59765625 GiB

kv_for_eight = kv_per_request * 8
# 4.78125 GiB
```

Together with the weights, that is about 12.27 GiB of known memory.

This budgets for all eight requests to retain their full input and maximum
output at once. During an actual run, some requests will have just started while
others are finishing, so instantaneous occupancy can be lower. The calculation
uses the full lengths deliberately: average occupancy is a poor budget for a
moment when several long requests overlap.

There is also memory outside these two components: activations, CUDA context,
workspaces and other runtime buffers. `vramfit` leaves those unmodelled and lets
you reserve a percentage of physical memory as headroom.

## Turning the arithmetic into a tool

The arithmetic is short. Getting the inputs right takes more work.

I wanted to provide a model ID, rather than manually look up layer counts and
attention dimensions every time. The tool resolves a Hugging Face revision,
reads its configuration and parameter metadata, and inspects SafeTensors headers
when it needs more evidence.

Model-specific adapters turn that information into a common description for the
calculation. They also decide whether the model's features are supported.

I kept the initial scope to non-quantized dense text decoders with uniform full
attention, including supported Llama, Qwen2 and Qwen3 configurations. Quantization,
MoE, multi-GPU serving and other attention layouts are outside the current scope.
When the tool cannot establish a parameter count, it reports `unknown`.

Here is a real estimator run for a larger model:

```sh
vramfit Qwen/Qwen3-32B \
  --vram 80 \
  --dtype bfloat16 \
  --target-concurrency 8 \
  --headroom 15 \
  --prompt-length 8192 \
  --max-output-length 2048
```

The important lines from its output are:

```text
Qwen/Qwen3-32B · EXCEEDS ESTIMATED BUDGET

Estimated memory: 81.02 GiB / 68.00 GiB usable
Budget deficit: 13.02 GiB

Weights fit, but KV cache at the requested concurrency exceeds the budget.
```

An 80 GiB GPU with 15% reserved leaves 68 GiB for the estimate. The model's
weights fit within that, but eight requests of this length take the weight-plus-
cache estimate to 81.02 GiB. This is the sort of distinction I wanted the tool
to make visible before renting a GPU.

## Checking the estimate on a GPU

For the first experiment, I used a RunPod NVIDIA A40 with 44.99 GiB of visible memory,
vLLM 0.11.0, and BF16 weights and cache. I tested pinned revisions of Qwen3-4B
and DeepSeek-R1-Distill-Llama-8B.

GuideLLM generated three workloads for each model:

| Case | Concurrent requests | Input tokens | Output tokens |
| --- | ---: | ---: | ---: |
| A | 1 | 512 | 128 |
| B | 8 | 512 | 128 |
| C | 8 | 4,096 | 256 |

Each measured case ran for three minutes, following a warmup for the model.
Alongside the client benchmark, I sampled vLLM's running requests, waiting
requests, cache occupancy and preemptions.

I compared the two components separately. The startup logs reported model
allocations of 7.5552 GiB for Qwen and 14.9889 GiB for DeepSeek, against predicted
weights of 7.4924 and 14.9575 GiB. Both were within 0.9%, although parameter bytes
and runtime model-loading allocations are related rather than identical quantities.

For KV cache, I used vLLM's occupancy metrics to infer how many cache blocks were
in use. Each block holds 16 token positions, so the conversion is:

```text
occupied KV bytes = occupied blocks × 16 × KV bytes per token
```

For Qwen3-4B, each token needs 144 KiB, making each block 2.25 MiB. Case A peaked
at 41 occupied blocks: 92.25 MiB, or 0.09009 GiB. The table uses this calculation
for each model; it is not a separate measurement of total GPU memory.

| Model | Case | Predicted KV (GiB) | Peak occupied KV (GiB) | Difference from vramfit prediction |
| --- | --- | ---: | ---: | ---: |
| Qwen3-4B | A | 0.08789 | 0.09009 | +2.50% |
| Qwen3-4B | B | 0.70312 | 0.72070 | +2.50% |
| Qwen3-4B | C | 4.78125 | 4.79883 | +0.37% |
| Distill-Llama-8B | A | 0.07812 | 0.08008 | +2.50% |
| Distill-Llama-8B | B | 0.62500 | 0.64062 | +2.50% |
| Distill-Llama-8B | C | 4.25000 | 4.25391 | +0.09% |

### Where the extra bytes came from

The short cases were consistently 2.5% above the estimate. In this benchmark,
inputs passed through each model's chat template, adding eight tokens for Qwen
and four for DeepSeek. vLLM then allocates cache in 16-token blocks. A nominal 512-token input plus 128-token output therefore
requires 656 token slots after formatting and rounding, rather than 640:

```text
(656 - 640) / 640 = 2.5%
```

For the longer case, the corresponding full-length allocation is 4,368 slots
rather than 4,352, a difference of about 0.37%.

DeepSeek's observed long-case peak was lower than that full allocation across
all eight requests. Requests need not reach maximum length together, and samples
can miss peaks. Its smaller 0.09% difference does not establish that the
estimator is more accurate for that model.

These results gave me confidence in the component calculations for these
workloads. They did not establish total GPU memory accuracy: occupied KV was
inferred from the engine's block metrics, and runtime overhead remained outside
the estimate.

## A successful request is not enough

Both models had enough cache for the baseline workloads. I wanted to see what
happened as the requested concurrency exceeded the available cache.

I ran a second experiment with Qwen3-4B, explicitly limiting its KV cache to
2 GiB. Requests used 4,104 actual input tokens after chat formatting and 256
output tokens. Each full sequence needed 273 blocks. The pool provided 909
usable blocks:

```text
3 requests × 273 blocks =   819 blocks: fits
4 requests × 273 blocks = 1,092 blocks: exceeds the pool
```

I ran three concurrent requests, then four, then repeated three. Finally, I
increased the cache to 4 GiB and offered four requests again. The server's maximum
running-sequence setting stayed at eight, above both tested concurrency levels.

| Cache | Offered concurrency | Peak running | Samples with waiting requests |
| --- | ---: | ---: | ---: |
| 2 GiB | 3 | 3 | 0.0% |
| 2 GiB | 4 | 3 | 88.1% |
| 2 GiB, repeat | 3 | 3 | 0.0% |
| 4 GiB | 4 | 4 | 4.9% |

With four requests offered to the 2 GiB pool, only three ran at once. Requests
still completed without reported errors or preemptions; the excess demand
waited. A client success count alone would have missed the capacity problem.

The pressure also appeared before cache occupancy reached 100%. Three full
sequences occupied 819 blocks, leaving 90. That free space was too small for
another complete 257-block prompt. Some free memory does not necessarily mean
there is room to admit another request.

Repeating the three-request case removed the sustained queueing. Increasing the
pool to 4 GiB allowed four requests to run together.

## What I learned

I started with “does this model fit?” I now want the input and output lengths,
precision, and simultaneous request count alongside the model name.

The calculation helps establish a budget. The engine measurements tell me how
that budget behaves under load. I want to distinguish cache reserved by the
server from cache occupied by requests, and I want to see waiting requests as
well as successful completions.

The tests here cover two models on one GPU. They do not establish accuracy for
every supported architecture, quantify all runtime overhead, or give confidence
intervals for throughput. Quantization and multi-GPU serving remain outside the
tool's scope.

Within that scope, the simple calculation was useful: the component estimates
were close, and the boundary experiment explained why a workload can keep
returning answers while failing to achieve its requested concurrency.

The [code is on GitHub](https://github.com/tayoogunbiyi/vramfit). The
[validation notes](https://github.com/tayoogunbiyi/vramfit/blob/main/validation/README.md)
include the recorded results, model revisions, commands and steps to reproduce
the experiments. You can run the estimator without a GPU, then check the serving
configuration you actually intend to use.
